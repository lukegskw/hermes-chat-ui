# Runtime persistence, Hermes STT, and action-menu settings

Status: validated design  
Date: 2026-08-11

## Understanding summary

- Hermes Agent remains unmodified and is the only source of truth for each
  conversation's provider, model, reasoning configuration, messages, and
  assembled system prompt.
- Hermes Chat UI must stop invalidating the system-prompt cache on every turn.
- Voice transcription must use the same STT configuration and credentials as
  Hermes without exposing those credentials to browser code.
- Model and reasoning controls move out of the composer into the conversation
  action menu to reduce visual density.
- Model and reasoning selectors appear directly in the desktop popover or
  mobile/PWA bottom sheet.
- The desktop action menu must close consistently on outside interaction and
  keyboard dismissal.
- The deployment remains two separate containers; this project does not change
  or install anything in the Hermes Agent container.

## Assumptions and non-functional requirements

- The deployment serves one trusted user on a private network or VPN.
- One active transcription at a time remains sufficient for the NAS workload.
- `config.yaml` and `.env` in the Hermes data directory contain the effective
  STT configuration and credentials used by Hermes.
- The UI container may read those two files through individual read-only bind
  mounts. The browser must never receive credentials or file contents.
- Hermes availability remains independent from voice availability: an STT
  configuration problem must not prevent chat from loading.
- Runtime changes are infrequent and may make one explicit persistence request;
  ordinary chat turns must not rewrite unchanged runtime state.
- No new frontend state-management or overlay dependency is required.

## Root causes

### Repeated system-prompt warning

Hermes' `update_session_runtime_lock` deliberately clears `system_prompt` and
`system_prompt_hash`, because a changed provider/model must rebuild the prompt
footer. The UI currently sends `model`, `provider`, and
`require_model_lock: true` on every chat-stream request. Consequently, every
turn persists an unchanged lock and invalidates the prompt that the preceding
turn rebuilt.

### Audio transcription failure

The Hermes-compatible transcription path loads `$HERMES_HOME/.env`. The UI
container runs as UID `10001`, but that user can read `config.yaml` only. The
loader raises `PermissionError` while probing `/hermes-config/.env`, which is
not currently converted to the audio API's controlled error contract.

### Desktop menu dismissal

The mobile menu has a clickable backdrop. The desktop menu has neither a
backdrop nor a document-level outside-pointer handler, so outside clicks do not
change its open state.

## Decision log

| Decision                                                              | Alternatives considered                                                                      | Reason                                                                                     |
| --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Persist runtime only on session creation and explicit setting changes | Re-send a lock on every turn; duplicate runtime state in the BFF                             | Matches Hermes' persistence contract and avoids repeated prompt invalidation.              |
| Keep Hermes as the sole runtime authority                             | Let the BFF reconstruct or own conversation runtime                                          | Prevents divergent model/provider state and keeps the BFF minimal.                         |
| Mount `config.yaml` and `.env` individually, read-only                | Duplicate STT secrets as UI environment variables; modify Hermes; mount the entire directory | Preserves the exact Hermes STT configuration with the narrowest filesystem exposure.       |
| Convert STT configuration/access failures to a stable 503 response    | Leak raw compatibility-package exceptions; report all failures as provider errors            | Keeps chat available and gives an actionable, non-sensitive diagnostic.                    |
| Put Model and Reasoning directly in the root action menu              | Keep selectors in the composer; dedicated subpanels; expandable rows; use a modal            | Removes composer clutter and avoids unnecessary navigation for two fields.                 |
| Use an anchored popover on desktop and a bottom sheet on mobile       | Force one layout at all viewport sizes                                                       | Matches pointer/viewport constraints while sharing the exact same controls and behavior.   |
| Close after a confirmed selection                                     | Keep the menu open; close optimistically before the request finishes                         | Matches the requested interaction without hiding failures or showing an unconfirmed value. |
| Remove the reasoning-row icon                                         | Repair and retain the icon; add another icon set                                             | Direct field labels make the icon redundant and avoid the malformed legacy `Brain` SVG.    |
| Implement outside-pointer and Escape dismissal centrally              | Desktop backdrop; independent handlers per menu copy                                         | Covers mouse, pen, touch, portals, and keyboard without duplicated behavior.               |

## Final design

### Runtime data flow

Session creation sends the selected provider/model pair with
`require_model_lock: true`. Explicit model or reasoning changes use Hermes'
session-model endpoint and update local state only after success. Ordinary
chat-stream requests send the message, optional instructions, and attachments;
they omit `model`, `provider`, `model_options`, and `require_model_lock`.
Hermes therefore restores the confirmed persisted lock and no longer nulls the
system prompt on every message.

Refresh and legacy-session behavior do not depend on the browser knowing the
provider. If the public session response omits that private runtime metadata,
the stream request simply lets Hermes use its stored lock. Creation and changes
remain the only authoritative write paths.

### STT boundary

The UI compose file binds both Hermes files into `/hermes-config` as read-only.
Deployment documentation grants UID `10001` execute access to the host
directory and read access to both files. No endpoint returns `.env` values.

Hermes 0.19 resolves some STT credentials, notably OpenAI audio, directly from
`os.environ` instead of its `.env` helper. For credentialed providers, before
invoking the compatibility path, the BFF copies only an explicit allowlist of
STT-related values from the mounted `.env` into its process environment. It
does not import unrelated integration secrets or require access to Hermes'
writable `auth.json`. The explicit local provider bypasses this credential path.

The compatibility adapter distinguishes package unavailability, configuration
or permission failure, and provider transcription failure. Configuration
failures become a stable 503 response and an actionable server-side log;
provider failures retain their existing 422 behavior. Capabilities degrade
voice cleanly without affecting chat.

For `provider: local`, the UI image installs the Hermes `voice` extra and
validates that `faster-whisper` is importable before advertising voice as
available. Model downloads are persisted under `/app/cache/huggingface`, which
must be writable by UID `10001`.

### Action menu

The composer runtime-control row is removed. The root conversation menu shows
the provider-grouped Model selector and Reasoning selector directly, followed
by Rename and Delete. There is no submenu or expandable intermediate state.

Desktop renders an anchored popover. Mobile/PWA renders the same controls in a
portal bottom sheet with safe-area padding, bounded height, and scrolling. The
model list remains grouped by provider. The reasoning list includes the
effective Hermes/provider default.

A selection disables both fields while Hermes persists the runtime change. On
success, the menu closes and focus returns to its trigger. On failure, the
existing toast remains visible, the previous confirmed value is preserved, and
the menu stays open for retry.

One overlay controller handles outside `pointerdown`, Escape, successful
selection, conversation changes, and destructive/navigation actions. Trigger
and overlay nodes are both included in containment checks so an internal click
never dismisses before its action runs. Appropriate `aria-expanded`,
`aria-haspopup`, labels, and dialog/menu semantics are preserved.

## Verification

- API unit tests prove ordinary stream bodies omit runtime-lock fields while
  creation and explicit changes retain them.
- Backend tests cover successful STT, missing compatibility support,
  inaccessible `.env`, provider failure, and non-sensitive error responses.
- Component tests cover root menu/subpanel navigation, current values,
  selection, outside pointer, Escape, and conversation-change dismissal.
- Type checking, linting, frontend tests, backend tests, and production build
  must pass.
- Compose is validated statically. Deployment remains a manual user action.
