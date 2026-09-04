import { z } from "zod";
import { getJournalRepository } from "@/server/ai-journal/repository";
import { handleApiError, jsonError, readJson } from "@/server/ai-journal/http";
import { requireFirebaseUser } from "@/server/firebase/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const feedbackSchema = z.object({
  conversationId: z.string().trim().min(1).max(160).regex(/^[A-Za-z0-9_-]+$/),
  messageId: z.string().trim().min(1).max(160).regex(/^[A-Za-z0-9_-]+$/),
  rating: z.enum(["useful", "needs-work"]),
  reason: z.string().trim().min(1).max(140).default("No reason supplied"),
});

export async function POST(request: Request) {
  try {
    const body = await readJson(request);
    if (body === undefined) return jsonError(400, "Malformed JSON payload.");

    const user = await requireFirebaseUser(request);
    const input = feedbackSchema.parse(body);
    const message = await getJournalRepository().updateMessageFeedback(user.uid, input.conversationId, input.messageId, {
      rating: input.rating,
      reason: input.reason,
    });

    if (!message) return jsonError(404, "Message not found.");
    return Response.json({ message });
  } catch (error) {
    return handleApiError(error);
  }
}
