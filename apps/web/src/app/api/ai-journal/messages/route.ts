import { z } from "zod";
import { JOURNAL_MODES } from "@/lib/ai-journal/types";
import { normalizePromptText } from "@/lib/ai-journal/prompt";
import { getJournalRepository } from "@/server/ai-journal/repository";
import { handleApiError, jsonError, readJson } from "@/server/ai-journal/http";
import { requireFirebaseUser } from "@/server/firebase/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const appendMessageSchema = z.object({
  conversationId: z.string().trim().min(1).max(160).regex(/^[A-Za-z0-9_-]+$/),
  role: z.enum(["user", "model"]),
  text: z.string().trim().min(1).max(8_000),
  mode: z.enum(JOURNAL_MODES).default("journal"),
});

export async function POST(request: Request) {
  try {
    const body = await readJson(request);
    if (body === undefined) return jsonError(400, "Malformed JSON payload.");

    const user = await requireFirebaseUser(request);
    const input = appendMessageSchema.parse(body);
    const repository = getJournalRepository();
    const message = await repository.appendMessage(user.uid, input.conversationId, {
      role: input.role,
      text: input.role === "user" ? normalizePromptText(input.text) : input.text.trim(),
      mode: input.mode,
    });
    const conversation = await repository.getConversation(user.uid, input.conversationId);

    return Response.json({ message, conversation });
  } catch (error) {
    return handleApiError(error);
  }
}
