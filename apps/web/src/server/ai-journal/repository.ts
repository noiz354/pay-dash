import "server-only";

import { randomUUID } from "node:crypto";
import { FieldValue, Timestamp, type Firestore } from "firebase-admin/firestore";
import { isJournalMode, type JournalConversation, type JournalConversationWithMessages, type JournalMessage, type JournalMessageRole, type JournalMode } from "@/lib/ai-journal/types";
import { getFirebaseAdminFirestore } from "@/server/firebase/admin";

const MAX_LISTED_CONVERSATIONS = 30;
const MAX_MESSAGES_PER_CONVERSATION = 100;

export type AppendJournalMessageInput = {
  role: JournalMessageRole;
  text: string;
  mode: JournalMode;
};

export type CreateJournalConversationInput = {
  title: string;
  mode: JournalMode;
};

export type JournalRepository = {
  listConversations(uid: string): Promise<JournalConversation[]>;
  createConversation(uid: string, input: CreateJournalConversationInput): Promise<JournalConversation>;
  getConversation(uid: string, conversationId: string): Promise<JournalConversationWithMessages | null>;
  appendMessage(uid: string, conversationId: string, input: AppendJournalMessageInput): Promise<JournalMessage>;
};

type StoredConversation = {
  title?: unknown;
  mode?: unknown;
  createdAt?: unknown;
  updatedAt?: unknown;
  messageCount?: unknown;
};

type StoredMessage = {
  role?: unknown;
  text?: unknown;
  mode?: unknown;
  createdAt?: unknown;
};

type MemoryStore = Map<string, Map<string, JournalConversationWithMessages>>;

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

function modeOrDefault(value: unknown): JournalMode {
  return typeof value === "string" && isJournalMode(value) ? value : "journal";
}

function roleOrDefault(value: unknown): JournalMessageRole {
  return value === "model" ? "model" : "user";
}

function stripUndefined(value: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined));
}

function userInteractions(db: Firestore, uid: string) {
  return db.collection("users").doc(uid).collection("interactions");
}

function mapConversation(id: string, data: StoredConversation): JournalConversation {
  return {
    id,
    title: typeof data.title === "string" && data.title.length > 0 ? data.title : "Untitled journal",
    mode: modeOrDefault(data.mode),
    createdAt: dateIso(data.createdAt),
    updatedAt: dateIso(data.updatedAt),
    messageCount: numberOrZero(data.messageCount),
  };
}

function mapMessage(id: string, data: StoredMessage): JournalMessage {
  return {
    id,
    role: roleOrDefault(data.role),
    text: typeof data.text === "string" ? data.text : "",
    mode: modeOrDefault(data.mode),
    createdAt: dateIso(data.createdAt),
  };
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
        createdAt: now,
        updatedAt: now,
        messageCount: 0,
      })
    );

    return {
      id: ref.id,
      title: input.title,
      mode: input.mode,
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
}

class MemoryJournalRepository implements JournalRepository {
  private readonly store: MemoryStore;

  constructor() {
    globalThis.__paydashAiJournalStore ??= new Map();
    this.store = globalThis.__paydashAiJournalStore;
  }

  async listConversations(uid: string): Promise<JournalConversation[]> {
    return [...this.userStore(uid).values()]
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
      createdAt: now,
      updatedAt: now,
      messageCount: 0,
      messages: [],
    };

    this.userStore(uid).set(conversation.id, conversation);
    const { messages: _messages, ...withoutMessages } = conversation;
    return withoutMessages;
  }

  async getConversation(uid: string, conversationId: string): Promise<JournalConversationWithMessages | null> {
    const conversation = this.userStore(uid).get(conversationId);
    if (!conversation) return null;
    return { ...conversation, messages: [...conversation.messages] };
  }

  async appendMessage(uid: string, conversationId: string, input: AppendJournalMessageInput): Promise<JournalMessage> {
    const conversation = this.userStore(uid).get(conversationId);
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

  private userStore(uid: string) {
    const existing = this.store.get(uid);
    if (existing) return existing;

    const created = new Map<string, JournalConversationWithMessages>();
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
