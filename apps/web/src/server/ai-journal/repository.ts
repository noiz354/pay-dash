import "server-only";

import { randomUUID } from "node:crypto";
import { FieldValue, Timestamp, type Firestore } from "firebase-admin/firestore";
import {
  isFeedbackRating,
  isJournalMode,
  isJournalReportKind,
  type JournalConversation,
  type JournalConversationWithMessages,
  type JournalEvaluationSummary,
  type JournalFeedback,
  type JournalFeedbackRating,
  type JournalMessage,
  type JournalMessageRole,
  type JournalMode,
  type JournalReport,
  type JournalReportKind,
} from "@/lib/ai-journal/types";
import { getFirebaseAdminFirestore } from "@/server/firebase/admin";

const MAX_LISTED_CONVERSATIONS = 30;
const MAX_MESSAGES_PER_CONVERSATION = 100;
const MAX_EVALUATED_CONVERSATIONS = 50;

export type AppendJournalMessageInput = {
  role: JournalMessageRole;
  text: string;
  mode: JournalMode;
};

export type CreateJournalConversationInput = {
  title: string;
  mode: JournalMode;
  tags?: string[];
};

export type FeedbackInput = {
  rating: JournalFeedbackRating;
  reason: string;
};

export type SaveJournalReportInput = {
  kind: JournalReportKind;
  title: string;
  body: string;
  sourceConversationId: string;
  sourceMessageId: string;
  redacted: boolean;
};

export type JournalRepository = {
  listConversations(uid: string): Promise<JournalConversation[]>;
  createConversation(uid: string, input: CreateJournalConversationInput): Promise<JournalConversation>;
  getConversation(uid: string, conversationId: string): Promise<JournalConversationWithMessages | null>;
  appendMessage(uid: string, conversationId: string, input: AppendJournalMessageInput): Promise<JournalMessage>;
  updateMessageFeedback(
    uid: string,
    conversationId: string,
    messageId: string,
    input: FeedbackInput
  ): Promise<JournalMessage | null>;
  saveReport(uid: string, input: SaveJournalReportInput): Promise<JournalReport>;
  getEvaluationSummary(uid: string): Promise<JournalEvaluationSummary>;
};

type StoredConversation = {
  title?: unknown;
  mode?: unknown;
  createdAt?: unknown;
  updatedAt?: unknown;
  messageCount?: unknown;
  tags?: unknown;
};

type StoredMessage = {
  role?: unknown;
  text?: unknown;
  mode?: unknown;
  createdAt?: unknown;
  feedback?: unknown;
};

type StoredReport = {
  kind?: unknown;
  title?: unknown;
  body?: unknown;
  sourceConversationId?: unknown;
  sourceMessageId?: unknown;
  redacted?: unknown;
  createdAt?: unknown;
};

type UserMemoryStore = {
  conversations: Map<string, JournalConversationWithMessages>;
  reports: Map<string, JournalReport>;
};

type MemoryStore = Map<string, UserMemoryStore>;

declare global {
  var __paydashAiJournalStore: MemoryStore | undefined;
}

function dateIso(value: unknown): string {
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string" && value.length > 0) return value;
  return new Date().toISOString();
}

function numberOrZero(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function stringOrFallback(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim().length > 0 ? value : fallback;
}

function modeOrDefault(value: unknown): JournalMode {
  return typeof value === "string" && isJournalMode(value) ? value : "journal";
}

function roleOrDefault(value: unknown): JournalMessageRole {
  return value === "model" ? "model" : "user";
}

function reportKindOrDefault(value: unknown): JournalReportKind {
  return typeof value === "string" && isJournalReportKind(value) ? value : "note";
}

function tagsOrEmpty(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string").slice(0, 8);
}

function mapFeedback(value: unknown): JournalFeedback | undefined {
  if (!value || typeof value !== "object") return undefined;
  const data = value as { rating?: unknown; reason?: unknown; createdAt?: unknown };
  if (typeof data.rating !== "string" || !isFeedbackRating(data.rating)) return undefined;
  return {
    rating: data.rating,
    reason: stringOrFallback(data.reason, "No reason supplied"),
    createdAt: dateIso(data.createdAt),
  };
}

function stripUndefined(value: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined));
}

function userInteractions(db: Firestore, uid: string) {
  return db.collection("users").doc(uid).collection("interactions");
}

