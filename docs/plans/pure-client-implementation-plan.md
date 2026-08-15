# Pure-client implementation plan

Status: superseded on 2026-08-15

Depends on: [validated architecture](../design/pure-client-architecture.md)

Date: 2026-08-09

> This historical plan describes the original Python/STT migration. The active
> delivery plan is [TypeScript BFF implementation plan](typescript-bff-implementation-plan.md).

> Implementation note: the UI/container split, restricted catalog proxy,
> provider/model/reasoning controls, STT compatibility boundary, Push storage,
> and reasoning regression are implemented. The current Hermes `/v1/runs`
> implementation does not persist turns to Sessions, so the production chat
> transport remains the canonical session stream. Do not switch to the staged
> a `RunCoordinator` until a pinned-image contract test demonstrates session
> persistence for runs. The unused staged implementation was removed so the
> production BFF does not open an unnecessary second SQLite database.
> Proactive messages now enter through an authenticated BFF endpoint, are
> imported as literal assistant sessions through the official dashboard, and
> then produce Web Push with a canonical session deep link. Sessions API SSE
> reasoning/tool variants are normalized live, and both disclosure panels
> start collapsed.

## Outcome

Deliver two independently deployable services:

1. `hermes-agent`: the unmodified official Hermes image, owning agent runtime,
   dashboard, tools, workspace, configuration, and canonical data.
2. `hermes-chat-ui`: the frontend and a minimal BFF, owning browser-facing
   security, run snapshots, Web Push, and the temporary STT compatibility
   adapter.

No migration or copy of Hermes sessions is required. The existing host data
directory continues to mount at `/opt/data` in the official agent container.

## Delivery strategy

Implement behind explicit capability and feature gates, in the order below.
Every phase must pass its acceptance gate before the next phase begins.

## Phase 0 — Pin the contract and establish a baseline

### Discovery status (2026-08-09)

- The latest published release tag discovered during planning, `v2026.6.5`,
  provides the runs API but does **not** advertise `/api/model/options` or the
  session model-lock endpoint. It is therefore below this project's supported
  contract and must not be selected for this migration.
- The current official `latest` multi-platform index candidate is
  `sha256:85e114f9edca6fd3b9b377a624ab0d0fa4919a0ac86b5e4e4144b43eb7355f00`.
  This is a candidate only: the exact platform image must pass the Phase 0
  contract smoke test before it is pinned in Compose.
- The local development image is older (`v0.14.0`) and also cannot be used to
  validate the target catalog/model-lock contract.

### Work

- Select and pin a released Hermes image by tag and digest. Do not implement
  against a moving `latest` image.
- Record the minimum required capability flags and endpoints:
  - session resources, messages, create, patch, delete, and model lock;
  - `/api/model/options`;
  - runs, run status, event SSE, approval, and stop;
  - model/provider/reasoning request options.
- Capture sanitized fixtures from the pinned Hermes release for:
  - capabilities;
  - model options;
  - session resources and messages;
  - all run event variants used by the UI.
- Inventory the actual NAS STT configuration before changing the image:
  provider, model, language, credential variable, local model/cache needs, and
  any custom-command or plugin dependency.
- Run and record the existing test suite and manually reproduce the reasoning
  bug before changing behavior.

### Acceptance gate

- The selected Hermes digest passes a contract smoke test.
- The current STT provider can be exercised in an isolated proof of concept
  using a read-only configuration source.
- Existing chat, images, voice, push, history, and deletion behavior have a
  written baseline.

## Phase 1 — Split the image and deployment boundary

### Work

- Replace the final stage of `Dockerfile`, which currently derives from Hermes,
  with a small Python runtime containing the built SPA and BFF only.
- Remove agent startup from `entrypoint.sh`.
- Remove `scripts/00-inject-config`; the UI must never edit Hermes config.
- Keep a simple UI entrypoint that starts only FastAPI/uvicorn.
- Run the UI as a non-root user, with writable locations limited to operational
  data, STT cache, and temporary files.
- Add a UI health endpoint separating:
  - UI liveness;
  - Hermes connectivity/capabilities;
  - STT compatibility;
  - push readiness.
- Update `docker-compose.hermes-agent.example.yml`,
  `docker-compose.ui.example.yml`, `.env.example`, and the README for two
  services and a private bridge network.

### Acceptance gate

- No Hermes agent, gateway, dashboard, or scheduler process exists in the UI
  image.
