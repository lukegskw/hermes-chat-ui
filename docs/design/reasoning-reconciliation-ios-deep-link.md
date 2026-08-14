# Live reasoning reconciliation and reliable iOS notification navigation

Date: 2026-08-13
Status: implemented

## Understanding summary

- The reasoning disclosure must exist immediately, start collapsed, and receive
  content while a Hermes turn is active.
- The deployed Hermes Sessions SSE emits tool lifecycle and assistant deltas,
  but no live reasoning event. Reasoning appears only in persisted messages and
  the terminal snapshot.
- Refresh appears to recover reasoning because the client reads the canonical
  session history, not because the original stream carried reasoning deltas.
- Hermes remains an unmodified official container. Compatibility behavior
  belongs to the separate UI BFF.
- A Web Push click must select its canonical session when the installed iOS PWA
  is suspended or fully closed.
- Query-string navigation alone is insufficient on iOS. Notification intent
  requires a durable service-worker-to-app handoff.
- Terminal Hermes history remains authoritative for final reconciliation.

## Assumptions and constraints

- One trusted user runs the application on a private network.
- A small number of read requests during an active generation is acceptable.
- Reasoning content and notification text must not be written to diagnostic
  logs or to the navigation handoff store.
- IndexedDB is available to both the service worker and the same-origin PWA.
- Missing or stale notification sessions degrade to the ordinary conversation
  list rather than blocking application startup.
- The fallback can expose only reasoning that Hermes has persisted. It cannot
  manufacture token-level events absent from the upstream transport.

## Evidence and root cause

The captured production stream contains `tool.started`, `tool.completed`, and
`assistant.delta`. It does not contain `reasoning.available`,
`tool.progress/_thinking`, or another live reasoning event before the terminal
snapshot. The existing frontend normalizer therefore has no reasoning payload
to reduce during the turn.

The installed iOS PWA opens after a notification click in both cold-start and
suspended-app scenarios, but the selected session is lost. The current service
worker relies on `client.navigate()` or `openWindow()` carrying
`/?session=...`; iOS can restore the standalone application without delivering
that URL to React.

## Approaches considered

### 1. BFF reconciliation plus durable PWA handoff — selected

Enrich the existing stream with canonical reasoning snapshots read from the
Sessions messages endpoint. Persist notification navigation intent in
IndexedDB and additionally signal open clients with `postMessage`.

This centralizes Hermes compatibility in the BFF, retains an event-oriented
frontend, and works for both PWA lifecycle states.

### 2. Frontend polling plus a `/session/:id` route

This is smaller in the BFF, but duplicates polling per tab, couples React to
Hermes persistence details, and still depends on iOS honoring restored routes.

### 3. Wait for an upstream Hermes fix

This keeps the client smaller but does not meet the current requirements. It
also does not address notification navigation.

## Final design

### Reasoning reconciliation

Before starting the upstream turn, the BFF records the current session-message
boundary. While the browser stream remains connected, one reconciliation task:

1. waits roughly 500 ms;
2. reads `GET /api/sessions/{id}/messages` at roughly 750 ms intervals;
3. permits only one in-flight read;
4. considers only messages after the recorded boundary;
5. accumulates assistant `reasoning_content`/`reasoning` for the current turn;
6. emits `event: reasoning.snapshot` only when the accumulated value changes.

The frontend continues to append native `reasoning.available` and
`tool.progress/_thinking` deltas. A `reasoning.snapshot` replaces the current
content, and `run.completed` performs terminal authoritative replacement.
Identical snapshots are ignored.

Polling ends on completion, cancellation, session deletion, or browser
disconnect. Temporary history-read errors never interrupt assistant streaming
and never log reasoning content. A final reconciliation is attempted when the
upstream stream completes.

### iOS notification navigation

Successful proactive push payloads include a dedicated `session_id` as well as
the existing URL fallback. On `notificationclick`, the service worker:

1. extracts the session ID from the dedicated field or URL;
2. stores `{sessionId, clickedAt}` in IndexedDB before navigation;
3. posts `{type: "open-session", sessionId}` to existing window clients;
4. focuses/navigates an existing client or opens the PWA as a fallback.

React listens for the service-worker message throughout app lifetime. On cold
start it resolves the newest valid target from the URL and IndexedDB, loads the
exact session when it is outside the first page, selects it, and then consumes
the target. A confirmed `404` clears the target and leaves the normal list
usable. A transient network failure retains it for another attempt. Old targets
expire. Only identifiers and timestamps enter the store.

The existing badge database is upgraded non-destructively with a navigation
store; upgrade code checks for existing stores before creating them.

## Error handling and performance

- Reconciliation uses a single task and at most one in-flight history request
  per active session.
- Browser disconnect stops compatibility reads immediately.
- Native reasoning remains supported without a feature flag.
- Snapshot replacement prevents duplicate content when native and fallback
  events overlap.
- Stale navigation never creates a global startup error.
- Navigation records contain no message title, body, or credentials.

## Testing and release gate

Backend tests cover the turn boundary, changed-only snapshots, native/fallback
deduplication, polling failure, final reconciliation, cancellation, and
disconnect cleanup.

Frontend tests cover `reasoning.snapshot`, snapshot replacement, terminal
authority, `postMessage` selection, cold-start persistence, target priority,
expiry, and graceful `404` handling.

The release gate is Python tests, Vitest, ESLint, TypeScript type-check,
production build, Compose validation, and manual iOS verification with the PWA
both suspended and fully closed.

## Decision log

| Decision | Alternatives | Reason |
| --- | --- | --- |
| Reconcile persisted reasoning in the BFF | Frontend polling; wait upstream | Keeps Hermes compatibility server-side and fixes the current release. |
| Emit authoritative snapshots | Synthesize arbitrary deltas | Prevents duplication and represents the data Hermes actually persisted. |
| Preserve native reasoning events | Always poll only | Automatically benefits from a future upstream fix. |
| Use IndexedDB plus `postMessage` | Query string only; path route only | Covers both iOS cold start and resume. |
| Keep the URL target | Replace URL navigation | Provides backward compatibility for browsers where it already works. |
| Store only session ID and timestamp | Store notification payload | Minimizes sensitive durable data. |

## Explicit non-goals

- Modifying Hermes Agent or installing project code in its container.
- Reconstructing reasoning tokens that Hermes never exposed or persisted.
- Polling while no generation is active.
- Persisting notification content in the navigation handoff database.
- Turning a missing notification session into a fatal application error.
