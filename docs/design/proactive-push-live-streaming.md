# Proactive messages, live reasoning, and collapsed activity

Date: 2026-08-13
Status: implemented and covered by automated contract tests

## Understanding summary

- Each `notify.py` execution creates a new canonical Hermes conversation.
- The supplied message is final assistant text and must be persisted literally,
  without another LLM turn.
- Web Push remains owned by the UI BFF on port `8643`; the official dashboard
  on `9119` is used only for its authenticated session-import operation.
- A persistence failure must not suppress push. The notification must disclose
  that its conversation could not be saved.
- The Hermes image and container remain free of project components. The
  operator-managed script reaches the separate UI container over Docker DNS.
- Reasoning must update during the live Hermes stream instead of appearing
  only after history is reloaded.
- Reasoning and agent activity are independent, collapsed-by-default panels.

## Assumptions and non-functional requirements

- The deployment serves one trusted user on a private Docker network/VPN.
- `notify.py` remains operator-managed in the existing Hermes configuration
  volume; it is not copied into the official Hermes image by this project.
- Hermes remains the only canonical conversation store.
- Dashboard credentials and internal bearer keys remain server-side and are
  never returned to browser code.
- One proactive request normally produces one session and one push. A bounded
  idempotency key protects ordinary retries from duplicating either operation.
- Partial failure is observable and bounded: persistence and delivery report
  independent outcomes, and neither credential values nor cookies enter logs.

## Root causes

### Proactive notification connection refusal

The legacy script hardcodes `http://localhost:8643`. In the former wrapper
image, that address reached the UI backend in the same container. After the
split deployment, `localhost` inside `hermes-agent` refers only to the Hermes
container, where nothing listens on `8643`.

Changing the script to port `9119` is incorrect. That port belongs to the
official dashboard, while `/api/push/send` belongs to the UI BFF. The old
`POST /api/conversations` call is also a wrapper-era route backed by the
removed UI conversation store and must not return.

The public Hermes Sessions API can create an empty session or execute an agent
turn, but it cannot append literal, already-final assistant content. The
official dashboard exposes an authenticated `/api/sessions/import` operation
that can persist the requested canonical session without invoking the LLM.

### Reasoning visible only after refresh

The persisted Hermes history includes `reasoning`/`reasoning_content`, so the
history normalizer can display it after refresh. During a Sessions API stream,
however, current Hermes emits reasoning primarily as:

```text
event: tool.progress
data: {"tool_name":"_thinking","delta":"..."}
```

Other transports can emit `reasoning.available` with `text`. The live parser
must normalize both contracts, handle arbitrarily split SSE frames, and keep
terminal reconciliation separate from incremental event reduction.

### Agent activity auto-expands

The shared activity panel currently derives its expanded state from
`isStreaming`. Reasoning explicitly disables that behavior, but tool activity
uses the default and therefore opens automatically. Expansion must be a manual
per-panel UI choice independent from transport state.

## Alternatives considered

### 1. UI BFF imports through the official dashboard — selected

The operator script makes one authenticated request to the UI. The BFF logs in
to the dashboard, imports a canonical session, then sends push. This keeps the
format and credentials out of the script and preserves separate containers.

Trade-off: session persistence depends on an administrative dashboard API and
therefore requires version-aware integration tests and dashboard credentials
in the BFF environment.

### 2. `notify.py` imports Hermes `SessionDB`

The script could call `create_session()` and `append_message()` directly.
Rejected because it couples operator automation to private Python internals,
executes project-specific integration logic in the Hermes environment, and
weakens the pure-client boundary.

### 3. Push only until a public append API exists

This is the cleanest long-term contract but does not meet the immediate
canonical-persistence requirement. The dashboard adapter should be replaced
if Hermes later adds a bearer-authenticated message append/import API to the
public API server.

## Final design

### Internal proactive-message endpoint

The BFF exposes:

```text
POST /api/proactive/messages
Authorization: Bearer <HERMES_PUSH_API_KEY>
Content-Type: application/json
```

The bounded request contains `request_id`, `title`, and `message`. The BFF:

1. validates authentication and input limits;
2. resolves or reuses a bounded idempotency record for `request_id`;
3. authenticates to the dashboard's configured password provider;
4. imports a newly generated session with one literal assistant message;
5. confirms the canonical session;
6. sends Web Push, linking to that session when persistence succeeded;
7. returns independent persistence and push outcomes.

The dashboard session cookie lives only in memory for the operation. Its
credentials, the cookie, and internal bearer keys are never logged or included
in API responses.

UI-only runtime settings:

```env
HERMES_DASHBOARD_URL=http://hermes-agent:9119
HERMES_DASHBOARD_AUTH_PROVIDER=basic
HERMES_DASHBOARD_BASIC_AUTH_USERNAME=lucas
HERMES_DASHBOARD_BASIC_AUTH_PASSWORD=...
HERMES_PUSH_API_KEY=...
```

The script receives the same `HERMES_PUSH_API_KEY` and uses:

```env
HERMES_CHAT_UI_URL=http://hermes-chat-ui:8643
```

