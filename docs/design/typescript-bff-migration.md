# TypeScript BFF Migration

Date: 2026-08-15

Status: approved for implementation

## Understanding summary

- Remove speech-to-text support completely before changing backend technology.
- Keep the application as a pure client of a separately deployed, official Hermes Agent container.
- Preserve every non-voice feature and every public UI/BFF HTTP contract.
- Migrate the UI's minimum backend from Python/FastAPI to TypeScript on Node.js 24.
- Keep the deployment suitable for one user on a private local NAS, with web and PWA clients.
- Preserve push subscriptions, VAPID keys, proactive-message idempotency, SSE behavior, and notification deep links.
- Deliver the runtime work as two independently verifiable commits, followed by three feature commits for pinned chats, paginated history, and durable images.

## Assumptions and constraints

- The Hermes Agent image, filesystem, and runtime remain free of this project's components.
- The UI container may read the Hermes `config.yaml` through its existing read-only mount.
- The Hermes API and UI containers share a Docker network and authenticate with a Bearer API key.
- A single Node.js process is enough; Redis, an external database, and a distributed stream registry are out of scope.
- The existing JSON files under `/app/data` are the compatibility contract for persisted UI state.
- Explicit upstream failures must be visible to the user. Secrets must never appear in responses or logs.
- Deploying to the NAS or changing running containers remains a manual user action.
- Message history is displayed in pages of 30 normalized UI messages, even when one UI message spans multiple Hermes rows.
- Image persistence applies to images sent after the feature is deployed; images already absent from Hermes cannot be recovered.

## Approaches considered

### Hono on Node.js 24 — selected

Hono provides a small Web-standards API, direct support for streaming responses, and an application object that can be exercised without opening a network port. It keeps the BFF compact while avoiding a custom router and middleware stack.

### Fastify

Fastify offers a mature plugin ecosystem and strong schema support, but adds more framework surface than this single-user BFF needs.

### Native `node:http`

The native server would minimize dependencies but would require custom routing, body handling, error boundaries, static delivery, and test plumbing. That code would increase maintenance risk without improving the product.

## Commit 1: remove speech-to-text

The first commit removes only voice functionality and its supporting dependencies:

- remove microphone, recording, upload, retry, and transcription states from the React UI;
- remove voice hooks, audio API helpers, translations, types, and tests;
- remove `/api/audio/capabilities` and `/api/audio/transcriptions`;
- remove the Hermes STT adapter and its backend tests;
- remove the `hermes-agent[voice]` package, voice cache, temporary audio directory, `.env` mount, and related documentation;
- leave the remaining FastAPI BFF operational until its replacement is verified.

The BFF will own a small, documented list of every currently known Hermes reasoning effort:

`none`, `minimal`, `low`, `medium`, `high`, `xhigh`, `max`, and `ultra`.

The final two levels will be marked as dependent on Hermes compatibility until the upstream API reports them as supported. The selected value is forwarded unchanged. There is no silent fallback.

The read-only `config.yaml` mount remains so the UI can display the effective Hermes reasoning default without exposing the configuration contents.

## Commit 2: migrate the BFF to TypeScript

The TypeScript server will be organized by responsibility:

- `server/app.ts`: Hono application factory and route composition;
- `server/index.ts`: process startup, HTTP listener, and graceful shutdown;
- `server/hermes-client.ts`: authenticated Hermes requests and safe error translation;
- `server/routes/`: sessions, model catalog, notifications, and proactive messages;
- `server/services/`: streaming, reasoning reconciliation, Web Push, dashboard integration, and JSON persistence;
- `server/config/`: validated environment variables and safe YAML projection.

The Hono process serves both `/api` routes and the compiled Vite assets. SPA fallback applies only to browser navigation and must never turn an unknown API route into `index.html`.

Endpoint paths, request bodies, response bodies, status codes, SSE event names, and persisted file formats remain compatible with the Python implementation. Python files and dependencies are removed only after the TypeScript contract tests pass.

The final UI image contains Node.js 24 and compiled JavaScript only. No Python runtime, Hermes package, Whisper model, or STT cache remains.

## Post-migration feature commits