function userReports(db: Firestore, uid: string) {
  return db.collection("users").doc(uid).collection("reports");
}

function mapConversation(id: string, data: StoredConversation): JournalConversation {
  return {
    id,
    title: stringOrFallback(data.title, "Untitled journal"),
    mode: modeOrDefault(data.mode),
    createdAt: dateIso(data.createdAt),
    updatedAt: dateIso(data.updatedAt),
    messageCount: numberOrZero(data.messageCount),
    tags: tagsOrEmpty(data.tags),
  };
}

function mapMessage(id: string, data: StoredMessage): JournalMessage {
  return {
    id,
    role: roleOrDefault(data.role),
    text: typeof data.text === "string" ? data.text : "",
    mode: modeOrDefault(data.mode),
    createdAt: dateIso(data.createdAt),
    feedback: mapFeedback(data.feedback),
  };
}

function mapReport(id: string, data: StoredReport): JournalReport {
  return {
    id,
    kind: reportKindOrDefault(data.kind),
    title: stringOrFallback(data.title, "Saved AI report"),
    body: typeof data.body === "string" ? data.body : "",
    sourceConversationId: stringOrFallback(data.sourceConversationId, "unknown"),
    sourceMessageId: stringOrFallback(data.sourceMessageId, "unknown"),
    redacted: data.redacted === true,
    createdAt: dateIso(data.createdAt),
  };
}

function buildReadinessChecks(summary: Omit<JournalEvaluationSummary, "readinessChecks">): JournalEvaluationSummary["readinessChecks"] {
  return [
    {
      id: "has-conversation",
      label: "At least one private AI conversation",
      complete: summary.conversationCount > 0,
      detail: `${summary.conversationCount} conversations stored under this Firebase UID.`,
    },
    {
      id: "multi-turn",
      label: "Multi-turn journal evidence",
      complete: summary.messageCount >= 2,
      detail: `${summary.messageCount} messages persisted across user/model roles.`,
    },
    {
      id: "paydash-agents",
      label: "PayDash-specific agent usage",
      complete: Boolean(
        summary.agentModeCounts["ops-copilot"] ||
          summary.agentModeCounts["recovery-agent"] ||
          summary.agentModeCounts["readiness-agent"]
      ),
      detail: "Use Ops, Recovery, or Readiness page to prove authenticity beyond a generic journal.",
    },
    {
      id: "feedback",
      label: "Human feedback captured",
      complete: summary.usefulFeedbackCount + summary.needsWorkFeedbackCount > 0,
      detail: `${summary.usefulFeedbackCount} useful / ${summary.needsWorkFeedbackCount} needs-work feedback events.`,
    },
    {
      id: "reports",
      label: "Reusable report artifact saved",
      complete: summary.reportCount > 0,
      detail: `${summary.reportCount} saved report artifacts.`,
    },
  ];
}

function summarize(conversations: JournalConversationWithMessages[], reportCount: number): JournalEvaluationSummary {
  const summary: Omit<JournalEvaluationSummary, "readinessChecks"> = {
    conversationCount: conversations.length,
    messageCount: conversations.reduce((sum, conversation) => sum + conversation.messages.length, 0),
    reportCount,
    usefulFeedbackCount: 0,
    needsWorkFeedbackCount: 0,
    agentModeCounts: {},
  };

  for (const conversation of conversations) {
    summary.agentModeCounts[conversation.mode] = (summary.agentModeCounts[conversation.mode] ?? 0) + 1;
    for (const message of conversation.messages) {
      if (message.feedback?.rating === "useful") summary.usefulFeedbackCount += 1;
      if (message.feedback?.rating === "needs-work") summary.needsWorkFeedbackCount += 1;
    }
  }

  return { ...summary, readinessChecks: buildReadinessChecks(summary) };
}

export class FirestoreJournalRepository implements JournalRepository {
  constructor(private readonly db: Firestore) {}

  async listConversations(uid: string): Promise<JournalConversation[]> {
    const snapshot = await userInteractions(this.db, uid)
      .orderBy("updatedAt", "desc")
      .limit(MAX_LISTED_CONVERSATIONS)
      .get();

    return snapshot.docs.map((doc) => mapConversation(doc.id, doc.data() as StoredConversation));
  }