- The UI container can be built and started while Hermes is stopped.
- The official Hermes container contains no file, plugin, or script supplied by
  this project.

## Phase 2 — Replace the broad proxy with a restricted Hermes client

### Work

- Refactor `backend/hermes_client.py` into a typed, allowlisted client for the
  accepted Hermes API contract.
- Keep the bearer token only in the BFF environment.
- Proxy or adapt only the routes required for capabilities, sessions, messages,
  model options, model lock, runs, approval, and stop.
- Preserve upstream status codes and safe structured errors while redacting
  URLs, credentials, commands, and provider secrets from logs.
- Apply request limits separately for JSON, images, and audio.
- Replace the custom `/api/models` implementation with the official
  `/api/model/options` payload.
- Fail startup readiness clearly when the minimum Hermes contract is absent,
  without taking down the UI liveness endpoint.

### Acceptance gate

- Browser network traffic never contains `API_SERVER_KEY`.
- An arbitrary path cannot be relayed through the BFF.
- Contract tests pass against both fixtures and the pinned real Hermes image.

## Phase 3 — Add durable operational run coordination

### Work

- Add an operational store owned by the UI. It is not a conversation database.
- Store only bounded data needed for active/recent runs:
  - client request ID;
  - session ID and run ID;
  - status and timestamps;
  - confirmed runtime selection;
  - consolidated assistant text, reasoning, tools, and pending approval;
  - notification state.
- Enforce one active run per session in a transaction.
- Make submission idempotent by client request ID.
- Start detached Hermes runs and attach exactly one upstream event consumer.
- Broadcast a snapshot followed by live events to any visible tabs.
- Coalesce text/reasoning deltas and cap snapshot size and retention.
- On BFF startup, inspect non-terminal rows:
  - poll Hermes run status;
  - reconcile canonical session messages;
  - resume status polling when SSE replay is unavailable;
  - mark unknown runs interrupted rather than completed.
- Route stop and approval through the official run endpoints.
- Stop an active run before canonical session deletion.

### Acceptance gate

- Refresh and multiple tabs do not duplicate a run.
- Closing the PWA does not stop the Hermes run.
- Restarting the UI container preserves Hermes execution and eventually
  reconciles the canonical result.
- Missing deltas during UI downtime are not fabricated.

## Phase 4 — Refactor frontend run state and fix reasoning

### Work

- Replace callback-driven mutation in `useHermesStream.ts` with a pure event
  reducer and a reconnecting run subscription hook.
- Represent queued, running, waiting-for-approval, stopping, completed, failed,
  interrupted, and cancelled states explicitly.
- Create the assistant shell immediately after an accepted submission.
- Render a collapsed reasoning panel from the beginning of generation.
- Map live `reasoning.available` events to that panel.
- Show agent activity only after a tool event.
- Keep `Gerando resposta...` as the general run state and remove it only at a
  terminal state.
- Remove an empty reasoning panel after completion when the model exposed none.
- Reconcile optimistic IDs with canonical Hermes message IDs after completion.
- Preserve current image compression, drafts, scroll behavior, and stop/delete
  interactions.

### Acceptance gate

- The reported reasoning bug has a regression test.
- Reasoning, tools, final response, refresh, and cancellation render identically
  from live events and restored snapshots.
- Existing history normalization still reconstructs canonical tool turns.

## Phase 5 — Provider, model, and reasoning controls

### Work

- Replace `useModels.ts` with a provider-aware runtime catalog hook backed only
  by `/api/model/options`.
- Add validated schemas for provider rows, models, authentication state,
  capability hints, and current global defaults.
- Add a provider-grouped Model selector and a Reasoning control to the composer.
- Keep the sidebar as the same provider-grouped model selector for future
  conversations. Its initial visual choice uses the Hermes global default.
- Resolve both the global default and an explicit browser preference to one
  concrete provider/model pair, then send it atomically as a confirmed
  per-session lock when creating the next session.
- Persist an explicit per-session change with the official model-lock endpoint.
- Never send a model without its confirmed provider. Preserve the pair when
  Hermes' client-safe session response omits provider metadata.
- Disable runtime changes while a run is active.
- Roll controls back to the confirmed state when Hermes rejects a lock.
- Add English and Brazilian Portuguese strings and accessible labels.

### Acceptance gate

- A new session resolves the global Hermes default that exists at creation and
  retains that confirmed pair afterward, unless the user selects a local
  future-session model preference.
