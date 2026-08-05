import { useCallback, useEffect, useRef, useState } from "react";
import {
  ApiError,
  AudioCapabilities,
  fetchAudioCapabilities,
  transcribeAudio,
} from "../utils";

export type VoiceRecorderState =
  | "checking"
  | "idle"
  | "requesting_permission"
  | "recording"
  | "transcribing"
  | "retryable_error"
  | "too_large";

type VoiceRecorderOptions = {
  endpoint: string;
  disabled?: boolean;
  onTranscript: (text: string) => Promise<boolean> | boolean | void;
};

const preferredMimeTypes = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4;codecs=mp4a.40.2",
  "audio/mp4",
];

const recorderMimeType = (): string | undefined => {
  if (typeof MediaRecorder === "undefined") return undefined;
  return preferredMimeTypes.find((mimeType) =>
    MediaRecorder.isTypeSupported(mimeType),
  );
};

export type VoiceRecordingSupport =
  "supported" | "insecure_context" | "unsupported";

export const detectVoiceRecordingSupport = (): VoiceRecordingSupport => {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return "unsupported";
  }
  if (!window.isSecureContext) return "insecure_context";
  const mediaDevices = (
    globalThis.navigator as unknown as {
      mediaDevices?: { getUserMedia?: unknown };
    }
  ).mediaDevices;
  return typeof mediaDevices?.getUserMedia === "function" &&
    typeof MediaRecorder !== "undefined"
    ? "supported"
    : "unsupported";
};

const supportMessage = (support: VoiceRecordingSupport): string | null => {
  if (support === "insecure_context") return "audio.secureContextRequired";
  if (support === "unsupported") return "audio.unsupported";
  return null;
};

const messageForError = (error: unknown): string => {
  if (error instanceof ApiError) {
    switch (error.code) {
      case "audio_no_speech":
        return "audio.noSpeech";
      case "audio_too_large":
        return "audio.tooLarge";
      case "audio_transcription_busy":
        return "audio.busy";
      case "audio_unavailable":
        return "audio.unavailable";
      default:
        return "audio.transcriptionFailed";
    }
  }
  if (error instanceof DOMException && error.name === "NotAllowedError") {
    return "audio.permissionDenied";
  }
  return "audio.transcriptionFailed";
};

