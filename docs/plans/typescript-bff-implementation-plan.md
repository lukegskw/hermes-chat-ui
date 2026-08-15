# TypeScript BFF implementation plan

Date: 2026-08-15

Status: ready for implementation

Depends on: [TypeScript BFF migration design](../design/typescript-bff-migration.md)

## Delivery sequence

The work is delivered as five ordered commits. Every commit must pass its gate before the next begins. Deployment to the NAS remains manual and is not part of this plan.

## Commit 1 — Remove speech-to-text

Planned commit: `refactor: remove speech-to-text support`

### Work

- Remove microphone controls, recording state, transcription APIs, translations, types, utilities, and tests.
- Remove FastAPI audio routes and the Hermes STT adapter.
- Remove the Hermes voice package, cache volume, `.env` mount, temporary audio directory, and STT documentation.
- Replace Python Hermes reasoning imports with the documented local efforts: `none`, `minimal`, `low`, `medium`, `high`, `xhigh`, `max`, and `ultra`.
- Mark `max` and `ultra` as dependent on server compatibility and expose explicit upstream failures without silent fallback.

### Gate

- Frontend tests, remaining Python tests, lint, type-check, Vite build, and Docker build pass.
- No active STT, audio route, microphone, Hugging Face, or voice-cache reference remains.
- All non-voice behavior remains operational.

## Commit 2 — Migrate the BFF to TypeScript

Planned commit: `refactor: migrate backend to TypeScript`

### Work

- Add the Hono application factory, Node.js 24 entrypoint, typed configuration, and allowlisted Hermes client.
- Port sessions, models, streaming, reasoning reconciliation, notifications, proactive messages, dashboard import, static assets, and SPA fallback.
- Preserve JSON storage formats, VAPID material, notification deep links, endpoint contracts, and SSE event shapes.
- Add graceful shutdown and bounded request/error handling.
- Replace Python tests with TypeScript contract tests, then remove Python and FastAPI from the repository and image.

### Gate

- Contract-equivalent tests cover every existing BFF route and stream lifecycle.
- Lint, type-check, tests, production build, Docker build, and Compose validation pass.
- The UI image contains no Python or Hermes package; the Hermes Agent image and Compose remain unmodified.

## Commit 3 — Add pinned conversation actions

Planned commit: `feat: add pinned conversation actions`

### Work

- Preserve the native Hermes `pinned` field and patch it through the session API.
- Sort pinned and unpinned groups independently by recent activity and deduplicate back-filled pins.
- Add the desktop hover/focus `...` popover.
- Add the touch/PWA long-press bottom sheet with scroll-gesture cancellation.
- Offer Pin/Unpin, Rename, and confirmed Delete; remove session attachments after confirmed deletion.

### Gate

- Pin state survives refresh and multiple pinned chats remain correctly ordered.
- Popover, bottom sheet, outside close, `Escape`, long press, ordinary tap, and scroll cancellation pass component tests.
- Upstream failures roll back state and remain visible.

## Commit 4 — Add paginated conversation history

Planned commit: `feat: add paginated conversation history`

### Work

- Add an initial conversation skeleton and disable the composer while loading.
- Fetch Hermes history with `limit`, `offset`, and `order=latest`.
- Retain and deduplicate raw message rows so normalization remains correct across tool-call page boundaries.
- Render 30 recent visual messages, then reveal/fetch older groups of 30 on upward scroll.
- Preserve the viewport after prepending, add retry, and prevent stale selection responses.
- Restrict stream/visibility reconciliation to the recent window required for canonical merging.

### Gate

- Tests cover exact visual page size, multi-row tool turns, exhausted history, retry, fast chat switching, new-message reconciliation, and scroll anchoring.
- Opening a long conversation no longer downloads or renders its complete history.

## Commit 5 — Persist and preview conversation images

Planned commit: `feat: persist and preview conversation images`

### Work

- Add an opaque-ID file store under `/app/data/attachments/blobs` and an atomic metadata index.
- Validate MIME, size, encoded data, and filesystem boundaries before persistence.
- Bind pending files to the persisted Hermes user-message ID, including after browser disconnect.
- Enrich history when Hermes omits previously submitted images and serve files through an allowlisted route with private caching.
- Clean failed pending files, deleted-session assets, and abandoned temporary files conservatively.
- Add a responsive accessible lightbox for every rendered image.

### Gate

- Images survive refresh and UI-container restart.
- Tests cover invalid content, path traversal, atomic writes, disconnect-safe binding, history reconstruction, cache headers, session cleanup, and lightbox mouse/touch/keyboard behavior.
- Final lint, type-check, tests, production build, Docker build, and Compose validation pass.

## Operational result

- `hermes-agent` remains the separately deployed, unmodified official image and canonical conversation store.
- `hermes-chat-ui` is a Node.js 24 TypeScript application with a minimal Hono BFF.
- `/app/data` retains push data, VAPID keys, proactive idempotency, and UI-owned image attachments.
- No STT implementation or Python runtime remains.
