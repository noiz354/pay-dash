import "server-only";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { textResult } from "./handlers";

export function registerJournalTools(server: McpServer): void {
  server.registerTool(
    "list_journal_conversations",
    {
      title: "List journal conversations",
      description: "List a user's AI journal conversations (Firestore, user-isolated). Requires the owner's Firebase uid.",
      inputSchema: { uid: z.string().min(1) },
    },
    async ({ uid }) => {
      const { getJournalRepository } = await import("@/server/ai-journal/repository");
      try {
        const rows = await getJournalRepository().listConversations(uid);
        return textResult(
          rows.map((conversation) => ({
            id: conversation.id,
            title: conversation.title,
            mode: conversation.mode,
            messageCount: conversation.messageCount,
            updatedAt: conversation.updatedAt,
          }))
        );
      } catch (error) {
        return textResult({ error: error instanceof Error ? error.message : "Journal list failed." });
      }
    }
  );

  server.registerTool(
    "get_journal_conversation",
    {
      title: "Get journal conversation",
      description: "Get one journal conversation with its messages (Firestore, user-isolated).",
      inputSchema: { uid: z.string().min(1), conversationId: z.string().min(1) },
    },
    async ({ uid, conversationId }) => {
      const { getJournalRepository } = await import("@/server/ai-journal/repository");
      try {
        const conversation = await getJournalRepository().getConversation(uid, conversationId);
        if (!conversation) return textResult({ error: "Conversation not found." });
        return textResult({ id: conversation.id, title: conversation.title, messages: conversation.messages });
      } catch (error) {
        return textResult({ error: error instanceof Error ? error.message : "Journal read failed." });
      }
    }
  );
}