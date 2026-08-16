# Refresh Recovery and Latest-History Design

## Goals

- Reconstruct persisted image messages without displaying Hermes' synthetic
  `[screenshot]` marker beside the retained image.
- Keep an in-flight Hermes session turn visible, locked, cancellable, and
  streaming after a browser refresh or conversation navigation.
- Always open a conversation at its newest loaded message while preserving the
  reader's position when older history is prepended.

## Constraints

- Hermes Agent remains an independent, unmodified container and the canonical
  owner of sessions and message history.
- The UI backend remains a minimal browser-facing bridge; it must not create a
  second conversation database.
- Recovery covers browser reconnects while the UI backend process remains
  alive. Recovering an upstream stream after the UI container itself restarts
  is outside this change.
- Existing attachment indexes remain readable.

## Attachment reconstruction

The attachment index will retain the exact user text alongside each new image
record. When enriching Hermes history, the retained text becomes authoritative
for messages with retained images, followed by the local image URLs. This
prevents transport-only placeholders from leaking into the UI and preserves a
literal `[screenshot]` entered by the user.

Older index records have no retained text. For those only, enrichment removes
standalone `[screenshot]` lines when a retained image is present. Inline uses of
the same word remain untouched. The index schema accepts both old and new
records, so no manual migration is required.

## Resumable generation

The UI backend will replace the single `connected` flag for each active
session stream with a subscriber set and a bounded semantic snapshot. The
snapshot contains the assistant text, latest reasoning, tool-call state, and
message identifier.

The initial POST starts the Hermes session stream and subscribes its caller.
Disconnecting that caller only removes the subscriber; it does not cancel the
upstream Hermes request. A GET on the same browser-facing stream path attaches
to an existing turn. The backend emits one recovery snapshot before forwarding
new live events. With no active turn it returns an inactive response
immediately.

The frontend checks for an active turn whenever a conversation is opened. The
composer remains locked during this check. An active snapshot recreates the
temporary assistant message and the existing SSE handlers continue applying
text, reasoning, and tool events. Completion, cancellation, or failure reloads
the canonical Hermes history. Stop requests work even when the browser no
longer owns the original `AbortController`.

Multiple tabs can subscribe independently. A failed subscriber is removed
without affecting the upstream producer, notifications, or other subscribers.

## Latest history and scrolling

History continues requesting `order=latest` with an initial visual window of
30 messages. Conversation selection keeps the initial-scroll intent pending
until that latest window finishes loading, even when stale/cached messages are
already present. Once rendered, the viewport moves to the bottom exactly once.

Prepending older pages retains the existing scroll-height anchor. Subsequent
stream updates follow the bottom only while the reader is already near it, so
reading older messages is not interrupted.

## Failure behavior

- A recovery probe failure is visible and does not silently claim that the
  session is idle.
- A terminal stream state clears the generation lock only after the backend has
  confirmed that the active turn ended.
- Reattachment never resubmits the user's prompt or creates another Hermes
  generation.
- The completion notification remains producer-owned and fires at most once.

## Verification

Regression tests cover new and legacy attachment records, exact user text,
subscriber detach/reattach, recovery snapshots, reasoning and tool snapshot
parsing, latest-page loading, initial scroll after cached content, and prepend
anchoring. The final verification runs lint, tests, TypeScript checks, and both
production builds with pnpm.
