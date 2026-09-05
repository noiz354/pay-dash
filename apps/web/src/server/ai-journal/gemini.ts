import "server-only";

import { buildSystemInstruction, messagesToGeminiContents, type PromptMessage } from "@/lib/ai-journal/prompt";
import type { JournalMode } from "@/lib/ai-journal/types";
import { executeXenditReadTool, XENDIT_READ_FUNCTIONS } from "./xendit-read";
import { getGeminiApiKey } from "./secrets";

const RECOVERABLE_GEMINI_STATUS = new Set([404, 429, 500, 503]);
const GEMINI_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";
const MAX_TOOL_ROUNDS = 3;

export const GEMINI_MODEL_FALLBACKS = [
  process.env.GEMINI_MODEL ?? "gemini-3.6-flash",
  "gemini-3.1-flash-lite",
  "gemini-flash-latest",
  "gemini-3.7-flash",
].filter((model, index, models) => models.indexOf(model) === index);

type GeminiPart =
  | { text?: string }
  | { functionCall?: { name: string; args?: Record<string, unknown>; id?: string }; thoughtSignature?: string }
  | { functionResponse?: { name: string; response: Record<string, unknown> } };

type GeminiCandidate = {
  content?: {
    parts?: GeminiPart[];
  };
  finishReason?: string;
};

type GeminiGenerateResponse = {
  candidates?: GeminiCandidate[];
  promptFeedback?: {
    blockReason?: string;
  };
};

type GeminiTurn = {
  role: "user" | "model";
  parts: GeminiPart[];
};

export type GenerateJournalReplyInput = {
  mode: JournalMode;
  messages: PromptMessage[];
};

export type GenerateJournalReplyResult = {
  text: string;
  model: string;
  toolCalls?: string[];
};

function extractText(response: GeminiGenerateResponse): string {
  const text = response.candidates
    ?.flatMap((candidate) => candidate.content?.parts ?? [])
    .map((part) => ("text" in part ? part.text ?? "" : ""))
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
}: GenerateJournalReplyInput & { apiKey: string; model: string }): Promise<GenerateJournalReplyResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45_000);

  try {
    let contents: GeminiTurn[] = messagesToGeminiContents(messages);
    const toolCalls: string[] = [];

    for (let round = 0; round <= MAX_TOOL_ROUNDS; round += 1) {
      const response = await fetch(`${GEMINI_ENDPOINT}/${encodeURIComponent(model)}:generateContent`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
        signal: controller.signal,
        body: JSON.stringify({
          systemInstruction: {
            parts: [{ text: buildSystemInstruction(mode) }],
          },
          contents,
          generationConfig: {
            temperature: mode === "brainstorm" ? 0.75 : 0.35,
            topP: 0.95,
            maxOutputTokens: mode === "submission-review" ? 1_200 : 900,
          },
          tools: [{ functionDeclarations: XENDIT_READ_FUNCTIONS }],
          toolConfig: { functionCallingConfig: { mode: "AUTO" } },
        }),
      });

      if (!response.ok) {
        const detail = await response.text().catch(() => "");
        const error = new Error(`Gemini ${model} failed with ${response.status}: ${detail.slice(0, 240)}`);
        error.name = response.status.toString();
        throw error;
      }

      const parsed = (await response.json()) as GeminiGenerateResponse;
      const parts = parsed.candidates?.[0]?.content?.parts ?? [];
      const call = parts.find(
        (part): part is { functionCall: { name: string; args?: Record<string, unknown>; id?: string }; thoughtSignature?: string } =>
          "functionCall" in part && Boolean(part.functionCall)
      );

      if (call?.functionCall) {
        const { name, args, id } = call.functionCall;
        const thoughtSignature = call.thoughtSignature;
        toolCalls.push(name);
        const result = await executeXenditReadTool(name, args ?? {});
        contents = [
          ...contents,
          {
            role: "model",
            parts: [
              {
                functionCall: { name, args: args ?? {}, ...(id ? { id } : {}) },
                ...(thoughtSignature ? { thoughtSignature } : {}),
              },
            ],
          },
          { role: "user", parts: [{ functionResponse: { name, response: result.ok ? result.data : { error: result.error } } }] },
        ];
        continue;
      }

      return { text: extractText(parsed), model, toolCalls };
    }

    throw new Error("Gemini exceeded the maximum number of tool rounds.");
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
      return await generateWithModel({ apiKey, model, ...input });
    } catch (error) {
      lastError = error;
      if (!isRecoverable(error)) break;
    }
  }

  if (lastError instanceof Error) throw lastError;
  throw new Error("Gemini generation failed.");
}