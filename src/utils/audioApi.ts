import { z } from "zod";
import { ApiError } from "./api";

const AudioCapabilitiesSchema = z.object({
  available: z.boolean(),
  max_bytes: z.number().int().positive(),
  accepted_mime_types: z.array(z.string()),
  stt: z
    .object({
      provider: z.string().nullable(),
      model: z.string().nullable(),
      language: z.string(),
    })
    .optional(),
});

const AudioTranscriptionSchema = z.object({ text: z.string() });

export type AudioCapabilities = z.infer<typeof AudioCapabilitiesSchema>;

const apiBase = (endpoint: string) => endpoint.replace(/\/$/, "");

const toExtension = (mimeType: string): string => {
  const normalized = mimeType.split(";", 1)[0].toLowerCase();
  if (normalized.includes("mp4")) return "m4a";
  if (normalized.includes("ogg")) return "ogg";
  if (normalized.includes("wav")) return "wav";
  return "webm";
};

const parseAudioError = async (response: Response): Promise<ApiError> => {
  let message = response.statusText || "Audio transcription failed";
  let code: string | undefined;
  try {
    const body: unknown = await response.json();
    if (body && typeof body === "object") {
      const payload = body as Record<string, unknown>;
      if (typeof payload.detail === "string") message = payload.detail;
      if (typeof payload.code === "string") code = payload.code;
    }
  } catch {
    // The HTTP status is still useful when an intermediary returns non-JSON.
  }
  return new ApiError(message, response.status, code);
};

export const fetchAudioCapabilities = async (
  endpoint: string,
  signal?: AbortSignal,
): Promise<AudioCapabilities> => {
  const response = await fetch(`${apiBase(endpoint)}/api/audio/capabilities`, {
    signal,
  });
  if (!response.ok) throw await parseAudioError(response);
  return AudioCapabilitiesSchema.parse(await response.json());
};

export const transcribeAudio = async (
  endpoint: string,
  recording: Blob,
  signal?: AbortSignal,
): Promise<string> => {
  const formData = new FormData();
  const mimeType = recording.type || "audio/webm";
  formData.append("audio", recording, `recording.${toExtension(mimeType)}`);

  const response = await fetch(
    `${apiBase(endpoint)}/api/audio/transcriptions`,
    {
      method: "POST",
      body: formData,
      signal,
    },
  );
  if (!response.ok) throw await parseAudioError(response);
  return AudioTranscriptionSchema.parse(await response.json()).text.trim();
};
