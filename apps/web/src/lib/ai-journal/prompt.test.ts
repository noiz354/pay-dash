import { describe, expect, it } from "vitest";
import { buildSystemInstruction, messagesToGeminiContents, normalizePromptText, titleFromPrompt } from "./prompt";

const long = "x".repeat(3_500);

describe("ai journal prompt helpers", () => {
  it("keeps the brainstorming mode grounded in idea refinement", () => {
    const instruction = buildSystemInstruction("brainstorm");

    expect(instruction).toContain("How might we");
    expect(instruction).toContain("Not doing");
    expect(instruction).toContain("Secret Manager");
    expect(instruction).not.toContain("allow read, write: if true");
  });

  it("normalizes and bounds context sent to Gemini", () => {
    const contents = messagesToGeminiContents([
      { role: "user", text: "  hello\u0000 world  " },
      { role: "model", text: long },
    ]);

    expect(contents).toHaveLength(2);
    expect(contents[0]?.parts[0]?.text).toBe("hello world");
    expect(contents[1]?.parts[0]?.text).toHaveLength(3_000);
  });

  it("builds stable Firestore-friendly titles from first prompts", () => {
    expect(titleFromPrompt("\n\n")).toBe("Untitled journal");
    expect(titleFromPrompt("Plan a secure Cloud Run journal for merchants")).toBe(
      "Plan a secure Cloud Run journal for merchants"
    );
  });

  it("caps empty and oversized text safely", () => {
    expect(normalizePromptText("\u0000\u0000")).toBe("");
    expect(normalizePromptText(long)).toHaveLength(3_000);
  });
});