### Commit 3: pinned conversation actions

The UI preserves the native Hermes `pinned` session field. Pinned conversations appear before unpinned conversations; each group is ordered by descending `last_active`. Session pages are always deduplicated by ID because Hermes can back-fill pinned conversations beyond a page's normal recency window.

On hover-capable desktop devices, a vertical-ellipsis button appears on conversation hover or keyboard focus and opens an anchored popover. The icon is white on ordinary chats and black on the selected chat, matching its title. Its trigger remains transparent; only a direct pointer hover on the trigger reveals a border matching the icon color. Hovering the conversation card alone does not reveal the border. On touch/PWA devices, a roughly 500 ms press opens a bottom sheet; pointer movement that indicates scrolling cancels the gesture. Both surfaces contain Pin/Unpin, Rename, and Delete. Menus close after an action, an outside interaction, `Escape`, conversation navigation, or sidebar closure.

Pinning updates optimistically and rolls back on upstream failure. Rename uses the existing title API and reports conflicts. Delete requires confirmation; after Hermes confirms deletion, locally stored attachments for that session are removed. A subtle pin icon exposes the current state.

### Commit 4: paginated conversation history

Opening a conversation immediately clears the previous transcript, shows a skeleton, and disables the composer. The client requests recent Hermes rows with `order=latest`, retains the raw rows, normalizes tool activity and assistant fragments across page boundaries, and renders the latest 30 visual messages. It fetches more raw rows only when needed to form those 30 messages.

Reaching the top reveals up to 30 older normalized messages from the local cache, then requests another raw page if required. Rows are deduplicated by Hermes message ID. The scroll-height delta is applied after prepending so the user's viewport does not jump. A short page marks the start of history; a failed older-page request leaves existing messages intact and exposes Retry.

Streaming and visibility reconciliation query only the recent window needed to merge new IDs. A stale response from a previously selected conversation can never overwrite the active conversation.

### Commit 5: durable conversation images

Before forwarding multimodal input, the BFF validates each supported `data:` image, writes it atomically under `/app/data/attachments/blobs` using a random asset ID, and records only safe metadata in an atomic JSON index. It captures the latest Hermes message ID before submission and, after persistence, associates pending assets with the first subsequent user message. Association and cleanup continue when the browser disconnects.

The history adapter preserves images returned by Hermes and reconstructs missing image parts from the local index. Files are served by opaque asset ID with a fixed MIME allowlist, private caching, and no caller-controlled filesystem path. Failed, unpersisted submissions discard pending files. Successful session deletion removes its attachment records and blobs; conservative cleanup removes abandoned temporary files without touching bound assets.

Every rendered conversation image can open an accessible responsive lightbox. The lightbox locks background scrolling and closes through an outside click/tap or `Escape`. Gallery navigation, image editing, and recovery of already-lost attachments are out of scope.

## Chat and streaming flow

The browser submits a message to the existing UI route. The BFF adds only options explicitly selected for that conversation: the model, its matching provider, and the reasoning effort. It then opens the Hermes session stream.

Once Hermes has accepted the request, browser disconnection does not cancel the upstream run. The BFF keeps consuming the stream so Hermes can complete and persist the response, reasoning reconciliation can continue, and completion notifications can be sent.

Native Hermes SSE frames pass through unchanged where possible. The BFF continues polling the persisted session messages during a run and emits synthetic `reasoning.snapshot` frames when the canonical reasoning advances. The in-memory active-stream registry is released after completion, upstream failure, or explicit cancellation.

## Error handling

- Connection or authentication failures are mapped to controlled `401`, `502`, or `503` responses without secret material.
- An HTTP rejection, SSE error event, or premature upstream termination for a selected model or reasoning effort becomes a visible conversation error naming the rejected selection.
- Model and reasoning choices never fall back silently.
- `max` and `ultra` may be silently ignored by Hermes versions whose session parser does not accept them. The UI therefore describes their compatibility as server-dependent rather than claiming they were applied.
- Malformed persisted JSON produces a controlled diagnostic and is not automatically overwritten.

## Persistence and security