  async createConversation(uid: string, input: CreateJournalConversationInput): Promise<JournalConversation> {
    const ref = userInteractions(this.db, uid).doc();
    const now = FieldValue.serverTimestamp();

    await ref.set(
      stripUndefined({
        ownerUid: uid,
        title: input.title,
        mode: input.mode,
        tags: input.tags ?? [],
        createdAt: now,
        updatedAt: now,
        messageCount: 0,
      })
    );

    return {
      id: ref.id,
      title: input.title,
      mode: input.mode,
      tags: input.tags ?? [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      messageCount: 0,
    };
  }

  async getConversation(uid: string, conversationId: string): Promise<JournalConversationWithMessages | null> {
    const ref = userInteractions(this.db, uid).doc(conversationId);
    const doc = await ref.get();
    if (!doc.exists) return null;

    const messages = await ref
      .collection("messages")
      .orderBy("createdAt", "asc")
      .limit(MAX_MESSAGES_PER_CONVERSATION)
      .get();

    return {
      ...mapConversation(doc.id, doc.data() as StoredConversation),
      messages: messages.docs.map((message) => mapMessage(message.id, message.data() as StoredMessage)),
    };
  }

  async appendMessage(uid: string, conversationId: string, input: AppendJournalMessageInput): Promise<JournalMessage> {
    const conversationRef = userInteractions(this.db, uid).doc(conversationId);
    const messageRef = conversationRef.collection("messages").doc();
    const now = FieldValue.serverTimestamp();

    await this.db.runTransaction(async (transaction) => {
      const conversation = await transaction.get(conversationRef);
      if (!conversation.exists) {
        throw new Error("Conversation not found.");
      }

      transaction.set(
        messageRef,
        stripUndefined({
          role: input.role,
          text: input.text,
          mode: input.mode,
          createdAt: now,
        })
      );
      transaction.set(
        conversationRef,
        stripUndefined({
          ownerUid: uid,
          mode: input.mode,
          updatedAt: now,
          messageCount: FieldValue.increment(1),
        }),
        { merge: true }
      );
    });

    return {
      id: messageRef.id,
      role: input.role,
      text: input.text,
      mode: input.mode,
      createdAt: new Date().toISOString(),
    };
  }

  async updateMessageFeedback(
    uid: string,
    conversationId: string,
    messageId: string,
    input: FeedbackInput
  ): Promise<JournalMessage | null> {
    const messageRef = userInteractions(this.db, uid).doc(conversationId).collection("messages").doc(messageId);
    const existing = await messageRef.get();
    if (!existing.exists) return null;

    const feedback = {
      rating: input.rating,
      reason: input.reason,
      createdAt: FieldValue.serverTimestamp(),
    };

    await messageRef.set({ feedback }, { merge: true });
    const updated = await messageRef.get();
    if (!updated.exists) return null;
    return mapMessage(updated.id, updated.data() as StoredMessage);
  }

  async saveReport(uid: string, input: SaveJournalReportInput): Promise<JournalReport> {
    const source = await this.getConversation(uid, input.sourceConversationId);
    if (!source?.messages.some((message) => message.id === input.sourceMessageId)) {
      throw new Error("Conversation not found.");
    }

    const reportRef = userReports(this.db, uid).doc();
    const createdAt = FieldValue.serverTimestamp();
    await reportRef.set(
      stripUndefined({
        kind: input.kind,
        title: input.title,
        body: input.body,
        sourceConversationId: input.sourceConversationId,
        sourceMessageId: input.sourceMessageId,
        redacted: input.redacted,
        createdAt,
      })
    );

    return {
      id: reportRef.id,
      kind: input.kind,
      title: input.title,
      body: input.body,
      sourceConversationId: input.sourceConversationId,
      sourceMessageId: input.sourceMessageId,
      redacted: input.redacted,
      createdAt: new Date().toISOString(),
    };
  }

  async getEvaluationSummary(uid: string): Promise<JournalEvaluationSummary> {
    const conversationRows = await userInteractions(this.db, uid)
      .orderBy("updatedAt", "desc")
      .limit(MAX_EVALUATED_CONVERSATIONS)
      .get();
    const conversations = await Promise.all(
      conversationRows.docs.map((doc) => this.getConversation(uid, doc.id))
    );
    const reports = await userReports(this.db, uid).limit(100).get();
    return summarize(
      conversations.filter((conversation): conversation is JournalConversationWithMessages => Boolean(conversation)),
      reports.size
    );
  }
}

class MemoryJournalRepository implements JournalRepository {
  private readonly store: MemoryStore;