The two containers share the external `hermes-internal` network. No published
host port is required for this service-to-service path.

### Partial failure

Persistence and push are separate result domains:

- both succeed: `status: complete`, with the new session ID and delivery
  counts;
- persistence fails but push succeeds: `status: partial`; the push body states
  that the conversation was not saved and links only to the UI root;
- persistence succeeds but push fails: `status: partial`; the response retains
  the session ID so the event remains discoverable in the UI;
- both fail: `status: failed` and a non-zero script exit.

No push should claim a usable conversation link until import confirmation has
succeeded. Idempotency records live in the UI operational data volume and have
bounded retention. An identical completed `request_id` returns its recorded
outcome rather than creating a second session or push.

### Notification navigation

Successful push payloads carry a relative UI URL containing the canonical
session ID. On navigation, the frontend reads the parameter, loads/refreshes
the session list, selects the session if present, and removes the consumed
parameter from browser history. Missing/deleted sessions degrade to the normal
conversation list without blocking app startup.

### SSE normalization and live state

A pure event normalizer accepts the Sessions API and compatible run shapes:

- assistant text: `assistant.delta` or `message.delta` plus `delta`;
- reasoning: `tool.progress` with `tool_name`/`tool == _thinking` plus `delta`;
- reasoning: `reasoning.available` plus `text`;
- tools: `tool.started`, `tool.completed`, or `tool.failed`, accepting both
  `tool_name` and `tool` identifiers;
- terminal reconciliation: assistant/tool messages in `run.completed`.

The parser normalizes CRLF, preserves partial buffers across chunks, processes
the final non-empty frame at EOF, and treats incremental deltas separately
from authoritative terminal snapshots to avoid duplicated reasoning.

The optimistic assistant message exists from submission through completion.
Live reasoning and tool events update that message progressively. Terminal
events and the subsequent canonical history reload reconcile state but are not
the first source for content that was already streamed.

### Collapsed panels

The assistant message renders two independent disclosure panels:

- Reasoning appears immediately when generation begins and starts collapsed.
- Agent activity appears with the first tool event and starts collapsed.

Neither panel derives expansion from `isGenerating`/`isStreaming`. A manual
toggle persists for that rendered message while it remains mounted. Streaming
may update hidden content without forcing disclosure or moving the surrounding
layout.

## Error handling and security

- Require `HERMES_PUSH_API_KEY`; fail closed when absent or incorrect.
- Bound title, message, request ID, import body, and response sizes.
- Use short connection/response timeouts for dashboard authentication/import.
- Return stable, non-sensitive error codes rather than raw dashboard bodies.
- Never forward dashboard cookies to the browser or operator script.
- Do not reuse dashboard basic-auth credentials as the internal push key.
- Avoid logging request message bodies because proactive content may be
  sensitive.
- Preserve the existing private-network recommendation; none of these routes
  should be publicly exposed without an authenticated TLS reverse proxy.

## Testing strategy

Backend tests cover:

- required internal bearer authentication;
- literal assistant-session import and a new session per distinct request;
- idempotent replay of the same request ID;
- dashboard login/import/confirmation failures;
- push delivery after persistence failure, including the visible warning;
- push failure after successful persistence;
- bounded payloads and absence of credentials from responses/logs.

Frontend tests cover:

- both reasoning event shapes before final answer text;
- `tool_name` and `tool` compatibility;
- fragmented frames, CRLF, multiple frames per chunk, and an unterminated final
  frame;
- incremental-versus-snapshot deduplication;
- reasoning and activity collapsed initially and manually toggleable;
- notification deep-link selection and missing-session fallback.

The release gate includes backend tests, frontend tests, lint, type checking,
production build, split-Compose validation, and a manual private-network smoke
test performed by the operator.

## Decision log

| Decision | Alternatives | Reason |
| --- | --- | --- |
| Keep push on the UI BFF at `8643` | Move it to dashboard `9119` | Push subscriptions and VAPID material are UI-owned; the dashboard does not own this route. |
| Persist via dashboard session import | Use private `SessionDB`; push only | Saves literal assistant content canonically without modifying Hermes or invoking the LLM. |
| One new session per execution | Reuse a notification conversation | Matches the requested history and navigation behavior. |
| One BFF orchestration endpoint | Teach the script two APIs/auth schemes | Centralizes secrets, idempotency, partial failure, and compatibility logic. |
| Push after persistence failure | Fail the whole operation | Delivery is more important; the user sees an explicit persistence warning. |
| Normalize all supported SSE variants | Couple UI state to one event spelling | Hermes transports expose reasoning/tool identifiers in more than one compatible shape. |
| Keep reasoning and activity collapsed | Auto-expand while streaming | Matches requested progressive disclosure and avoids layout churn. |

## Explicit non-goals

- Modifying the official Hermes image or installing project components in it.
- Reintroducing the UI conversation database or `/api/conversations` route.
- Calling an LLM to transform an already-final proactive message.
- Making the dashboard the owner of Web Push.
- Multi-user/tenant isolation.
- Guaranteeing persistence when the dashboard administrative API is disabled
  or incompatible; push remains the documented fallback.
