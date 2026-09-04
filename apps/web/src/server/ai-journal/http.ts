import "server-only";

import { z } from "zod";
import { FirebaseAuthError } from "@/server/firebase/auth";

export async function readJson(request: Request): Promise<unknown> {
  const text = await request.text();
  if (!text.trim()) return {};

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

export function jsonError(status: number, error: string, details?: unknown) {
  return Response.json({ error, details }, { status });
}

export function handleApiError(error: unknown) {
  if (error instanceof FirebaseAuthError) {
    return jsonError(error.status, error.message);
  }

  if (error instanceof z.ZodError) {
    return jsonError(400, "Invalid request payload.", z.treeifyError(error));
  }

  if (error instanceof Error && error.message === "Conversation not found.") {
    return jsonError(404, "Conversation not found.");
  }

  console.error("AI journal API error", error);
  return jsonError(500, "The AI journal service is temporarily unavailable.");
}
