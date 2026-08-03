import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchAudioCapabilities, transcribeAudio } from "./audioApi";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("audio API client", () => {
  it("loads server capabilities", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          available: true,
          max_bytes: 25 * 1024 * 1024,
          accepted_mime_types: ["audio/webm"],
          stt: {
            provider: "openai",
            model: "gpt-4o-transcribe",
            language: "auto",
          },
        }),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      fetchAudioCapabilities("http://localhost:8643/"),
    ).resolves.toMatchObject({
      available: true,
      accepted_mime_types: ["audio/webm"],
      stt: {
        provider: "openai",
        model: "gpt-4o-transcribe",
        language: "auto",
      },
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8643/api/audio/capabilities",
      expect.any(Object),
    );
  });

  it("returns the transcription text", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify({ text: "Olá Hermes" })),
        ),
    );

    await expect(
      transcribeAudio("", new Blob(["voice"], { type: "audio/webm" })),
    ).resolves.toBe("Olá Hermes");
  });

  it("forwards the cancellation signal to the transcription request", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ text: "Olá" })));
    vi.stubGlobal("fetch", fetchMock);
    const controller = new AbortController();

    await transcribeAudio(
      "",
      new Blob(["voice"], { type: "audio/webm" }),
      controller.signal,
    );

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/audio/transcriptions",
      expect.objectContaining({ signal: controller.signal }),
    );
  });

  it("preserves the server error code for retry decisions", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            code: "audio_transcription_busy",
            detail: "Busy",
          }),
          { status: 409 },
        ),
      ),
    );

    await expect(
      transcribeAudio("", new Blob(["voice"], { type: "audio/webm" })),
    ).rejects.toMatchObject({ code: "audio_transcription_busy", status: 409 });
  });
});