- A per-session provider/model/reasoning selection survives refresh.
- Provider secrets never appear in frontend data, logs, or error messages.
- Unsupported reasoning choices are not offered.

## Phase 6 — Isolate the STT compatibility adapter

### Work

- Package only the Hermes-compatible STT boundary and its required dependencies
  in the UI image; do not add a Hermes entrypoint or agent process.
- Pin this compatibility dependency to the release validated in Phase 0.
- Read the host `config.yaml` from a dedicated read-only path.
- Pass only the credential variables required by the configured STT provider to
  the UI container. Prefer a voice-specific credential such as
  `VOICE_TOOLS_OPENAI_KEY` over sharing a general model-provider key.
- Give the UI its own writable STT cache and `/tmp`.
- Reload configuration by file change or per request so dashboard edits take
  effect without rebuilding the UI image.
- Preserve size limits, single-transcription locking, retry behavior, transcript
  review, silence handling, and guaranteed temporary-file deletion.
- Report STT version/config compatibility without returning credentials.
- Document an upgrade check whenever either Hermes image changes.

### Acceptance gate

- The actual NAS provider/model/language produces equivalent transcripts.
- The Hermes configuration mount is read-only and unchanged after testing.
- Chat remains healthy when the STT adapter is deliberately made unavailable.
- No Hermes runtime process runs in the UI container.

## Phase 7 — Rebase Web Push on run state

### Work

- Move completion detection from the attached session stream to terminal run
  state plus canonical-history reconciliation.
- Store subscriptions, visibility, run notification state, and VAPID material
  in the UI operational volume.
- Make notification intent idempotent by run ID before attempting delivery.
- Suppress notification when any registered client is visibly active.
- Resume checks for non-terminal runs after UI restart.
- Keep notification preview bounded and free of reasoning/tool payloads.

### Acceptance gate

- One and only one notification is sent for a background completion.
- Refresh, multiple tabs, retry, and UI restart do not duplicate it.
- No notification is emitted for cancelled, failed, or visible-client runs.

## Phase 8 — Integration, security, and release

### Work

- Add end-to-end tests using the pinned Hermes image and the split Compose file.
- Test sessions created by UI, CLI, dashboard, cron, and subagents.
- Test provider/model/reasoning locks, approvals, images, voice, push,
  cancellation, deletion, refresh, multiple tabs, and both service restarts.
- Run dependency and container vulnerability checks.
- Verify both images run without unnecessary Linux capabilities.
- Document backup, migration, health checks, logs, upgrade ordering, rollback,
  and known event-replay limitations.
- Publish the UI image with a compatibility label/range for Hermes.
- Pin both deployed images by tag and digest.

### Acceptance gate

- Frontend tests, backend tests, type-check, lint, production build, contract
  tests, and split-deployment smoke tests all pass.
- The migration and rollback procedures are exercised with a copy of the NAS
  data directory before production cutover.

## Target Compose topology for the NAS

The following is the target structure, not a ready-to-run file until the image
tags, exact STT credential, dashboard URL, and health paths are finalized during
implementation.

