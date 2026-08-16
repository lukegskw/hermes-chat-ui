# Latest Message Layout Design

## Understanding

- Opening an existing conversation must show the latest 30 messages.
- The viewport must end exactly at the latest message without requiring an
  active generation.
- Reasoning, tool calls, long text, and retained images must not leave the
  conversation positioned in the middle.
- Loading older messages must continue preserving the reader's position.
- No backend, pagination, or Hermes Agent behavior will change.

The application is single-user, and immediately laying out the initial 30
messages is an acceptable performance cost on desktop and PWA. Security,
privacy, persistence, and availability are unaffected.

## Design

The initial history window must use the real layout dimensions of all 30
rendered messages before the viewport is positioned at the bottom. Message
cards therefore must not use `content-visibility: auto` with an estimated
intrinsic height: those estimates make the first `scrollHeight` inaccurate and
leave inactive conversations positioned in the middle after the browser lays
out their real content. Streaming had hidden this defect because each new delta
triggered another bottom scroll.

The correction removes layout containment from message cards and keeps the
existing initial-scroll and prepend-anchor policies unchanged. This favors a
deterministic opening position over speculative rendering optimization; the
cost is bounded by the existing 30-message initial window. No timers,
`ResizeObserver`, backend changes, or Hermes changes are required.

Images may still acquire their final height asynchronously. They will be
handled separately only if real-device validation demonstrates a remaining
image-specific shift after this correction.

## Alternatives considered

- Keep containment and use `ResizeObserver`: rejected because it adds state,
  visible jumps, and risks overriding manual scrolling.
- Replace the list with dynamically measured virtualization: rejected as
  unnecessary for a 30-message initial window and substantially riskier.

## Decision log

- Treat the symptom as a layout-positioning defect, not a pagination defect;
  the API already requests `order=latest`.
- Prefer removing estimated layout containment over repeatedly forcing scroll
  or introducing full list virtualization.
- Preserve the current near-bottom streaming behavior and scroll-height anchor
  when older pages are prepended.
- Accept immediate layout of the 30-message initial window on desktop and PWA.

## Verification

- Add a regression protecting message cards from estimated layout containment.
- Retain the existing tests for waiting on initial history, scrolling to the
  latest message, and preserving the anchor when history is prepended.
- Run lint, TypeScript checks, all tests, and both production builds with pnpm.