  constructor() {
    globalThis.__paydashAiJournalStore ??= new Map();
    this.store = globalThis.__paydashAiJournalStore;
  }

  async listConversations(uid: string): Promise<JournalConversation[]> {
    return [...this.userStore(uid).conversations.values()]
      .map(({ messages: _messages, ...conversation }) => conversation)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, MAX_LISTED_CONVERSATIONS);
  }

  async createConversation(uid: string, input: CreateJournalConversationInput): Promise<JournalConversation> {
    const now = new Date().toISOString();
    const conversation: JournalConversationWithMessages = {
      id: randomUUID(),
      title: input.title,
      mode: input.mode,
      tags: input.tags ?? [],
      createdAt: now,
      updatedAt: now,
      messageCount: 0,
      messages: [],
    };

    this.userStore(uid).conversations.set(conversation.id, conversation);
    const { messages: _messages, ...withoutMessages } = conversation;
    return withoutMessages;
  }

  async getConversation(uid: string, conversationId: string): Promise<JournalConversationWithMessages | null> {
    const conversation = this.userStore(uid).conversations.get(conversationId);
    if (!conversation) return null;
    return { ...conversation, messages: conversation.messages.map((message) => ({ ...message })) };
  }

  async appendMessage(uid: string, conversationId: string, input: AppendJournalMessageInput): Promise<JournalMessage> {
    const conversation = this.userStore(uid).conversations.get(conversationId);
    if (!conversation) throw new Error("Conversation not found.");

    const message: JournalMessage = {
      id: randomUUID(),
      role: input.role,
      text: input.text,
      mode: input.mode,
      createdAt: new Date().toISOString(),
    };

    conversation.messages.push(message);
    conversation.mode = input.mode;
    conversation.updatedAt = message.createdAt;
    conversation.messageCount = conversation.messages.length;
    return message;
  }

  async updateMessageFeedback(
    uid: string,
    conversationId: string,
    messageId: string,
    input: FeedbackInput
  ): Promise<JournalMessage | null> {
    const conversation = this.userStore(uid).conversations.get(conversationId);
    const message = conversation?.messages.find((entry) => entry.id === messageId);
    if (!message) return null;
    message.feedback = {
      rating: input.rating,
      reason: input.reason,
      createdAt: new Date().toISOString(),
    };
    return { ...message };
  }

  async saveReport(uid: string, input: SaveJournalReportInput): Promise<JournalReport> {
    const conversation = this.userStore(uid).conversations.get(input.sourceConversationId);
    if (!conversation?.messages.some((message) => message.id === input.sourceMessageId)) {
      throw new Error("Conversation not found.");
    }

    const report: JournalReport = {
      id: randomUUID(),
      kind: input.kind,
      title: input.title,
      body: input.body,
      sourceConversationId: input.sourceConversationId,
      sourceMessageId: input.sourceMessageId,
      redacted: input.redacted,
      createdAt: new Date().toISOString(),
    };
    this.userStore(uid).reports.set(report.id, report);
    return report;
  }

  async getEvaluationSummary(uid: string): Promise<JournalEvaluationSummary> {
    const userStore = this.userStore(uid);
    return summarize([...userStore.conversations.values()], userStore.reports.size);
  }

  private userStore(uid: string) {
    const existing = this.store.get(uid);
    if (existing) return existing;

    const created: UserMemoryStore = { conversations: new Map(), reports: new Map() };
    this.store.set(uid, created);
    return created;
  }
}

let memoryRepository: JournalRepository | undefined;
let firestoreRepository: JournalRepository | undefined;

export function getJournalRepository(): JournalRepository {
  const useMemory = process.env.NODE_ENV !== "production" && process.env.AI_JOURNAL_STORAGE_MODE === "memory";
  if (useMemory) {
    memoryRepository ??= new MemoryJournalRepository();
    return memoryRepository;
  }

  firestoreRepository ??= new FirestoreJournalRepository(getFirebaseAdminFirestore());
  return firestoreRepository;
}