The existing push subscription, VAPID key, and proactive idempotency JSON formats are retained. Writes use a temporary file in the same directory followed by an atomic rename.

`HERMES_API_KEY` remains server-only and is used solely for authenticated requests to Hermes. `HERMES_PUSH_API_KEY` protects proactive-notification endpoints. Comparisons use a timing-safe operation. Neither key is emitted through runtime configuration, HTTP errors, or logs.

The Hermes YAML reader returns only the model/provider and reasoning-default projection required by the UI. It never returns raw configuration or credential fields.

## Runtime and shutdown

One Node.js process owns the HTTP server and in-memory stream registry. On `SIGTERM` or `SIGINT`, it stops accepting new requests and allows a short bounded interval for active work before exiting. It never blocks a container redeploy indefinitely.

The UI Compose file retains `/app/data` and the read-only `config.yaml` mount. It removes the voice cache and Hermes `.env` mount. The Hermes Agent Compose and image are not modified.

## Verification strategy

Commit 1 must pass frontend tests, remaining Python tests, lint, type-check, the Vite build, and an image build without Hermes or voice dependencies. A repository search must find no active STT, audio route, microphone, Hugging Face, or voice-cache references.

For commit 2, existing Python tests act as behavioral specifications and are replaced by TypeScript equivalents. Coverage includes:

- proxy authentication and status translation;
- session CRUD and model/provider pairing;
- all eight known reasoning levels and explicit rejection paths;
- SSE forwarding, browser disconnects, and reasoning snapshots;
- push presence, VAPID compatibility, proactive idempotency, and session deep links;
- atomic persistence and malformed-file handling;
- static assets, SPA fallback, and graceful shutdown.

The three feature commits additionally cover native pin persistence and ordering, desktop and touch menu interactions, normalized 30-message pages, tool-call page boundaries, scroll anchoring, attachment path safety, disconnect-safe association, deletion cleanup, and accessible lightbox interaction.

The final gate runs lint, type-check, all tests, production builds, the Docker image build, and `docker compose config`. No NAS deployment is performed by this project work.

## Decision log

1. **Remove STT before migration.** A clean feature-removal commit reduces the migration surface and permits a Node-only result.
2. **Use two commits.** STT removal and backend migration remain independently reviewable and reversible.
3. **Use Hono on Node.js 24.** It provides the required routing, Web-streaming primitives, and direct application testing with little framework overhead.
4. **Keep the BFF.** It protects credentials, owns push state, preserves upstream runs across browser disconnects, reconciles reasoning, and serves the PWA.
5. **Keep all known reasoning efforts in code.** This preserves access to Hermes' documented range without a Python compatibility package.
6. **Do not silently fall back.** Explicit upstream rejection is shown to the user; `max` and `ultra` are identified as server-dependent because older session parsers can ignore them.
7. **Preserve wire and disk contracts.** Existing frontend behavior, endpoints, SSE frames, VAPID material, subscriptions, and idempotency data survive the runtime migration.
8. **Do not modify Hermes Agent.** The official container remains separately deployed and contains no UI project code.
9. **Use Hermes-native pinning and pagination.** The UI does not duplicate session flags or conversation history in its own database.
10. **Order pinned conversations by recent activity.** Multiple pinned chats remain useful without introducing a separate manual pin order.
11. **Page by 30 visual messages.** Raw Hermes rows remain available to normalize tool turns correctly across page boundaries.
12. **Persist only attachment data locally.** A file store and atomic JSON index close the observed Hermes media gap without creating a parallel conversation database.
13. **Use device capabilities for the action surface.** Hover/fine-pointer devices receive a popover; touch devices receive long-press and a bottom sheet.
14. **Ship post-migration features separately.** Pin actions, lazy history, and durable images are independent commits after the TypeScript migration.

## Explicit non-goals

- Selecting or implementing a replacement STT engine.
- Adding multi-user authentication, distributed state, Redis, or a database.
- Redesigning the UI or changing unrelated chat behavior.
- Writing configuration back into the Hermes container.
- Deploying or mutating containers on the NAS.
- Recovering images that neither Hermes nor the browser still possesses.
- Adding image gallery navigation, editing, or a dedicated download workflow.
