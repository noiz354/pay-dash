"use client";

import { useCallback, useEffect, useState } from "react";
import { onAuthStateChanged, signInWithPopup, signInWithRedirect, type Auth, type User } from "firebase/auth";
import { Loader2, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  getBuildTimeFirebaseClientStatus,
  getFirebaseAuth,
  getGoogleAuthProvider,
  normalizeFirebaseClientStatus,
  type FirebaseClientStatus,
} from "@/lib/firebase/client";
import { JOURNAL_MODE_META, type JournalEvaluationSummary } from "@/lib/ai-journal/types";

type EvaluationPayload = {
  summary: JournalEvaluationSummary;
  rateLimit: { maxMessages: number; windowMinutes: number };
};

async function readJsonResponse<T>(response: Response): Promise<T> {
  const payload = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new Error(payload.error ?? `Request failed with ${response.status}`);
  return payload;
}

export function EvaluationDashboard() {
  const [firebaseStatus, setFirebaseStatus] = useState<FirebaseClientStatus | null>(null);
  const [auth, setAuth] = useState<Auth | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [payload, setPayload] = useState<EvaluationPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function loadConfig() {
      try {
        const response = await fetch("/api/ai-journal/firebase-config", { cache: "no-store" });
        const configPayload = await response.json();
        if (!cancelled) setFirebaseStatus(normalizeFirebaseClientStatus(configPayload));
      } catch {
        if (!cancelled) setFirebaseStatus(getBuildTimeFirebaseClientStatus());
      }
    }
    void loadConfig();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!firebaseStatus) return;
    if (!firebaseStatus.configured || !firebaseStatus.config) {
      setLoading(false);
      return;
    }
    const firebaseAuth = getFirebaseAuth(firebaseStatus.config);
    setAuth(firebaseAuth);
    return onAuthStateChanged(firebaseAuth, (nextUser) => {
      setUser(nextUser);
      setPayload(null);
      setLoading(false);
    });
  }, [firebaseStatus]);

  const loadEvaluation = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const token = await user.getIdToken();
      const response = await fetch("/api/ai-journal/evaluation", {
        headers: { authorization: `Bearer ${token}` },
      });
      setPayload(await readJsonResponse<EvaluationPayload>(response));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load evaluation summary.");
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (user) void loadEvaluation();
  }, [loadEvaluation, user]);

  async function signIn() {
    if (!auth) return;
    try {
      await signInWithPopup(auth, getGoogleAuthProvider());
    } catch {
      await signInWithRedirect(auth, getGoogleAuthProvider());
    }
  }

  if (loading && !payload) {
    return (
      <div className="flex min-h-[320px] items-center justify-center text-[var(--on-surface-variant)]">
        <Loader2 className="mr-2 size-4 animate-spin" aria-hidden="true" /> Loading evaluation…
      </div>
    );
  }

  if (!firebaseStatus?.configured) {
    return (
      <Card className="border-[var(--pending-status)]/30 bg-[var(--pending-status)]/10">
        <CardContent className="p-4 body-sm text-[var(--on-surface-variant)]">
          Firebase config is required before evaluation can read private user-scoped metrics.
        </CardContent>
      </Card>
    );
  }

  if (!user) {
    return (
      <Card className="border-[var(--border-subtle)] bg-[var(--surface)] shadow-sm">
        <CardHeader>
          <CardTitle className="headline-md">Sign in to evaluate your private AI workspace</CardTitle>
        </CardHeader>
        <CardContent>
          <Button onClick={() => void signIn()} className="bg-[var(--primary)] text-white">
            <ShieldCheck className="size-4" aria-hidden="true" /> Continue with Google
          </Button>
        </CardContent>
      </Card>
    );
  }

  const summary = payload?.summary;

  return (
    <div className="space-y-5">
      {error ? <div className="rounded-lg border border-[var(--error)]/30 bg-[var(--error)]/10 p-3 body-sm text-[var(--on-error-container)]">{error}</div> : null}

      {summary ? (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            {[
              ["Conversations", summary.conversationCount],
              ["Messages", summary.messageCount],
              ["Reports", summary.reportCount],
              ["Useful", summary.usefulFeedbackCount],
              ["Needs work", summary.needsWorkFeedbackCount],
            ].map(([label, value]) => (
              <Card key={label} className="border-[var(--border-subtle)] bg-white shadow-sm">
                <CardContent className="p-4">
                  <p className="label-caps text-[var(--on-surface-variant)]">{label}</p>
                  <p className="data-mono mt-1 text-2xl font-bold text-[var(--on-surface)]">{value}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card className="border-[var(--border-subtle)] bg-[var(--surface)] shadow-sm">
            <CardHeader>
              <CardTitle className="headline-md">Agent usage</CardTitle>
              <p className="body-sm text-[var(--on-surface-variant)]">
                Counts are scoped to the signed-in Firebase user only.
              </p>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              {Object.entries(summary.agentModeCounts).map(([mode, count]) => (
                <Badge key={mode} variant="outline">
                  {JOURNAL_MODE_META[mode as keyof typeof JOURNAL_MODE_META]?.label ?? mode}: {count}
                </Badge>
              ))}
            </CardContent>
          </Card>

          <Card className="border-[var(--border-subtle)] bg-[var(--surface)] shadow-sm">
            <CardHeader>
              <CardTitle className="headline-md">Evaluation readiness</CardTitle>
              <p className="body-sm text-[var(--on-surface-variant)]">
                Use this panel as a self-check before recording the final walkthrough.
              </p>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-2">
              {summary.readinessChecks.map((check) => (
                <div key={check.id} className="rounded-xl border border-[var(--border-subtle)] bg-white p-4">
                  <div className="flex items-start gap-2">
                    <span className={`material-symbols-outlined text-[19px] ${check.complete ? "text-[var(--success-status)]" : "text-[var(--pending-status)]"}`} aria-hidden="true">
                      {check.complete ? "check_circle" : "radio_button_unchecked"}
                    </span>
                    <div>
                      <p className="font-semibold text-[var(--on-surface)]">{check.label}</p>
                      <p className="body-sm mt-1 text-[var(--on-surface-variant)]">{check.detail}</p>
                    </div>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="border-[var(--border-subtle)] bg-[var(--surface)] shadow-sm">
            <CardHeader>
              <CardTitle className="headline-md">Safety and cost controls</CardTitle>
            </CardHeader>
            <CardContent className="body-sm text-[var(--on-surface-variant)]">
              Rate limit: {payload.rateLimit.maxMessages} AI messages per {payload.rateLimit.windowMinutes} minutes per Firebase UID.
              Prompt size and context windows are bounded server-side.
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}
