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
import { AlertCircle, Clipboard, FileText, Loader2, LogOut, Plus, RotateCcw, Save, Send, ShieldCheck, ThumbsDown, ThumbsUp } from "lucide-react";
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
  type JournalReportKind,
} from "@/lib/ai-journal/types";
import { copySafeText, hasUnsafePromptIntent } from "@/lib/ai-journal/safety";

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
  retryAfterSeconds?: number;
};

type AppendMessageResponse = {
  message: JournalMessage;
  conversation: JournalConversationWithMessages | null;
};

type FeedbackResponse = {
  message: JournalMessage;
};

export type GeminiQuickPrompt = { mode: JournalMode; text: string; title?: string };

type GeminiJournalAgentProps = {
  initialMode?: JournalMode;
  availableModes?: JournalMode[];
  quickPrompts?: GeminiQuickPrompt[];
  emptyTitle?: string;
  threadTags?: string[];
  reportKind?: JournalReportKind;
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

function MessageBubble({
  message,
  conversationId,
  redactCopies,
  onTransform,
  onFeedback,
  onSaveReport,
}: {
  message: JournalMessage;
  conversationId?: string;
  redactCopies: boolean;
  onTransform: (instruction: string, mode: JournalMode) => void;
  onFeedback: (message: JournalMessage, rating: "useful" | "needs-work", reason: string) => Promise<void>;
  onSaveReport: (message: JournalMessage) => Promise<void>;
}) {
  const isUser = message.role === "user";
  const [copied, setCopied] = useState(false);
  const [busyAction, setBusyAction] = useState<string | null>(null);

  async function copyMessage() {
    await navigator.clipboard.writeText(copySafeText(message.text, redactCopies));
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1_400);
  }

  async function runAction(label: string, action: () => Promise<void>) {
    setBusyAction(label);
    try {
      await action();
    } finally {
      setBusyAction(null);
    }
  }

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
          {message.feedback ? (
            <Badge variant="outline" className={isUser ? "bg-white/15 text-white" : "border-[var(--success-status)]/30 text-[var(--success-status)]"}>
              {message.feedback.rating === "useful" ? "Useful" : "Needs work"}
            </Badge>
          ) : null}
        </div>
        <p className="body-sm whitespace-pre-wrap break-words">{message.text}</p>

        <div className={cn("mt-3 flex flex-wrap gap-2", isUser ? "justify-end" : "justify-start")}>
          <button
            type="button"
            onClick={() => void copyMessage()}
            className={cn(
              "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium",
              isUser ? "border-white/25 text-white hover:bg-white/10" : "border-[var(--border-subtle)] text-[var(--on-surface-variant)] hover:bg-[var(--surface-container-low)]"
            )}
          >
            <Clipboard className="size-3" aria-hidden="true" /> {copied ? "Copied" : redactCopies ? "Copy redacted" : "Copy"}
          </button>
          {!isUser && conversationId ? (
            <>
              <button
                type="button"
                onClick={() => onTransform("Regenerate your previous answer with the same PayDash context, be more concise, and keep the Assumptions plus Verify in PayDash sections.", message.mode)}
                className="inline-flex items-center gap-1 rounded-full border border-[var(--border-subtle)] px-2.5 py-1 text-[11px] font-medium text-[var(--on-surface-variant)] hover:bg-[var(--surface-container-low)]"
              >
                <RotateCcw className="size-3" aria-hidden="true" /> Regenerate
              </button>
              <button
                type="button"
                onClick={() => onTransform("Turn your previous answer into a short checklist with owners, timing, and verification steps.", message.mode)}
                className="inline-flex items-center gap-1 rounded-full border border-[var(--border-subtle)] px-2.5 py-1 text-[11px] font-medium text-[var(--on-surface-variant)] hover:bg-[var(--surface-container-low)]"
              >
                Checklist
              </button>
              <button
                type="button"
                onClick={() => onTransform("Translate your previous answer into clear Bahasa Indonesia while keeping all safety caveats.", message.mode)}
                className="inline-flex items-center gap-1 rounded-full border border-[var(--border-subtle)] px-2.5 py-1 text-[11px] font-medium text-[var(--on-surface-variant)] hover:bg-[var(--surface-container-low)]"
              >
                Bahasa ID
              </button>
              <button
                type="button"
                disabled={Boolean(busyAction)}
                onClick={() => void runAction("save", () => onSaveReport(message))}
                className="inline-flex items-center gap-1 rounded-full border border-[var(--border-subtle)] px-2.5 py-1 text-[11px] font-medium text-[var(--on-surface-variant)] hover:bg-[var(--surface-container-low)] disabled:opacity-50"
              >
                <Save className="size-3" aria-hidden="true" /> {busyAction === "save" ? "Saving" : "Save report"}
              </button>
              <button
                type="button"
                disabled={Boolean(busyAction)}
                onClick={() => void runAction("useful", () => onFeedback(message, "useful", "Useful and actionable"))}
                className="inline-flex items-center gap-1 rounded-full border border-[var(--border-subtle)] px-2.5 py-1 text-[11px] font-medium text-[var(--on-surface-variant)] hover:bg-[var(--surface-container-low)] disabled:opacity-50"
              >
                <ThumbsUp className="size-3" aria-hidden="true" /> Useful
              </button>
              <button
                type="button"
                disabled={Boolean(busyAction)}
                onClick={() => void runAction("needs-work", () => onFeedback(message, "needs-work", "Needs more accurate or safer context"))}
                className="inline-flex items-center gap-1 rounded-full border border-[var(--border-subtle)] px-2.5 py-1 text-[11px] font-medium text-[var(--on-surface-variant)] hover:bg-[var(--surface-container-low)] disabled:opacity-50"
              >
                <ThumbsDown className="size-3" aria-hidden="true" /> Needs work
              </button>
            </>
          ) : null}
        </div>
      </div>
    </article>
  );
}

