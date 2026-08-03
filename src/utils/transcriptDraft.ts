export const appendTranscriptToDraft = (
  draft: string,
  transcript: string,
): string => {
  const normalizedTranscript = transcript.trim();
  if (!normalizedTranscript) return draft;

  const draftWithoutTrailingWhitespace = draft.trimEnd();
  return draftWithoutTrailingWhitespace
    ? `${draftWithoutTrailingWhitespace}\n${normalizedTranscript}`
    : normalizedTranscript;
};