export const useVoiceRecorder = ({
  endpoint,
  disabled = false,
  onTranscript,
}: VoiceRecorderOptions) => {
  const recordingSupport = detectVoiceRecordingSupport();
  const [state, setState] = useState<VoiceRecorderState>(() =>
    recordingSupport === "supported" ? "checking" : "idle",
  );
  const [capabilities, setCapabilities] = useState<AudioCapabilities | null>(
    null,
  );
  const [messageKey, setMessageKey] = useState<string | null>(() =>
    supportMessage(recordingSupport),
  );
  const [recordedBytes, setRecordedBytes] = useState(0);
  const [hasRetainedRecording, setHasRetainedRecording] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const retainedRecordingRef = useRef<Blob | null>(null);
  const limitReachedRef = useRef(false);
  const cancelledRef = useRef(false);
  const transcriptionControllerRef = useRef<AbortController | null>(null);
  const transcriptionOperationRef = useRef(0);
  const onTranscriptRef = useRef(onTranscript);

  useEffect(() => {
    onTranscriptRef.current = onTranscript;
  }, [onTranscript]);

  const releaseMicrophone = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    recorderRef.current = null;
  }, []);

  const discard = useCallback(() => {
    retainedRecordingRef.current = null;
    setHasRetainedRecording(false);
    chunksRef.current = [];
    setRecordedBytes(0);
    setMessageKey(null);
    if (state !== "recording" && state !== "requesting_permission")
      setState("idle");
  }, [state]);

  const transcribe = useCallback(
    async (recording: Blob) => {
      const operationId = ++transcriptionOperationRef.current;
      const controller = new AbortController();
      transcriptionControllerRef.current = controller;
      setState("transcribing");
      setMessageKey(null);
      try {
        const text = await transcribeAudio(
          endpoint,
          recording,
          controller.signal,
        );
        if (
          controller.signal.aborted ||
          operationId !== transcriptionOperationRef.current
        ) {
          return;
        }
        if (!text) {
          retainedRecordingRef.current = null;
          setHasRetainedRecording(false);
          setState("idle");
          setMessageKey("audio.noSpeech");
          return;
        }
        const accepted = await onTranscriptRef.current(text);
        if (operationId !== transcriptionOperationRef.current) {
          return;
        }
        if (accepted === false) {
          retainedRecordingRef.current = null;
          setHasRetainedRecording(false);
          setRecordedBytes(0);
          setState("idle");
          return;
        }
        retainedRecordingRef.current = null;
        setHasRetainedRecording(false);
        setRecordedBytes(0);
        setState("idle");
        setMessageKey("audio.reviewTranscript");
      } catch (error) {
        if (
          controller.signal.aborted ||
          operationId !== transcriptionOperationRef.current
        ) {
          return;
        }
        if (error instanceof ApiError && error.code === "audio_no_speech") {
          retainedRecordingRef.current = null;
          setHasRetainedRecording(false);
          setState("idle");
        } else if (
          error instanceof ApiError &&
          error.code === "audio_too_large"
        ) {
          retainedRecordingRef.current = null;
          setHasRetainedRecording(false);
          setState("too_large");
        } else {
          setHasRetainedRecording(true);
          setState("retryable_error");
        }
        setMessageKey(messageForError(error));
      } finally {
        if (operationId === transcriptionOperationRef.current) {
          transcriptionControllerRef.current = null;
        }
      }
    },
    [endpoint],
  );

  useEffect(() => {
    const controller = new AbortController();
    if (recordingSupport !== "supported") {
      return () => controller.abort();
    }
    void fetchAudioCapabilities(endpoint, controller.signal)
      .then((nextCapabilities) => {
        setCapabilities(nextCapabilities);
        setState("idle");
        if (!nextCapabilities.available) setMessageKey("audio.unavailable");
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError")
          return;
        setState("idle");
        setMessageKey("audio.unavailable");
      });
    return () => controller.abort();
  }, [endpoint, recordingSupport]);

  useEffect(
    () => () => {
      cancelledRef.current = true;
      transcriptionOperationRef.current += 1;
      transcriptionControllerRef.current?.abort();
      transcriptionControllerRef.current = null;
      if (recorderRef.current?.state === "recording")
        recorderRef.current.stop();
      releaseMicrophone();
    },
    [releaseMicrophone],
  );

  const start = useCallback(async () => {
    if (
      disabled ||
      state !== "idle" ||
      !capabilities?.available ||
      recordingSupport !== "supported"
    ) {
      return;
    }

    const mimeType = recorderMimeType();
    if (!mimeType) {
      setMessageKey(supportMessage(recordingSupport));
      return;
    }

    try {
      setState("requesting_permission");
      setMessageKey(null);
      cancelledRef.current = false;
      limitReachedRef.current = false;
      chunksRef.current = [];
      retainedRecordingRef.current = null;
      setHasRetainedRecording(false);
      setRecordedBytes(0);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const wasCancelled = () => cancelledRef.current;
      if (wasCancelled()) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      streamRef.current = stream;
      const recorder = new MediaRecorder(stream, { mimeType });
      recorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (!event.data.size) return;
        chunksRef.current.push(event.data);
        const nextSize = chunksRef.current.reduce(
          (total, chunk) => total + chunk.size,
          0,
        );
        setRecordedBytes(nextSize);
        if (
          nextSize > capabilities.max_bytes &&
          recorder.state === "recording"
        ) {
          limitReachedRef.current = true;
          recorder.stop();
        }
      };
      recorder.onstop = () => {
        releaseMicrophone();
        if (cancelledRef.current) return;
        if (limitReachedRef.current) {
          retainedRecordingRef.current = null;
          chunksRef.current = [];
          setState("too_large");
          setMessageKey("audio.tooLarge");
          return;
        }
        const recording = new Blob(chunksRef.current, {
          type: recorder.mimeType,
        });
        chunksRef.current = [];
        if (!recording.size) {
          setState("idle");
          setMessageKey("audio.noSpeech");
          return;
        }
        retainedRecordingRef.current = recording;
        setHasRetainedRecording(false);
        void transcribe(recording);
      };
      recorder.start(1000);
      setState("recording");
    } catch (error) {
      releaseMicrophone();
      setState("idle");
      setMessageKey(messageForError(error));
    }
  }, [
    capabilities,
    disabled,
    recordingSupport,
    releaseMicrophone,
    state,
    transcribe,
  ]);

  const stop = useCallback(() => {
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
  }, []);

  const cancel = useCallback(() => {
    cancelledRef.current = true;
    transcriptionOperationRef.current += 1;
    transcriptionControllerRef.current?.abort();
    transcriptionControllerRef.current = null;
    retainedRecordingRef.current = null;
    setHasRetainedRecording(false);
    chunksRef.current = [];
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
    releaseMicrophone();
    setRecordedBytes(0);
    setMessageKey(null);
    setState("idle");
  }, [releaseMicrophone]);

  const retry = useCallback(() => {
    const recording = retainedRecordingRef.current;
    if (recording && state === "retryable_error") void transcribe(recording);
  }, [state, transcribe]);

  return {
    state,
    messageKey,
    recordedBytes,
    maxBytes: capabilities?.max_bytes ?? 0,
    isAvailable: Boolean(
      capabilities?.available && recordingSupport === "supported",
    ),
    isRecording: state === "recording",
    isTranscribing: state === "transcribing",
    canRetry: state === "retryable_error" && hasRetainedRecording,
    start,
    stop,
    cancel,
    retry,
    discard,
  };
};
