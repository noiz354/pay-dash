import type { Metadata } from "next";
import { Link } from "@/i18n/navigation";
import { Card } from "@/components/ui/card";
import { OnboardingCard } from "@/components/onboarding/onboarding-card";
import { getOnboardingStatus } from "@/server/data/onboarding";

// Sub-Merchant Onboarding (ADR-0025). The prototype hard-coded "3 of 4
// sections completed · 75%", an invented ****4592 account, "Verified on Oct
// 24", "Verified by system" documents, and four dead buttons. Every figure
// below is derived server-side from the store that actually owns it — and
// the compliance section, which the app can never complete (KYC is outside
// the v7 SDK, INTEGRATION.md §7), is shown but not counted.
export const metadata: Metadata = {
  title: "Sub-Merchant Onboarding — Kinetic Ledger",
  description:
    "Every step is derived from the stores that own it; the compliance review is labelled as the compliance team's side of the table.",
};

export default async function OnboardingPage() {
  const status = await getOnboardingStatus();

  return (
    <main className="mx-auto max-w-container-max p-gutter space-y-6">
      {/* Header */}
      <div className="space-y-2">
        <nav
          aria-label="Breadcrumb"
          className="flex items-center gap-2 text-[var(--on-surface-variant)]"
        >
          <Link
            href="/settings/merchant"
            className="body-sm transition-colors hover:text-[var(--primary)]"
          >
            Accounts
          </Link>
          <span className="material-symbols-outlined text-[16px]" aria-hidden="true">
            chevron_right
          </span>
          <span className="body-sm text-[var(--on-surface)]">Sub-Merchant Onboarding</span>
        </nav>
        <h1 className="headline-xl text-[var(--on-surface)]">Sub-Merchant Onboarding</h1>
        <p className="body-lg max-w-2xl text-[var(--on-surface-variant)]">
          Complete the required steps to activate trading capabilities for {status.merchantName}.
        </p>
      </div>

      {/* Progress — derived from the app-owned sections only */}
      <Card className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-container-lowest)] p-6 shadow-sm">
        <div className="mb-4 flex items-end justify-between">
          <div>
            <div className="headline-md mb-1 text-[var(--on-surface)]">Onboarding Progress</div>
            <div className="body-sm text-[var(--on-surface-variant)]">
              {status.trackedComplete} of {status.trackedTotal} sections completed
            </div>
          </div>
          <div className="headline-lg text-[var(--primary)]">{status.progress}%</div>
        </div>
        <div
          className="h-2 w-full overflow-hidden rounded-full bg-[var(--surface-variant)]"
          role="progressbar"
          aria-valuenow={status.progress}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`Onboarding progress ${status.progress} percent`}
        >
          <div
            className="h-full rounded-full bg-[var(--primary)] transition-all duration-500 ease-out"
            style={{ width: `${status.progress}%` }}
          />
        </div>
        <p className="body-sm mt-3 text-xs text-[var(--on-surface-variant)]">
          The compliance review is owned by the compliance team — it is shown on this page but not
          counted.
        </p>
      </Card>

      {/* Checklist — one card per section, each CTA a real link to the owner */}
      <div className="grid grid-cols-1 gap-[var(--stack-md)] md:grid-cols-2">
        {status.sections.map((section) => (
          <OnboardingCard key={section.id} section={section} />
        ))}
      </div>
    </main>
  );
}
