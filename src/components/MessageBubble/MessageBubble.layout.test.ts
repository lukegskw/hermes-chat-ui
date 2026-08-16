import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const messageBubbleStyles = readFileSync(
  new URL("./MessageBubble.module.scss", import.meta.url),
  "utf8",
);

describe("message bubble layout", () => {
  it("uses real message heights for deterministic initial scrolling", () => {
    expect(messageBubbleStyles).not.toMatch(/content-visibility\s*:/i);
    expect(messageBubbleStyles).not.toMatch(/contain-intrinsic-size\s*:/i);
  });
});
