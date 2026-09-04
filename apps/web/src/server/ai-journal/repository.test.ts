// @vitest-environment node
import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { getJournalRepository } from "./repository";

describe("AI journal repository", () => {
  it("keeps memory-mode conversations isolated by Firebase uid", async () => {
    vi.stubEnv("AI_JOURNAL_STORAGE_MODE", "memory");
    const repo = getJournalRepository();
    const suffix = randomUUID();
    const alice = `alice-${suffix}`;
    const bob = `bob-${suffix}`;

    const conversation = await repo.createConversation(alice, {
      title: "Alice private merchant journal",
      mode: "brainstorm",
    });
    await repo.appendMessage(alice, conversation.id, {
      role: "user",
      text: "Only Alice should see this payment incident note.",
      mode: "brainstorm",
    });

    expect(await repo.getConversation(bob, conversation.id)).toBeNull();
    expect(await repo.listConversations(bob)).toEqual([]);
    expect((await repo.getConversation(alice, conversation.id))?.messages).toHaveLength(1);
  });
});
