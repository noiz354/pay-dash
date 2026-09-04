import { z } from "zod";
import { JOURNAL_MODES } from "@/lib/ai-journal/types";
import { titleFromPrompt } from "@/lib/ai-journal/prompt";
import { getJournalRepository } from "@/server/ai-journal/repository";
import { handleApiError, jsonError, readJson } from "@/server/ai-journal/http";
import { requireFirebaseUser } from "@/server/firebase/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const createConversationSchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  mode: z.enum(JOURNAL_MODES).default("journal"),
});

export async function GET(request: Request) {
  try {
    const user = await requireFirebaseUser(request);
    const conversations = await getJournalRepository().listConversations(user.uid);
    return Response.json({ conversations });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = await readJson(request);
    if (body === undefined) return jsonError(400, "Malformed JSON payload.");

    const user = await requireFirebaseUser(request);
    const input = createConversationSchema.parse(body);
    const conversation = await getJournalRepository().createConversation(user.uid, {
      title: input.title ? titleFromPrompt(input.title) : "New secure journal",
      mode: input.mode,
    });

    return Response.json({ conversation }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
