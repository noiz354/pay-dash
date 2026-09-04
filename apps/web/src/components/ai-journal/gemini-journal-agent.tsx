"use client";

import { useCallback, useEffect, useState } from "react";
import {
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  signOut as firebaseSignOut,
  type Auth,
  type User,
} from "firebase/auth";
import { AlertCircle, Loader2, LogOut, Plus, Send, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  getBuildTimeFirebaseClientStatus,
  getFirebaseAuth,
  getGoogleAuthProvider,
  normalizeFirebaseClientStatus,
  type FirebaseClientStatus,
} from "@/lib/firebase/client";
import {
  JOURNAL_MODE_META,
  JOURNAL_MODES,
  type JournalConversation,
  type JournalConversationWithMessages,
  type JournalMessage,
  type JournalMode,
} from "@/lib/ai-journal/types";

type ConversationsResponse = {
  conversations: JournalConversation[];
};

type ConversationResponse = {
  conversation: JournalConversationWithMessages;
};

type ChatResponse = {
  conversationId: string;
  model?: string;
  reply?: JournalMessage;
  conversation?: JournalConversationWithMessages;
  error?: string;
  savedUserMessage?: boolean;
  messages?: JournalMessage[];
  unsavedReply?: string;
};

export type GeminiQuickPrompt = { mode: JournalMode; text: string; title?: string };

type GeminiJournalAgentProps = {
  initialMode?: JournalMode;
  availableModes?: JournalMode[];
  quickPrompts?: GeminiQuickPrompt[];
  emptyTitle?: string;
};

const DEFAULT_QUICK_PROMPTS: GeminiQuickPrompt[] = [
  {
    mode: "brainstorm",
    text: "Brainstorm a unique Personal Gemini Journal feature for APAC merchants that still stays simple enough for the Ideathon.",
  },
  {
    mode: "journal",
    text: "I had three failed payments and one delayed payout today. Help me write a calm ops journal and next actions.",
  },
  {
    mode: "submission-review",
    text: "Review my submission readiness: Firebase Auth, Firestore user isolation, Gemini, Secret Manager, Cloud Run, public repo, and social post.",
  },
];

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "just now";
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(date);
}

async function readJsonResponse<T>(response: Response): Promise<T> {
  const payload = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new Error(payload.error ?? `Request failed with ${response.status}`);
  return payload;
}