```yaml
services:
  hermes-agent:
    image: nousresearch/hermes-agent:${HERMES_AGENT_VERSION}
    container_name: hermes-agent
    restart: unless-stopped
    tty: true
    stdin_open: true
    command: ["gateway", "run"]

    ports:
      - "${DASHBOARD_PORT:-9119}:9119"
      # Optional diagnostics/API access from the NAS host only:
      # - "127.0.0.1:${BACKEND_PORT:-8642}:8642"

    volumes:
      - /volume2/docker_ssd/hermes/config:/opt/data
      - /volume2/docker_ssd/hermes/workspace:/opt/data/workspace
      - /volume2/docker_ssd/hermes/scripts/01a-nextcloud-group:/etc/cont-init.d/01a-nextcloud-group:ro
      - /volume1/docker/nextcloud/data/lucas/files/Obsidian/knowledge-base:/knowledge-base-ro:ro
      - /volume1/docker/nextcloud/data/lucas/files/Obsidian/knowledge-base/.git:/knowledge-base-git:rw

    group_add:
      - "33"

    environment:
      HERMES_UID: ${HERMES_UID}
      HERMES_GID: ${HERMES_GID}
      HERMES_HOME: /opt/data
      UV_CACHE_DIR: ${UV_CACHE_DIR}
      HERMES_ACCEPT_HOOKS: "1"

      API_SERVER_ENABLED: "true"
      API_SERVER_KEY: ${API_SERVER_KEY}
      API_SERVER_HOST: 0.0.0.0
      API_SERVER_PORT: 8642
      API_SERVER_MODEL_NAME: ${API_SERVER_MODEL_NAME:-hermes-agent}

      HERMES_DASHBOARD: "1"
      HERMES_DASHBOARD_HOST: 0.0.0.0
      HERMES_DASHBOARD_PORT: 9119
      HERMES_DASHBOARD_BASIC_AUTH_USERNAME: ${HERMES_DASHBOARD_USER}
      HERMES_DASHBOARD_BASIC_AUTH_PASSWORD: ${HERMES_DASHBOARD_PASSWORD}
      HERMES_DASHBOARD_BASIC_AUTH_SECRET: ${HERMES_DASHBOARD_BASIC_AUTH_SECRET}

      # Agent/tool integrations stay only on hermes-agent.
      HA_URL: ${HA_URL}
      HA_TOKEN: ${HA_TOKEN}
      HASS_URL: ${HA_URL}
      HASS_TOKEN: ${HA_TOKEN}
      PORTAINER_TOKEN: ${PORTAINER_TOKEN}
      KITCHENOWL_URL: ${KITCHENOWL_URL}
      KITCHENOWL_TOKEN: ${KITCHENOWL_TOKEN}
      KITCHENOWL_INSIGHTS_URL: ${KITCHENOWL_INSIGHTS_URL}
      CALDAV_MCP_URL: ${CALDAV_MCP_URL}
      NEXTCLOUD_MCP_URL: ${NEXTCLOUD_MCP_URL}

      # Add the current STT credential here as today, for example:
      # VOICE_TOOLS_OPENAI_KEY: ${VOICE_TOOLS_OPENAI_KEY}

    healthcheck:
      test: ["CMD", "curl", "-fsS", "http://127.0.0.1:8642/health"]
      interval: 15s
      timeout: 5s
      retries: 10
      start_period: 30s

    networks:
      - hermes-internal

  hermes-chat-ui:
    image: ghcr.io/lukegskw/hermes-chat-ui:${HERMES_CHAT_UI_VERSION}
    container_name: hermes-chat-ui
    restart: unless-stopped

    depends_on:
      hermes-agent:
        condition: service_healthy

    ports:
      - "${PROXY_PORT:-8643}:8643"

    environment:
      HERMES_API_URL: http://hermes-agent:8642
      HERMES_API_KEY: ${API_SERVER_KEY}
      HERMES_DASHBOARD_URL: ${HERMES_DASHBOARD_URL}
      HERMES_CONFIG_PATH: /hermes-config/config.yaml
      UI_DATA_DIR: /app/data
      STT_CACHE_DIR: /app/cache/stt
      HERMES_PROXY_PORT: 8643

      VAPID_SUBJECT: ${VAPID_SUBJECT}
      VAPID_KEYS_FILE: /app/data/vapid_keys.json
      SUBSCRIPTIONS_FILE: /app/data/push_subscriptions.json
      HERMES_PUSH_API_KEY: ${HERMES_PUSH_API_KEY:-}

      # Pass only the credential selected by stt.provider, for example:
      # VOICE_TOOLS_OPENAI_KEY: ${VOICE_TOOLS_OPENAI_KEY}

    volumes:
      - /volume2/docker_ssd/hermes/config/config.yaml:/hermes-config/config.yaml:ro
      - /volume2/docker_ssd/hermes-chat-ui/data:/app/data
      - /volume2/docker_ssd/hermes-chat-ui/cache:/app/cache

    tmpfs:
      - /tmp:size=64m,mode=1777

    read_only: true
    cap_drop:
      - ALL
    security_opt:
      - no-new-privileges:true

    healthcheck:
      test: ["CMD", "curl", "-fsS", "http://127.0.0.1:8643/api/health/live"]
      interval: 15s
      timeout: 5s
      retries: 5

    networks:
      - hermes-internal

networks:
  hermes-internal:
    driver: bridge
```

## Environment-variable migration

