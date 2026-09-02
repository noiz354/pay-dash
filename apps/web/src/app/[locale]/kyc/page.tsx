import type { Metadata } from "next";
import { Link } from "@/i18n/navigation";
import { Card } from "@/components/ui/card";
import { KycUpload } from "@/components/kyc/kyc-upload";
import { getKycSubmission, profileKycCompleteness } from "@/server/data/kyc";
import { KYC_DOC_TYPES } from "@/lib/kyc-options";
import { formatDateLong, formatRelative } from "@/lib/format";

// Identity Verification (ADR-0019). The prototype hard-coded its 4-step
// progress, its attached "acme_corp_incorporation_2023.pdf" and its
// Save Draft / Submit Step buttons — none of which did anything, and KYC
// has no store and is not in the v7 node SDK product list (INTEGRATION.md
// :93/:323), so the app can never claim a review outcome. The page now states
// exactly what it owns: step 1 derived from the merchant profile, a real
// document submission (stored here, with timestamp), and — plainly — that
// the review itself is the compliance team's side of the table.
export const metadata: Metadata = {
  title: "Identity Verification — Kinetic Ledger",
  description: "Your business basic info, your submitted documents, and what happens next — no invented progress.",
};

function StepDot({ done, active }: { done: boolean; active: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={
        "absolute -left-[13px] flex h-6 w-6 items-center justify-center rounded-full ring-4 ring-[var(--surface-container-lowest)] " +
        (done
          ? "bg-[var(--success-status)]"
          : active
            ? "bg-[var(--primary)]"
            : "bg-[var(--surface-container-high)]")
      }
    >
      {done ? (
        <span className="material-symbols-outlined text-[14px] text-[var(--surface-container-lowest)]" style={{ fontVariationSettings: "'FILL' 1" }}>
          check
        </span>
      ) : active ? (
        <span className="h-2 w-2 rounded-full bg-[var(--surface-container-lowest)]" />
      ) : null}
    </span>
  );
}

export default async function KycPage() {
  const [submission, completeness] = await Promise.all([getKycSubmission(), profileKycCompleteness()]);
  const submitted = !!submission;

  const steps = [
    {
      title: "Basic Info",
      detail: completeness.complete
        ? completeness.fields.map((f) => f.value).join(" · ")
        : `Missing: ${completeness.fields.filter((f) => !f.present).map((f) => f.label).join(", ")}`,
      done: completeness.complete,
      active: !completeness.complete,
    },
    {
      title: "Business Documents",
      detail: submission
        ? `${submission.fileName} — ${KYC_DOC_TYPES.find((t) => t.value === submission.docType)?.label ?? submission.docType}`
        : "Upload your incorporation proof",
      done: submitted,
      active: !submitted,
    },
    {
      title: "Submission",
      detail: submission
        ? `Submitted ${formatDateLong(submission.submittedAt)} (${formatRelative(submission.submittedAt)}) — awaiting review`
        : "Not yet submitted",
      done: submitted,
      active: false,
    },
  ];

  return (
    <main className="mx-auto max-w-container-max p-gutter">
      <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="headline-xl text-[var(--on-surface)]">Identity Verification</h1>
          <p className="body-md mt-2 text-[var(--on-surface-variant)]">
            Your business info, the document you submit, and what happens next — no invented progress.
          </p>
        </div>
        <span
          className={
            "inline-flex items-center gap-1.5 self-start rounded-full border px-3 py-1.5 sm:self-auto " +
            (submitted
              ? "border-[var(--pending-status)]/30 bg-[var(--pending-status)]/10 text-[var(--pending-status)]"
              : "border-[var(--warning)]/30 bg-[var(--warning)]/10 text-[var(--warning)]")
          }
        >
          <span className={"h-2 w-2 rounded-full " + (submitted ? "bg-[var(--pending-status)]" : "bg-[var(--warning)]")} aria-hidden="true" />
          <span className="label-caps tracking-wider">{submitted ? "Awaiting review" : "Action required"}</span>
        </span>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 items-start">
        {/* Step rail — derived from real data, not hard-coded */}
        <aside
          className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-container-lowest)] p-6 lg:col-span-3 lg:sticky lg:top-[100px]"
          aria-label="Verification steps"
        >
          <h2 className="headline-md mb-6 border-b border-[var(--border-subtle)] pb-4 text-[var(--on-surface)]">
            Verification Steps
          </h2>
          <ol className="relative space-y-6 border-l-2 border-[var(--surface-container-high)] pl-6">
            {steps.map((step, i) => (
              <li key={step.title} className="relative">
                <StepDot done={step.done} active={step.active} />
                <h3
                  className={
                    "headline-md leading-tight " +
                    (step.active ? "text-[var(--primary)]" : "text-[var(--on-surface)]")
                  }
                >
                  {i + 1}. {step.title}
                </h3>
                <p className="body-sm mt-1 text-[var(--on-surface-variant)]">{step.detail}</p>
                {i === 0 ? (
                  <Link
                    href="/settings/merchant"
                    className="body-sm text-[var(--primary)] hover:underline inline-block mt-1"
                  >
                    Edit profile
                  </Link>
                ) : null}
              </li>
            ))}
          </ol>
          <p className="body-sm mt-6 text-xs text-[var(--on-surface-variant)]">
            Beneficial-owner details are collected by the compliance team during review — they are not part
            of this app (KYC is outside the v7 SDK, INTEGRATION.md §7).
          </p>
        </aside>

        {/* Main content */}
        <div className="space-y-6 lg:col-span-9">
          <div className="flex items-start gap-4 rounded-xl border border-[var(--primary)]/20 bg-[var(--primary)]/5 p-6">
            <div className="shrink-0 rounded-lg bg-[var(--primary)]/10 p-2">
              <span className="material-symbols-outlined text-[var(--primary)]">shield</span>
            </div>
            <div>
              <h3 className="headline-md text-[var(--on-surface)]">Why we need this document</h3>
              <p className="body-md mt-2 text-[var(--on-surface-variant)]">
                To comply with AML regulations we require official documentation proving your
                entity&apos;s registration. Your document is stored with your verification record here;
                the review itself is conducted by the compliance team — its outcome is not visible in
                this app.
              </p>
            </div>
          </div>

          <Card className="overflow-hidden bg-[var(--surface-container-lowest)] border-[var(--border-subtle)]">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border-subtle)] bg-[var(--surface-canvas)]/50 p-6">
              <div>
                <h2 className="headline-lg text-[var(--on-surface)]">Upload Business Documents</h2>
                <p className="body-sm mt-1 text-[var(--on-surface-variant)]">
                  Accepted formats: PDF, JPEG, PNG (Max 10 MB)
                </p>
              </div>
              {submitted && submission ? (
                <span className="body-sm text-[var(--on-surface-variant)]">
                  Submitted {formatRelative(submission.submittedAt)}
                </span>
              ) : null}
            </div>
            <KycUpload submission={submission} />
          </Card>
        </div>
      </div>
    </main>
  );
}
