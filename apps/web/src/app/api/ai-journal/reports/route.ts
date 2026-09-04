import { z } from "zod";
import { copySafeText } from "@/lib/ai-journal/safety";
import { getJournalRepository } from "@/server/ai-journal/repository";
import { handleApiError, jsonError, readJson } from "@/server/ai-journal/http";
import { requireFirebaseUser } from "@/server/firebase/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const reportSchema = z.object({
  conversationId: z.string().trim().min(1).max(160).regex(/^[A-Za-z0-9_-]+$/),
  messageId: z.string().trim().min(1).max(160).regex(/^[A-Za-z0-9_-]+$/),
  kind: z.enum(["ops-report", "recovery-plan", "readiness-checklist", "submission-brief", "note"]),
  title: z.string().trim().min(1).max(120),
  body: z.string().trim().min(1).max(12_000),
  redacted: z.boolean().default(true),
});

export async function POST(request: Request) {
  try {
    const body = await readJson(request);
    if (body === undefined) return jsonError(400, "Malformed JSON payload.");

    const user = await requireFirebaseUser(request);
    const input = reportSchema.parse(body);
    const report = await getJournalRepository().saveReport(user.uid, {
      kind: input.kind,
      title: input.title,
      body: copySafeText(input.body, input.redacted),
      sourceConversationId: input.conversationId,
      sourceMessageId: input.messageId,
      redacted: input.redacted,
    });

    return Response.json({ report }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
