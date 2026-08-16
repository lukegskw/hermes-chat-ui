import { describe, expect, it } from "vitest";
import { readSessionDeepLink, withoutSessionDeepLink } from "./sessionDeepLink";

describe("session notification deep links", () => {
  it("reads and removes the session while preserving other URL state", () => {
    const href =
      "https://hermes.local/?theme=dark&session=proactive_123%3Aabc#chat";

    expect(readSessionDeepLink(href)).toBe("proactive_123:abc");
    expect(withoutSessionDeepLink(href)).toBe("/?theme=dark#chat");
  });

  it("degrades invalid and missing URLs to no requested session", () => {
    expect(readSessionDeepLink("not a URL")).toBe("");
    expect(readSessionDeepLink("https://hermes.local/")).toBe("");
  });
});
