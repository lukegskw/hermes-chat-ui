# Generation visibility reconciliation design

## Context

When a user sends a message, the client creates an optimistic assistant message
with `isGenerating: true` and progressively appends text, reasoning, and tool
calls from the Hermes stream. When a hidden browser tab becomes visible,
`useChatState` refreshes the active session from Hermes. An in-progress assistant
message is not yet present in the canonical session history, so replacing the
local message list with that snapshot removes the optimistic assistant message
and its "Generating response..." indicator even though the stream remains
active.

## Understanding summary

- Preserve the generation indicator when switching browser tabs.
- Preserve all partial text, reasoning, and tool activity from the active stream.
- Continue refreshing session metadata and canonical history on visibility.
- Never let an in-progress remote snapshot erase local streaming state.
- Return to Hermes as the definitive source after the stream finishes.
- Apply the same behavior to the browser and installed PWA.
- Do not introduce local persistence or a second database.

## Assumptions and non-functional requirements

- Reconciliation is linear in the number of messages in one session and is
  suitable for the current session sizes.
- Hermes permits at most one client-side generation per conversation, while
  different conversations can have independent generation states.
- No additional message content is persisted in browser storage.
- A remote refresh must never remove local content while it is streaming.
- The rule is owned by the session-history reconciliation layer and covered by
  unit tests.

## Considered approaches

### A. Generation-aware reconciliation (selected)

`reloadConversation` checks the latest local session state when applying a
remote message list. If any local message has `isGenerating: true`, it preserves
the complete local message list. Once generation ends, the next reload applies
the canonical Hermes messages normally.

This is the smallest deterministic change, keeps the responsibility inside the
history reconciliation layer, and does not couple the chat-state and streaming
hooks.

### B. Suspend the active conversation reload

Skip the history request while the active session is generating. This avoids the
replacement but requires sharing the generation map between `useHermesStream`
and `useChatState`, increasing hook coupling.

### C. Merge remote messages with the optimistic suffix

Match and combine remote messages with local optimistic messages. This could
incorporate concurrent remote changes but is prone to duplicates because local
and canonical message IDs differ. The additional complexity is not justified by
the one-generation-per-session model.

## Final design

Extract a pure session-message reconciliation function. It receives the latest
local and incoming message arrays and returns:

- the local array unchanged when a local message is still generating;
- the incoming canonical array when no local message is generating.

Call this function inside the functional `setConversations` update performed by
`reloadConversation`. The decision must not be made before the network request,
because the stream can finish while that request is pending. Session-list
refreshes continue unchanged because they already preserve the locally loaded
message arrays.

On stream completion, the client clears `isGenerating` and performs its existing
canonical reload when visible. If completion happens while hidden, the normal
visibility reload applies the canonical history when the user returns.

## Error handling and edge cases

- A reload failure leaves the partial local response intact and uses the current
  error reporting path.
- A canonical `404` still removes a session, even if it had local generation
  state.
- The protection is scoped to each session; generation in one session does not
  block another session's refresh.
- Text, reasoning, and tool calls are preserved as one immutable message list.
- After the user stops generation, messages are no longer protected from normal
  canonical reconciliation.
- Remote message counts do not truncate local in-progress content.

## Testing strategy

Unit tests for the pure reconciliation function must verify that it:

- preserves local messages containing an active generation;
- accepts remote messages after generation finishes;
- preserves partial text, reasoning, and tool calls without mutation;
- handles empty local and remote histories;
- applies protection only to the session being reconciled.

Run frontend tests, TypeScript checks, ESLint, the production build, and backend
regression tests. Deployment validation remains local, followed by the user's
Portainer test on the NAS.

## Decision log

1. Preserve both the indicator and all partial response content across tab
   visibility changes. Preserving only the indicator was rejected because it
   would still discard useful streamed content.
2. Keep Hermes as the canonical source after a generation completes. Additional
   local persistence was rejected.
3. Select generation-aware reconciliation in `reloadConversation`. Suspending
   requests would couple hooks, while field-level merging would introduce
   unnecessary identity and duplication risks.
4. Evaluate generation state inside the functional React state update so a
   network race cannot use stale state.
5. Keep external canonical deletion authoritative.
