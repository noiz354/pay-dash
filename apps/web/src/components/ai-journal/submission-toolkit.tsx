"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Clipboard, ExternalLink, Link2, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  buildSocialPost,
  buildSubmissionBrief,
  buildSubmissionChecklist,
  isHttpUrl,
  type SubmissionLinks,
} from "@/lib/ai-journal/submission";

const STORAGE_KEY = "paydash-ai-journal-submission-links";

const emptyLinks: SubmissionLinks = {
  prototypeUrl: "",
  socialPostUrl: "",
  repositoryUrl: "",
};

function safeParseLinks(value: string | null): SubmissionLinks {
  if (!value) return emptyLinks;
  try {
    const parsed = JSON.parse(value) as Partial<SubmissionLinks>;
    return {
      prototypeUrl: typeof parsed.prototypeUrl === "string" ? parsed.prototypeUrl : "",
      socialPostUrl: typeof parsed.socialPostUrl === "string" ? parsed.socialPostUrl : "",
      repositoryUrl: typeof parsed.repositoryUrl === "string" ? parsed.repositoryUrl : "",
    };
  } catch {
    return emptyLinks;
  }
}

function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1_600);
  }

  return (
    <Button type="button" variant="outline" size="sm" onClick={() => void copy()} className="border-[var(--border-subtle)]">
      <Clipboard className="size-3.5" aria-hidden="true" />
      {copied ? "Copied" : label}
    </Button>
  );
}

function LinkInput({
  id,
  label,
  value,
  placeholder,
  onChange,
}: {
  id: keyof SubmissionLinks;
  label: string;
  value: string;
  placeholder: string;
  onChange: (key: keyof SubmissionLinks, value: string) => void;
}) {
  const hasValue = value.trim().length > 0;
  const valid = isHttpUrl(value);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={id}>{label}</Label>
        {hasValue ? (
          <Badge variant={valid ? "default" : "destructive"} className={valid ? "bg-[var(--success-status)] text-white" : undefined}>
            {valid ? "valid URL" : "needs http(s)"}
          </Badge>
        ) : null}
      </div>
      <div className="flex gap-2">
        <Input
          id={id}
          value={value}
          onChange={(event) => onChange(id, event.target.value)}
          placeholder={placeholder}
          className="h-10 bg-white"
        />
        {valid ? (
          <a
            href={value}
            target="_blank"
            rel="noreferrer"
            aria-label={`Open ${label}`}
            className="inline-flex size-10 shrink-0 items-center justify-center rounded-md border border-[var(--border-subtle)] bg-white text-[var(--on-surface)] shadow-sm hover:bg-[var(--surface-container-low)]"
          >
            <ExternalLink className="size-4" aria-hidden="true" />
          </a>
        ) : null}
      </div>
    </div>
  );
}

export function SubmissionToolkit() {
  const [links, setLinks] = useState<SubmissionLinks>(emptyLinks);
  const [hydrated, setHydrated] = useState(false);
  const brief = useMemo(() => buildSubmissionBrief(), []);
  const socialPost = useMemo(() => buildSocialPost(links), [links]);
  const checklist = useMemo(() => buildSubmissionChecklist(links), [links]);
  const completed = checklist.filter((item) => item.complete).length;

  useEffect(() => {
    setLinks(safeParseLinks(window.localStorage.getItem(STORAGE_KEY)));
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(links));
  }, [hydrated, links]);

  function updateLink(key: keyof SubmissionLinks, value: string) {
    setLinks((current) => ({ ...current, [key]: value }));
  }

  return (
    <Card className="border-[var(--border-subtle)] bg-[var(--surface)] shadow-sm">
      <CardHeader>
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <CardTitle className="headline-md">Ideathon submission cockpit</CardTitle>
            <p className="body-sm mt-1 text-[var(--on-surface-variant)]">
              Isi link final, copy social post, lalu paste brief ke form submission. Data link disimpan lokal di browser,
              bukan di Firestore.
            </p>
          </div>
          <Badge className="w-fit bg-[var(--primary)] text-white">
            {completed}/{checklist.length} ready
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="grid gap-5 xl:grid-cols-[0.92fr_1.08fr]">
        <section className="space-y-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-container-lowest)] p-4">
          <div className="flex items-center gap-2">
            <Link2 className="size-4 text-[var(--primary)]" aria-hidden="true" />
            <h3 className="font-semibold text-[var(--on-surface)]">Submission links</h3>
          </div>
          <LinkInput
            id="prototypeUrl"
            label="Working Prototype Link"
            value={links.prototypeUrl}
            placeholder="https://paydash-gemini-journal-xxxxx.a.run.app/ai-journal"
            onChange={updateLink}
          />
          <LinkInput
            id="socialPostUrl"
            label="Demo Social Post Link"
            value={links.socialPostUrl}
            placeholder="https://www.linkedin.com/posts/..."
            onChange={updateLink}
          />
          <LinkInput
            id="repositoryUrl"
            label="Public Code Repository Link"
            value={links.repositoryUrl}
            placeholder="https://github.com/your-user/pay-dash"
            onChange={updateLink}
          />

          <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-container-low)] p-3">
            <p className="label-caps text-[var(--on-surface-variant)]">Readiness checklist</p>
            <ul className="mt-3 space-y-2">
              {checklist.map((item) => (
                <li key={item.id} className="flex items-start gap-2 body-sm">
                  {item.complete ? (
                    <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-[var(--success-status)]" aria-hidden="true" />
                  ) : (
                    <XCircle className="mt-0.5 size-4 shrink-0 text-[var(--pending-status)]" aria-hidden="true" />
                  )}
                  <span>
                    <span className={cn("font-medium", item.complete ? "text-[var(--on-surface)]" : "text-[var(--on-surface-variant)]")}>
                      {item.label}
                    </span>
                    <span className="block text-[12px] text-[var(--on-surface-variant)]">{item.hint}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="space-y-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-container-lowest)] p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="font-semibold text-[var(--on-surface)]">Copy-ready assets</h3>
              <p className="body-sm text-[var(--on-surface-variant)]">Brief dijaga di bawah limit form 1024 karakter.</p>
            </div>
            <Badge variant="outline" className="data-mono">
              {brief.length}/1024
            </Badge>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="brief">Brief Description</Label>
              <CopyButton text={brief} />
            </div>
            <Textarea id="brief" readOnly value={brief} className="min-h-36 bg-white" />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="social-post">Demo social post draft</Label>
              <CopyButton text={socialPost} />
            </div>
            <Textarea id="social-post" readOnly value={socialPost} className="min-h-40 bg-white" />
          </div>
        </section>
      </CardContent>
    </Card>
  );
}
