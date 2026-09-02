import { Link } from "@/i18n/navigation";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { OnboardingCheck, OnboardingSection } from "@/server/data/onboarding";

// ADR-0025 — the onboarding checklist card. Server-rendered: the checks it
// displays are derived server-side (getOnboardingStatus), and the CTA is a
// real Link to the page that owns the facts behind the section.

const BADGE_TONES: Record<OnboardingSection["tone"], string> = {
  success: "bg-[var(--success-status)]/10 text-[var(--success-status)]",
  pending: "bg-[var(--pending-status)]/10 text-[var(--pending-status)]",
  warning: "bg-[var(--warning)]/10 text-[var(--warning)]",
};

const BADGE_ICONS: Record<OnboardingSection["badge"], string> = {
  COMPLETED: "check_circle",
  "IN PROGRESS": "pending",
  "REVIEW PENDING": "pending",
  "ACTION REQUIRED": "warning",
};

function CheckRow({ check }: { check: OnboardingCheck }) {
  return (
    <div className="flex items-start gap-3">
      {check.done ? (
        <span
          className="material-symbols-outlined mt-0.5 text-[20px] text-[var(--success-status)]"
          aria-hidden="true"
          style={{ fontVariationSettings: "'FILL' 1" }}
        >
          check_circle
        </span>
      ) : (
        <span
          className="material-symbols-outlined mt-0.5 text-[20px] text-[var(--outline)]"
          aria-hidden="true"
        >
          radio_button_unchecked
        </span>
      )}
      <div>
        <div className="body-md font-medium text-[var(--on-surface)]">{check.label}</div>
        <div className="body-sm text-[var(--on-surface-variant)]">{check.detail}</div>
      </div>
    </div>
  );
}

export function OnboardingCard({ section }: { section: OnboardingSection }) {
  const attention = section.tone === "warning";
  return (
    <Card
      className={
        "group relative overflow-hidden rounded-xl bg-[var(--surface-container-lowest)] p-6 shadow-sm " +
        (attention
          ? "border-2 border-[var(--primary)]"
          : "border border-[var(--border-subtle)]")
      }
    >
      <div
        className={
          "absolute -right-8 -top-8 h-32 w-32 rounded-bl-full transition-transform group-hover:scale-110 " +
          (attention ? "bg-[var(--primary)]/5" : "bg-[var(--success-status)]/5")
        }
        aria-hidden="true"
      />
      <div className="relative z-10 mb-4 flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div
            className={
              "flex h-10 w-10 items-center justify-center rounded-lg " +
              (attention
                ? "bg-[var(--primary)]/10 text-[var(--primary)]"
                : "bg-[var(--success-status)]/10 text-[var(--success-status)]")
            }
          >
            <span
              className="material-symbols-outlined"
              aria-hidden="true"
              style={{ fontVariationSettings: "'FILL' 1" }}
            >
              {section.icon}
            </span>
          </div>
          <h2
            className={
              "headline-md " +
              (attention ? "text-[var(--primary)]" : "text-[var(--on-surface)]")
            }
          >
            {section.title}
          </h2>
        </div>
        <span
          className={
            "inline-flex items-center gap-1 rounded-full px-2 py-1 label-caps " + BADGE_TONES[section.tone]
          }
        >
          <span className="material-symbols-outlined text-[14px]" aria-hidden="true">
            {BADGE_ICONS[section.badge]}
          </span>
          {section.badge}
        </span>
      </div>
      <div className="relative z-10 mt-6 space-y-3">
        {section.checks.map((check) => (
          <CheckRow key={check.id} check={check} />
        ))}
      </div>
      {section.id === "compliance" ? (
        <p className="relative z-10 mt-4 body-sm text-xs text-[var(--on-surface-variant)]">
          Submitted documents are stored here; the review itself is conducted by the compliance
          team and its outcome is not visible in this app (INTEGRATION.md §7 — KYC is outside the
          v7 SDK).
        </p>
      ) : null}
      <Link
        href={section.href}
        className={
          "relative z-10 mt-6 flex w-full items-center justify-center gap-2 " +
          buttonVariants({ variant: "outline" })
        }
      >
        {section.actionLabel}
        <span className="material-symbols-outlined text-[16px]" aria-hidden="true">
          arrow_forward
        </span>
      </Link>
    </Card>
  );
}