| Current variable/use                        | Target                                                                                             |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| UI image starts Hermes itself               | Official service runs `gateway run`; UI starts only FastAPI                                        |
| `HERMES_PROXY_PORT` on Hermes               | Move to the UI service only                                                                        |
| `HERMES_API_KEY` and `API_SERVER_KEY` mixed | `API_SERVER_KEY` on Hermes; `HERMES_API_KEY` on UI, both sourced from the same secret              |
| `API_SERVER_CORS_ORIGINS=*`                 | Remove; browser no longer calls Hermes directly                                                    |
| `HERMES_DASHBOARD_USER/PASSWORD`            | Map to official `HERMES_DASHBOARD_BASIC_AUTH_USERNAME/PASSWORD`                                    |
| Generated dashboard secret                  | Add a stable `HERMES_DASHBOARD_BASIC_AUTH_SECRET`                                                  |
| `HERMES_SAFETY_MODE=manual`                 | Remove; keep Hermes approval defaults/config. Do not replace with `HERMES_SAFE_MODE`               |
| `--accept-hooks` in the UI entrypoint       | Use official `HERMES_ACCEPT_HOOKS=1` only if this remains intended                                 |
| `HA_URL` / `HA_TOKEN`                       | Audit custom consumers; provide official `HASS_URL` / `HASS_TOKEN` during compatibility transition |
| Tool/MCP secrets in the unified service     | Keep on `hermes-agent` only                                                                        |
| STT credential in the unified service       | Pass only the required STT credential to both services                                             |
| `BACKEND_PORT:8642` published on the NAS    | Remove, or bind to host loopback only if external diagnostics are required                         |

## Production migration procedure

### 1. Prepare without touching production

- Choose pinned Hermes and UI tags/digests.
- Generate and save a stable dashboard Basic Auth secret.
- Create `/volume2/docker_ssd/hermes-chat-ui/data` and `cache` with ownership
  matching the future UI runtime user.
- Validate the split Compose against a copy of the Hermes data directory.
- Confirm the custom `01a-nextcloud-group` init script remains compatible with
  the selected official Hermes image. It is user infrastructure, not a UI
  component, and remains mounted only on `hermes-agent`.

### 2. Back up and record rollback inputs

- Stop new user activity.
- Record the current all-in-one image digest and full effective Compose config.
- Back up `/volume2/docker_ssd/hermes/config`, workspace metadata, and the UI
  push/VAPID data used by the current deployment.
- Verify the backup can be listed/read before continuing.

### 3. Stop the unified gateway

- Stop the old service cleanly and wait for active runs to finish or cancel
  them deliberately.
- Never start the official gateway while the old gateway still uses the same
  `/opt/data`; two gateways must not write the same Hermes state concurrently.

### 4. Start only the official Hermes service

- Start `hermes-agent` and wait for its health check.
- Verify `/v1/capabilities`, dashboard login, canonical sessions, model options,
  tools, hooks, Nextcloud mounts, `.git` write access, UID/GID, and group `33`.
- Run one controlled CLI/dashboard turn before starting the UI.

### 5. Start the UI service

- Start `hermes-chat-ui` and inspect its composite readiness diagnostics.
- Verify the read-only config mount and STT compatibility report.
- Validate session list/history, a text run, reasoning, a tool run, image input,
  provider/model/reasoning lock, voice transcription, background push, stop,
  refresh, and restart recovery.

### 6. Soak and clean up

- Keep the old Compose file and pinned image digest available during a soak
  period.
- After acceptance, remove obsolete unified-service variables and the published
  Hermes API port if it is no longer used.
- Do not delete legacy UI data until rollback is no longer required.

## Rollback

1. Stop both split services.
2. Ensure no official Hermes gateway remains running.
3. Restore the previous Compose definition and exact all-in-one image digest.
4. Restore the data backup only if the split deployment performed an
   incompatible Hermes schema migration or validation finds corruption;
   otherwise prefer the current canonical data.
5. Start the previous service and verify sessions, dashboard, tools, voice, and
   push.

Rollback must never run old and new gateways simultaneously against
`/volume2/docker_ssd/hermes/config`.

## Definition of done

- The official Hermes container has no project-specific additions.
- Hermes and UI can be upgraded, restarted, and health-checked independently.
- The UI has no permanent conversation store and no browser-visible Hermes key.
- Provider/model controls use official Hermes contracts; reasoning values come
  from the version-pinned Hermes compatibility package intersected with the
  Sessions parser until Hermes publishes them in its catalog. Hermes 0.19 uses
  a conservative Sessions-contract fallback because it predates that parser
  export.
- The reasoning regression is fixed before and after refresh.
- Voice uses the same Hermes STT configuration through a read-only boundary.
- Background completion and Web Push survive browser closure and UI restart with
  the documented canonical-recovery semantics.
- The tested NAS Compose, migration guide, and rollback guide are committed.
