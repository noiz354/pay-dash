"use client";

import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * Merchant Ops Agent console (WAVE 4).
 *
 * Shows the observable agent timeline — tool names, statuses and high-level
 * result summaries — never raw chain-of-thought. All data comes from
 * `POST /api/agent/run` (session-scoped, read-only, Strands + Bedrock).
 */

type ToolActivity = {
  tool: string;
  status: "ok" | "error";
  summary?: string;
};

type AgentRunResult = {
  runId: string;
  status: "completed" | "failed" | "timed_out";
  mode: "read_only";
  summary: string;
  toolActivity: ToolActivity[];
  evidenceIds: string[];
  error?: string;
};

const SUGGESTED_PROMPTS = [
  "Why is today's settlement lower than yesterday?",
  "Are there failed transactions I should look into?",
  "Summarize payout health for this merchant.",
];

export function MerchantOpsConsole() {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AgentRunResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(prompt?: string) {
    const text = (prompt ?? message).trim();
    if (!text || busy) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const response = await fetch("/api/agent/run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: text }),
      });
      const data = (await response.json().catch(() => null)) as
        | (AgentRunResult & { error?: string; retryAfterSeconds?: number })
        | null;
      if (!response.ok) {
        const retry = response.headers.get("retry-after");
        const retryText = retry ? ` Retry in ${retry}s.` : "";
        setError(`${data?.error ?? `Request failed (${response.status}).`}${retryText}`);
        return;
      }
      setResult(data as AgentRunResult);
    } catch {
      setError("Network error while contacting the agent. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card className="border-[var(--border-subtle)] shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <CardTitle className="text-base">Ask the Merchant Ops Agent</CardTitle>
          <Badge variant="outline" className="border-amber-500/40 text-amber-600 dark:text-amber-400">
            READ-ONLY MODE
          </Badge>
        </CardHeader>
        <CardContent className="space-y-3">
          <textarea
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void run();
              }
            }}
            placeholder={"e.g. \"Why is today's settlement lower than yesterday?\""}
            rows={3}
            maxLength={4_000}
            className="w-full resize-y rounded-lg border border-[var(--border-subtle)] bg-[var(--surface)] px-3 py-2 text-sm outline-none focus:border-[var(--primary)]"
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={() => void run()} disabled={busy || !message.trim()}>
              {busy ? "Agent is working…" : "Run investigation"}
            </Button>
            {SUGGESTED_PROMPTS.map((prompt) => (
              <button
                key={prompt}
                type="button"
                disabled={busy}
                onClick={() => void run(prompt)}
                className="rounded-full border border-[var(--border-subtle)] px-3 py-1 text-xs text-[var(--muted-foreground)] transition-colors hover:border-[var(--primary)] hover:text-[var(--primary)] disabled:opacity-50"
              >
                {prompt}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {error && (
        <div className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
          {error}
        </div>
      )}

      {result && (
        <Card className="border-[var(--border-subtle)] shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <CardTitle className="text-base">
              Investigation result
              <span className="ml-2 font-mono text-xs text-[var(--muted-foreground)]">
                {result.runId.slice(0, 8)}
              </span>
            </CardTitle>
            <Badge
              variant={result.status === "completed" ? "default" : "destructive"}
              className={result.status === "completed" ? "bg-[var(--primary)] text-white" : ""}
            >
              {result.status === "completed" ? "COMPLETED" : result.status === "timed_out" ? "TIMED OUT" : "FAILED"}
            </Badge>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
                Agent timeline
              </h3>
              <ol className="space-y-2">
                {result.toolActivity.length === 0 && (
                  <li className="text-sm text-[var(--muted-foreground)]">No tools were invoked for this run.</li>
                )}
                {result.toolActivity.map((step, index) => (
                  <li key={`${step.tool}-${index}`} className="flex items-start gap-2 text-sm">
                    <span aria-hidden className="mt-0.5">
                      {step.status === "ok" ? "✓" : "✕"}
                    </span>
                    <div>
                      <span className="font-mono text-xs text-[var(--primary)]">{step.tool}</span>
                      {step.summary && (
                        <p className="text-xs text-[var(--muted-foreground)]">{step.summary}</p>
                      )}
                    </div>
                  </li>
                ))}
              </ol>
            </div>

            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
                Summary
              </h3>
              <div className="whitespace-pre-wrap rounded-lg border border-[var(--border-subtle)] bg-[var(--surface)] px-3 py-2 text-sm">
                {result.summary}
              </div>
            </div>

            {result.evidenceIds.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {result.evidenceIds.map((id) => (
                  <span
                    key={id}
                    className="rounded border border-[var(--border-subtle)] bg-[var(--surface)] px-2 py-0.5 font-mono text-[10px] text-[var(--muted-foreground)]"
                  >
                    {id}
                  </span>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
