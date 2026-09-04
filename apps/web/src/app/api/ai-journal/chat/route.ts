import { z } from "zod";
import { JOURNAL_MODES } from "@/lib/ai-journal/types";
import { normalizePromptText, titleFromPrompt } from "@/lib/ai-journal/prompt";
import { generateJournalReply } from "@/server/ai-journal/gemini";
import { getJournalRepository } from "@/server/ai-journal/repository";
import { handleApiError, jsonError, readJson } from "@/server/ai-journal/http";
import { requireFirebaseUser } from "@/server/firebase/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const chatSchema = z.object({
  conversationId: z.string().trim().min(1).max(160).regex(/^[A-Za-z0-9_-]+$/).optional(),
  message: z.string().trim().min(1).max(4_000),
  mode: z.enum(JOURNAL_MODES).default("journal"),
});

export async function POST(request: Request) {
  try {
    const body = await readJson(request);
    if (body === undefined) return jsonError(400, "Malformed JSON payload.");

    const user = await requireFirebaseUser(request);
    const input = chatSchema.parse(body);
    const repository = getJournalRepository();
    const userText = normalizePromptText(input.message);

    let conversation = input.conversationId
      ? await repository.getConversation(user.uid, input.conversationId)
      : null;

    if (input.conversationId && !conversation) {
      return jsonError(404, "Conversation not found.");
    }

    if (!conversation) {
      const created = await repository.createConversation(user.uid, {
        title: titleFromPrompt(userText),
        mode: input.mode,
      });
      conversation = { ...created, messages: [] };
    }

    await repository.appendMessage(user.uid, conversation.id, {
      role: "user",
      text: userText,
      mode: input.mode,
    });

    const conversationWithUserMessage = await repository.getConversation(user.uid, conversation.id);
    const messagesForGemini = conversationWithUserMessage?.messages ?? [
      { id: "unsaved-user", role: "user", text: userText, mode: input.mode, createdAt: new Date().toISOString() },
    ];

    let gemini;
    try {
      gemini = await generateJournalReply({
        mode: input.mode,
        messages: messagesForGemini.map((message) => ({ role: message.role, text: message.text })),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Gemini failed to generate a response.";
      return Response.json(
        {
          error: message,
          savedUserMessage: true,
          conversationId: conversation.id,
          messages: messagesForGemini,
        },
        { status: 502 }
      );
    }

    let assistantMessage;
    try {
      assistantMessage = await repository.appendMessage(user.uid, conversation.id, {
        role: "model",
        text: gemini.text,
        mode: input.mode,
      });
    } catch {
      return Response.json(
        {
          error: "Gemini replied, but the response could not be persisted. Retry after checking Firestore availability.",
          conversationId: conversation.id,
          unsavedReply: gemini.text,
        },
        { status: 500 }
      );
    }

    const finalConversation = await repository.getConversation(user.uid, conversation.id);

    return Response.json({
      conversationId: conversation.id,
      model: gemini.model,
      reply: assistantMessage,
      conversation: finalConversation,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