export function GeminiJournalAgent({
  initialMode = "brainstorm",
  availableModes = [...JOURNAL_MODES],
  quickPrompts = DEFAULT_QUICK_PROMPTS,
  emptyTitle = "Start a secure Gemini journal",
  threadTags = [],
  reportKind = "note",
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
  const [notice, setNotice] = useState<string | null>(null);
  const [lastModel, setLastModel] = useState<string | null>(null);
  const [redactCopies, setRedactCopies] = useState(true);
  const [unsavedReply, setUnsavedReply] = useState<{ conversationId: string; text: string; mode: JournalMode } | null>(null);

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
      setCurrentConversation(null);
      setLastModel(null);
      setUnsavedReply(null);
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
    setNotice(null);
    try {
      const response = await authorizedFetch("/api/ai-journal/chat", {
        method: "POST",
        body: JSON.stringify({
          conversationId: currentConversation?.id,
          message: trimmed,
          mode: nextMode,
          tags: threadTags,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as ChatResponse;

      if (!response.ok) {
        if (payload.messages) {
          const messages = payload.messages;
          setCurrentConversation((previous) =>
            previous
              ? { ...previous, messages }
              : {
                  id: payload.conversationId,
                  title: trimmed.slice(0, 68),
                  mode: nextMode,
                  tags: threadTags,
                  createdAt: new Date().toISOString(),
                  updatedAt: new Date().toISOString(),
                  messageCount: messages.length,
                  messages,
                }
          );
        }
        if (payload.unsavedReply && payload.conversationId) {
          setUnsavedReply({ conversationId: payload.conversationId, text: payload.unsavedReply, mode: nextMode });
        }
        const retry = payload.retryAfterSeconds ? ` Try again in ${payload.retryAfterSeconds}s.` : "";
        setError(`${payload.error ?? `Request failed with ${response.status}`}${retry}`);
        return;
      }

      if (payload.conversation) {
        setCurrentConversation(payload.conversation);
      }
      setLastModel(payload.model ?? null);
      setUnsavedReply(null);
      setInput("");
      await loadConversations();
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : "Gemini request failed. Your draft was kept locally.");
    } finally {
      setSending(false);
    }
  }

  async function retrySaveUnsavedReply() {
    if (!unsavedReply) return;
    setSending(true);
    setError(null);
    setNotice(null);
    try {
      const response = await authorizedFetch("/api/ai-journal/messages", {
        method: "POST",
        body: JSON.stringify({
          conversationId: unsavedReply.conversationId,
          role: "model",
          text: unsavedReply.text,
          mode: unsavedReply.mode,
        }),
      });
      const payload = await readJsonResponse<AppendMessageResponse>(response);
      if (payload.conversation) setCurrentConversation(payload.conversation);
      setUnsavedReply(null);
      setNotice("Unsaved Gemini reply has been persisted to Firestore.");
      await loadConversations();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not retry saving the Gemini reply.");
    } finally {
      setSending(false);
    }
  }

  async function submitFeedback(message: JournalMessage, rating: "useful" | "needs-work", reason: string) {
    if (!currentConversation) return;
    const response = await authorizedFetch("/api/ai-journal/feedback", {
      method: "POST",
      body: JSON.stringify({
        conversationId: currentConversation.id,
        messageId: message.id,
        rating,
        reason,
      }),
    });
    const payload = await readJsonResponse<FeedbackResponse>(response);
    setCurrentConversation((previous) =>
      previous
        ? {
            ...previous,
            messages: previous.messages.map((entry) => (entry.id === payload.message.id ? payload.message : entry)),
          }
        : previous
    );
    setNotice(rating === "useful" ? "Feedback saved: useful." : "Feedback saved: needs work.");
  }

  async function saveMessageAsReport(message: JournalMessage) {
    if (!currentConversation) return;
    const response = await authorizedFetch("/api/ai-journal/reports", {
      method: "POST",
      body: JSON.stringify({
        conversationId: currentConversation.id,
        messageId: message.id,
        kind: reportKind,
        title: `${JOURNAL_MODE_META[message.mode].shortLabel} — ${currentConversation.title}`.slice(0, 120),
        body: message.text,
        redacted: redactCopies,
      }),
    });
    await readJsonResponse(response);
    setNotice(redactCopies ? "Saved as redacted Firestore report." : "Saved as Firestore report.");
  }

  function transformPreviousAnswer(instruction: string, nextMode: JournalMode) {
    void submitMessage(instruction, nextMode);
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
                {conversation.tags.length ? (
                  <span className="mt-2 flex flex-wrap gap-1">
                    {conversation.tags.slice(0, 3).map((tag) => (
                      <span key={tag} className="rounded-full bg-[var(--surface-container-low)] px-2 py-0.5 text-[10px] text-[var(--on-surface-variant)]">
                        {tag}
                      </span>
                    ))}
                  </span>
                ) : null}
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
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            {lastModel ? <p className="data-mono text-[11px] text-[var(--on-surface-variant)]">Last Gemini model: {lastModel}</p> : <span />}
            <label className="inline-flex items-center gap-2 body-sm text-[var(--on-surface-variant)]">
              <input
                type="checkbox"
                checked={redactCopies}
                onChange={(event) => setRedactCopies(event.target.checked)}
                className="size-4 accent-[var(--primary)]"
              />
              Redact customer data before copy/save
            </label>
          </div>
        </div>

        {notice ? (
          <div className="mx-4 mt-4 rounded-lg border border-[var(--success-status)]/30 bg-[var(--success-status)]/10 p-3 body-sm text-[var(--success-status)]">
            {notice}
          </div>
        ) : null}

        {error ? (
          <div className="mx-4 mt-4 rounded-lg border border-[var(--error)]/30 bg-[var(--error)]/10 p-3 body-sm text-[var(--on-error-container)]">
            {error}
          </div>
        ) : null}

        {unsavedReply ? (
          <div className="mx-4 mt-4 rounded-lg border border-[var(--pending-status)]/30 bg-[var(--pending-status)]/10 p-3">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <p className="font-semibold text-[var(--on-surface)]">Gemini replied, but the answer was not saved.</p>
                <p className="body-sm text-[var(--on-surface-variant)]">Retry the Firestore save or copy the unsaved reply before leaving.</p>
              </div>
              <div className="flex gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => void navigator.clipboard.writeText(copySafeText(unsavedReply.text, redactCopies))}>
                  <Clipboard className="size-3.5" aria-hidden="true" /> Copy
                </Button>
                <Button type="button" size="sm" onClick={() => void retrySaveUnsavedReply()} disabled={sending}>
                  <Save className="size-3.5" aria-hidden="true" /> Retry save
                </Button>
              </div>
            </div>
          </div>
        ) : null}

        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          {currentConversation?.messages.length ? (
            currentConversation.messages.map((message) => (
              <MessageBubble
                key={message.id}
                message={message}
                conversationId={currentConversation.id}
                redactCopies={redactCopies}
                onTransform={transformPreviousAnswer}
                onFeedback={submitFeedback}
                onSaveReport={saveMessageAsReport}
              />
            ))
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
          {hasUnsafePromptIntent(input) ? (
            <div className="mb-3 rounded-lg border border-[var(--pending-status)]/30 bg-[var(--pending-status)]/10 p-3 body-sm text-[var(--on-surface-variant)]">
              This prompt looks like it may request unsafe behavior. The agent will treat it as untrusted text and will not reveal secrets, private user data, or execute payment actions.
            </div>
          ) : null}
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
