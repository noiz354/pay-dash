import { z } from "zod";
import { getJournalRepository } from "@/server/ai-journal/repository";
import { handleApiError, jsonError } from "@/server/ai-journal/http";
import { requireFirebaseUser } from "@/server/firebase/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const conversationIdSchema = z.string().trim().min(1).max(160).regex(/^[A-Za-z0-9_-]+$/);

export async function GET(request: Request, { params }: { params: Promise<{ conversationId: string }> }) {
  try {
    const user = await requireFirebaseUser(request);
    const { conversationId } = await params;
    const parsedConversationId = conversationIdSchema.parse(conversationId);
    const conversation = await getJournalRepository().getConversation(user.uid, parsedConversationId);

    if (!conversation) return jsonError(404, "Conversation not found.");
    return Response.json({ conversation });
  } catch (error) {
    return handleApiError(error);
  }
}
