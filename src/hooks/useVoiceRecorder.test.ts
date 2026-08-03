import { afterEach, describe, expect, it, vi } from "vitest";
import { detectVoiceRecordingSupport } from "./useVoiceRecorder";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("voice recording support detection", () => {
  it("reports an insecure origin separately from browser incompatibility", () => {
    vi.stubGlobal("window", { isSecureContext: false });
    vi.stubGlobal("navigator", {
      mediaDevices: { getUserMedia: vi.fn() },
    });
    vi.stubGlobal("MediaRecorder", class MediaRecorder {});

    expect(detectVoiceRecordingSupport()).toBe("insecure_context");
  });

  it("accepts Chrome-like secure contexts with MediaRecorder", () => {
    vi.stubGlobal("window", { isSecureContext: true });
    vi.stubGlobal("navigator", {
      mediaDevices: { getUserMedia: vi.fn() },
    });
    vi.stubGlobal("MediaRecorder", class MediaRecorder {});

    expect(detectVoiceRecordingSupport()).toBe("supported");
  });
});