function MissingFirebaseConfig({ missing }: { missing: string[] }) {
  return (
    <div className="rounded-xl border border-[var(--pending-status)]/30 bg-[var(--pending-status)]/10 p-4 text-[var(--on-surface)]">
      <div className="flex items-start gap-3">
        <AlertCircle className="mt-0.5 size-5 text-[var(--pending-status)]" aria-hidden="true" />
        <div className="space-y-2">
          <p className="font-semibold">Firebase client config belum lengkap.</p>
          <p className="body-sm text-[var(--on-surface-variant)]">
            Tambahkan nilai berikut di Cloud Run atau `.env.local` sebelum demo publik:
          </p>
          <ul className="list-disc pl-5 body-sm text-[var(--on-surface-variant)]">
            {missing.map((key) => (
              <li key={key} className="data-mono">{key}</li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

function SignInPanel({ onSignIn, loading }: { onSignIn: () => Promise<void>; loading: boolean }) {
  return (
    <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
      <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-container-lowest)] p-5">
        <div className="mb-4 inline-flex size-11 items-center justify-center rounded-full bg-[var(--primary)]/10 text-[var(--primary)]">
          <ShieldCheck className="size-5" aria-hidden="true" />
        </div>
        <h2 className="headline-md text-[var(--on-surface)]">Masuk dengan Firebase Authentication</h2>
        <p className="body-sm mt-2 max-w-xl text-[var(--on-surface-variant)]">
          Prototype ini menggunakan Google Sign-In via Firebase. Browser hanya menerima ID token; Gemini API key tetap
          berada di server dan dibaca dari Google Cloud Secret Manager.
        </p>
        <Button onClick={onSignIn} disabled={loading} className="mt-5 bg-[var(--primary)] text-white hover:bg-[var(--primary)]/90">
          {loading ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
          Continue with Google
        </Button>
      </div>
      <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-container-low)] p-5">
        <p className="label-caps text-[var(--on-surface-variant)]">Security proof</p>
        <ul className="mt-3 space-y-3 body-sm text-[var(--on-surface-variant)]">
          <li className="flex gap-2"><span className="text-[var(--success-status)]">✓</span> Firebase ID token verified on every API request.</li>
          <li className="flex gap-2">
            <span className="text-[var(--success-status)]">✓</span>
            <span>
              Firestore writes are scoped to <code className="data-mono">users/{"{uid}"}/interactions</code>.
            </span>
          </li>
          <li className="flex gap-2"><span className="text-[var(--success-status)]">✓</span> Gemini calls happen server-side only.</li>
          <li className="flex gap-2"><span className="text-[var(--success-status)]">✓</span> Secret Manager loads the Gemini key at runtime.</li>
        </ul>
      </div>
    </div>
  );
}

function MessageBubble({ message }: { message: JournalMessage }) {
  const isUser = message.role === "user";
  return (
    <article className={cn("flex", isUser ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[86%] rounded-2xl border px-4 py-3 shadow-sm",
          isUser
            ? "border-[var(--primary)]/20 bg-[var(--primary)] text-white"
            : "border-[var(--border-subtle)] bg-white text-[var(--on-surface)]"
        )}
      >
        <div className="mb-1 flex flex-wrap items-center gap-2">
          <Badge variant={isUser ? "secondary" : "outline"} className={isUser ? "bg-white/15 text-white" : undefined}>
            {isUser ? "You" : JOURNAL_MODE_META[message.mode].shortLabel}
          </Badge>
          <span className={cn("data-mono text-[11px]", isUser ? "text-white/75" : "text-[var(--on-surface-variant)]")}>
            {formatTime(message.createdAt)}
          </span>
        </div>
        <p className="body-sm whitespace-pre-wrap break-words">{message.text}</p>
      </div>
    </article>
  );
}

export function GeminiJournalAgent({
  initialMode = "brainstorm",
  availableModes = [...JOURNAL_MODES],
  quickPrompts = DEFAULT_QUICK_PROMPTS,
  emptyTitle = "Start a secure Gemini journal",
}: GeminiJournalAgentProps = {}) {
  const modeChoices = availableModes.length > 0 ? availableModes : [...JOURNAL_MODES];
  const [firebaseStatus, setFirebaseStatus] = useState<FirebaseClientStatus | null>(null);
  const [auth, setAuth] = useState<Auth | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);
  const [conversations, setConversations] = useState<JournalConversation[]>([]);
  const [currentConversation, setCurrentConversation] = useState<JournalConversationWithMessages | null>(null);
  const [mode, setMode] = useState<JournalMode>(initialMode);
  const [input, setInput] = useState("");
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastModel, setLastModel] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadRuntimeFirebaseConfig() {
      try {
        const response = await fetch("/api/ai-journal/firebase-config", { cache: "no-store" });
        const payload = await response.json();
        if (!cancelled) setFirebaseStatus(normalizeFirebaseClientStatus(payload));
      } catch {
        if (!cancelled) setFirebaseStatus(getBuildTimeFirebaseClientStatus());
      }
    }

    void loadRuntimeFirebaseConfig();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!firebaseStatus) return;
    if (!firebaseStatus.configured || !firebaseStatus.config) {
      setAuthReady(true);
      return;
    }

    const firebaseAuth = getFirebaseAuth(firebaseStatus.config);
    setAuth(firebaseAuth);

    return onAuthStateChanged(firebaseAuth, (nextUser) => {
      setUser(nextUser);
      setAuthReady(true);
    });
  }, [firebaseStatus]);

  const authorizedFetch = useCallback(
    async (inputUrl: string, init: RequestInit = {}) => {
      if (!user) throw new Error("Sign in first.");
      const token = await user.getIdToken();
      const headers = new Headers(init.headers);
      headers.set("authorization", `Bearer ${token}`);
      headers.set("content-type", "application/json");
      return fetch(inputUrl, { ...init, headers });
    },
    [user]
  );

  const loadConversations = useCallback(async () => {
    if (!user) return;
    setLoadingHistory(true);
    setError(null);
    try {
      const response = await authorizedFetch("/api/ai-journal/conversations");
      const payload = await readJsonResponse<ConversationsResponse>(response);
      setConversations(payload.conversations);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load conversations.");
    } finally {
      setLoadingHistory(false);
    }
  }, [authorizedFetch, user]);

  useEffect(() => {
    if (user) {
      void loadConversations();
    } else {
      setConversations([]);
      setCurrentConversation(null);
    }
  }, [loadConversations, user]);

  async function handleSignIn() {
    if (!auth) return;
    setAuthLoading(true);
    setError(null);
    try {
      await signInWithPopup(auth, getGoogleAuthProvider());
    } catch (signInError) {
      const message = signInError instanceof Error ? signInError.message : "Popup sign-in failed.";
      if (message.toLowerCase().includes("popup")) {
        await signInWithRedirect(auth, getGoogleAuthProvider());
      } else {
        setError(message);
      }
    } finally {
      setAuthLoading(false);
    }
  }

  async function openConversation(conversationId: string) {
    setLoadingHistory(true);
    setError(null);
    try {
      const response = await authorizedFetch(`/api/ai-journal/conversations/${conversationId}`);
      const payload = await readJsonResponse<ConversationResponse>(response);
      setCurrentConversation(payload.conversation);
      setMode(modeChoices.includes(payload.conversation.mode) ? payload.conversation.mode : initialMode);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to open conversation.");
    } finally {
      setLoadingHistory(false);
    }
  }

  async function submitMessage(nextInput = input, nextMode = mode) {
    const trimmed = nextInput.trim();
    if (!trimmed || sending) return;

    setSending(true);
    setError(null);
    try {
      const response = await authorizedFetch("/api/ai-journal/chat", {
        method: "POST",
        body: JSON.stringify({
          conversationId: currentConversation?.id,
          message: trimmed,
          mode: nextMode,
        }),
      });
      const payload = await readJsonResponse<ChatResponse>(response);
      if (payload.conversation) {
        setCurrentConversation(payload.conversation);
      } else if (payload.messages) {
        const messages = payload.messages;
        setCurrentConversation((previous) =>
          previous
            ? { ...previous, messages }
            : {
                id: payload.conversationId,
                title: trimmed.slice(0, 68),
                mode: nextMode,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                messageCount: messages.length,
                messages,
              }
        );
      }
      setLastModel(payload.model ?? null);
      setInput("");
      await loadConversations();
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : "Gemini request failed. Your draft was kept locally.");
    } finally {
      setSending(false);
    }
  }

  if (!authReady) {
    return (
      <div className="flex min-h-[320px] items-center justify-center text-[var(--on-surface-variant)]">
        <Loader2 className="mr-2 size-4 animate-spin" aria-hidden="true" /> Loading Firebase session…
      </div>
    );
  }

  if (!firebaseStatus || !firebaseStatus.configured) {
    return <MissingFirebaseConfig missing={firebaseStatus?.missing ?? []} />;
  }

  if (!user) {
    return (
      <div className="space-y-4">
        {error ? <div className="rounded-lg border border-[var(--error)]/30 bg-[var(--error)]/10 p-3 body-sm text-[var(--on-error-container)]">{error}</div> : null}
        <SignInPanel onSignIn={handleSignIn} loading={authLoading} />
      </div>
    );
  }

  return (
    <div className="grid min-h-[680px] gap-4 lg:grid-cols-[300px_1fr]">
      <aside className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-container-lowest)] p-4">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="label-caps text-[var(--on-surface-variant)]">Signed in</p>
            <p className="truncate body-sm font-semibold text-[var(--on-surface)]">{user.displayName ?? user.email ?? user.uid}</p>
          </div>
          <Button
            variant="outline"
            size="icon-sm"
            title="Sign out"
            onClick={() => auth && void firebaseSignOut(auth)}
            className="shrink-0"
          >
            <LogOut className="size-4" aria-hidden="true" />
          </Button>
        </div>

        <Button
          variant="outline"
          className="mb-4 w-full justify-start border-[var(--border-subtle)]"
          onClick={() => {
            setCurrentConversation(null);
            setInput("");
            setLastModel(null);
          }}
        >
          <Plus className="size-4" aria-hidden="true" /> New private thread
        </Button>

        <div className="mb-3 flex items-center justify-between">
          <p className="label-caps text-[var(--on-surface-variant)]">Firestore history</p>
          {loadingHistory ? <Loader2 className="size-3.5 animate-spin text-[var(--on-surface-variant)]" aria-hidden="true" /> : null}
        </div>
        <div className="space-y-2">
          {conversations.length === 0 ? (
            <p className="rounded-lg bg-[var(--surface-container-low)] p-3 body-sm text-[var(--on-surface-variant)]">
              No saved journals yet. Send your first prompt to create <code className="data-mono">users/{"{uid}"}/interactions</code>.
            </p>
          ) : (
            conversations.map((conversation) => (
              <button
                key={conversation.id}
                type="button"
                onClick={() => void openConversation(conversation.id)}
                className={cn(
                  "w-full rounded-lg border p-3 text-left transition-colors",
                  currentConversation?.id === conversation.id
                    ? "border-[var(--primary)] bg-[var(--primary)]/10"
                    : "border-[var(--border-subtle)] bg-white hover:border-[var(--primary)]/40"
                )}
              >
                <span className="line-clamp-2 body-sm font-semibold text-[var(--on-surface)]">{conversation.title}</span>
                <span className="mt-2 flex items-center justify-between gap-2 text-[11px] text-[var(--on-surface-variant)]">
                  <span>{JOURNAL_MODE_META[conversation.mode].shortLabel}</span>
                  <span className="data-mono">{conversation.messageCount} msgs</span>
                </span>
              </button>
            ))
          )}
        </div>
      </aside>

      <section className="flex min-h-[680px] flex-col rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-container-lowest)]">
        <div className="border-b border-[var(--border-subtle)] p-4">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <p className="label-caps text-[var(--on-surface-variant)]">AI Agent mode</p>
              <h2 className="headline-md text-[var(--on-surface)]">
                {currentConversation?.title ?? emptyTitle}
              </h2>
            </div>
            <div className="flex flex-wrap gap-2">
              {modeChoices.map((journalMode) => {
                const meta = JOURNAL_MODE_META[journalMode];
                const active = mode === journalMode;
                return (
                  <button
                    key={journalMode}
                    type="button"
                    onClick={() => setMode(journalMode)}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 body-sm font-medium transition-colors",
                      active
                        ? "border-[var(--primary)] bg-[var(--primary)] text-white"
                        : "border-[var(--border-subtle)] bg-white text-[var(--on-surface-variant)] hover:border-[var(--primary)]/40"
                    )}
                    title={meta.description}
                  >
                    <span className="material-symbols-outlined text-[18px]" aria-hidden="true">{meta.icon}</span>
                    {meta.shortLabel}
                  </button>
                );
              })}
            </div>
          </div>
          {lastModel ? <p className="mt-2 data-mono text-[11px] text-[var(--on-surface-variant)]">Last Gemini model: {lastModel}</p> : null}
        </div>

        {error ? (
          <div className="mx-4 mt-4 rounded-lg border border-[var(--error)]/30 bg-[var(--error)]/10 p-3 body-sm text-[var(--on-error-container)]">
            {error}
          </div>
        ) : null}

        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          {currentConversation?.messages.length ? (
            currentConversation.messages.map((message) => <MessageBubble key={message.id} message={message} />)
          ) : (
            <div className="grid gap-4 lg:grid-cols-3">
              {quickPrompts.map((prompt) => (
                <button
                  key={prompt.text}
                  type="button"
                  onClick={() => {
                    setMode(prompt.mode);
                    setInput(prompt.text);
                  }}
                  className="rounded-xl border border-[var(--border-subtle)] bg-white p-4 text-left shadow-sm transition-colors hover:border-[var(--primary)]/50"
                >
                  <Badge variant="outline" className="mb-3">{prompt.title ?? JOURNAL_MODE_META[prompt.mode].shortLabel}</Badge>
                  <p className="body-sm text-[var(--on-surface)]">{prompt.text}</p>
                </button>
              ))}
            </div>
          )}
        </div>

        <form
          className="border-t border-[var(--border-subtle)] p-4"
          onSubmit={(event) => {
            event.preventDefault();
            void submitMessage();
          }}
        >
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="border-[var(--primary)]/30 text-[var(--primary)]">
              {JOURNAL_MODE_META[mode].label}
            </Badge>
            <span className="body-sm text-[var(--on-surface-variant)]">{JOURNAL_MODE_META[mode].description}</span>
          </div>
          <div className="flex flex-col gap-3 md:flex-row">
            <Textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="Write a private reflection, paste your Ideathon checklist, or ask the Brainstorm Skill to refine an agent idea…"
              className="min-h-24 flex-1 resize-y bg-white"
              disabled={sending}
            />
            <div className="flex flex-row gap-2 md:w-36 md:flex-col">
              <Button type="submit" disabled={sending || !input.trim()} className="flex-1 bg-[var(--primary)] text-white hover:bg-[var(--primary)]/90">
                {sending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Send className="size-4" aria-hidden="true" />}
                Send
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={sending}
                className="flex-1 border-[var(--border-subtle)]"
                onClick={() => void submitMessage("Draft a concise Ideathon brief for this app under 1024 characters and mention Firebase Auth, Firestore, Cloud Run, Gemini, and Secret Manager.", "submission-review")}
              >
                Brief
              </Button>
            </div>
          </div>
        </form>
      </section>
    </div>
  );
}
