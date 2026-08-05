import { describe, expect, it } from "vitest";
import { appendTranscriptToDraft } from "./transcriptDraft";

describe("appendTranscriptToDraft", () => {
  it("uses the transcript as a new draft", () => {
    expect(appendTranscriptToDraft("", "  Olá Hermes  ")).toBe("Olá Hermes");
  });

  it("appends the transcript after existing text", () => {
    expect(appendTranscriptToDraft("Contexto existente  ", "Nova fala")).toBe(
      "Contexto existente\nNova fala",
    );
  });

  it("does not change the draft for an empty transcript", () => {
    expect(appendTranscriptToDraft("Rascunho", "   ")).toBe("Rascunho");
  });
});
