import { getAiJournalRateLimitPolicy } from "@/server/ai-journal/rate-limit";
import { getJournalRepository } from "@/server/ai-journal/repository";
import { handleApiError } from "@/server/ai-journal/http";
import { requireFirebaseUser } from "@/server/firebase/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const user = await requireFirebaseUser(request);
    const summary = await getJournalRepository().getEvaluationSummary(user.uid);
    return Response.json({ summary, rateLimit: getAiJournalRateLimitPolicy() });
  } catch (error) {
    return handleApiError(error);
  }
}
