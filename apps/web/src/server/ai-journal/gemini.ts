import "server-only";

import { buildSystemInstruction, messagesToGeminiContents, type PromptMessage } from "@/lib/ai-journal/prompt";
import type { JournalMode } from "@/lib/ai-journal/types";
import { getGeminiApiKey } from "./secrets";

const RECOVERABLE_GEMINI_STATUS = new Set([404, 429, 500, 503]);
const GEMINI_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";

export const GEMINI_MODEL_FALLBACKS = [
  process.env.GEMINI_MODEL ?? "gemini-3.6-flash",
  "gemini-3.1-flash-lite",
  "gemini-flash-latest",
  "gemini-3.7-flash",
].filter((model, index, models) => models.indexOf(model) === index);

type GeminiCandidate = {
  content?: {
    parts?: Array<{ text?: string }>;
  };
  finishReason?: string;
};

type GeminiGenerateResponse = {
  candidates?: GeminiCandidate[];
  promptFeedback?: {
    blockReason?: string;
  };
};

export type GenerateJournalReplyInput = {
  mode: JournalMode;
  messages: PromptMessage[];
};

export type GenerateJournalReplyResult = {
  text: string;
  model: string;
};

function extractText(response: GeminiGenerateResponse): string {
  const text = response.candidates
    ?.flatMap((candidate) => candidate.content?.parts ?? [])
    .map((part) => part.text ?? "")
    .join("\n")
    .trim();

  if (text) return text;

  const blockReason = response.promptFeedback?.blockReason;
  if (blockReason) {
    throw new Error(`Gemini blocked the prompt: ${blockReason}`);
  }

  throw new Error("Gemini returned an empty response.");
}

async function generateWithModel({
  apiKey,
  mode,
  messages,
  model,
}: GenerateJournalReplyInput & { apiKey: string; model: string }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);

  try {
    const response = await fetch(`${GEMINI_ENDPOINT}/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
      signal: controller.signal,
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: buildSystemInstruction(mode) }],
        },
        contents: messagesToGeminiContents(messages),
        generationConfig: {
          temperature: mode === "brainstorm" ? 0.75 : 0.35,
          topP: 0.95,
          maxOutputTokens: mode === "submission-review" ? 1_200 : 900,
        },
      }),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      const error = new Error(`Gemini ${model} failed with ${response.status}: ${detail.slice(0, 240)}`);
      error.name = response.status.toString();
      throw error;
    }

    return extractText((await response.json()) as GeminiGenerateResponse);
  } finally {
    clearTimeout(timeout);
  }
}

function isRecoverable(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const status = Number(error.name);
  return RECOVERABLE_GEMINI_STATUS.has(status) || error.name === "AbortError";
}

export async function generateJournalReply(input: GenerateJournalReplyInput): Promise<GenerateJournalReplyResult> {
  const apiKey = await getGeminiApiKey();
  let lastError: unknown;

  for (const model of GEMINI_MODEL_FALLBACKS) {
    try {
      const text = await generateWithModel({ apiKey, model, ...input });
      return { text, model };
    } catch (error) {
      lastError = error;
      if (!isRecoverable(error)) break;
    }
  }

  if (lastError instanceof Error) throw lastError;
  throw new Error("Gemini generation failed.");
}
