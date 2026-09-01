import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export default function OnboardingPage() {
  return (
    <main className="mx-auto max-w-container-max p-gutter space-y-6">
      {/* Header — screens/desktop/sub_merchant_onboarding_checklist_desktop:252-414 */}
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-[var(--on-surface-variant)]">
          <span className="body-sm hover:text-[var(--primary)] cursor-pointer">Accounts</span>
          <span className="material-symbols-outlined text-[16px]" aria-hidden="true">
            chevron_right
          </span>
          <span className="body-sm text-[var(--on-surface)]">Acme Corp Setup</span>
        </div>
        <h1 className="headline-xl text-[var(--on-surface)]">Sub-Merchant Onboarding</h1>
        <p className="body-lg max-w-2xl text-[var(--on-surface-variant)]">Complete the required steps to activate trading capabilities for Acme Corp.</p>
      </div>

      {/* Progress Tracker — 75% */}
      <Card className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-container-lowest)] p-6 shadow-sm">
        <div className="mb-4 flex items-end justify-between">
          <div>
            <div className="headline-md mb-1 text-[var(--on-surface)]">Onboarding Progress</div>
            <div className="body-sm text-[var(--on-surface-variant)]">3 of 4 sections completed</div>
          </div>
          <div className="headline-lg text-[var(--primary)]">75%</div>
        </div>
        <div
          className="h-2 w-full overflow-hidden rounded-full bg-[var(--surface-variant)]"
          role="progressbar"
          aria-valuenow={75}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Onboarding progress 75 percent"
        >
          <div className="h-full rounded-full bg-[var(--primary)] transition-all duration-500 ease-out" style={{ width: "75%" }} />
        </div>
      </Card>

      {/* Checklist Bento Grid — 4 cards */}
      <div className="grid grid-cols-1 gap-[var(--stack-md)] md:grid-cols-2">
        {/* Business Profile — COMPLETED */}
        <Card className="group relative overflow-hidden rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-container-lowest)] p-6 shadow-sm">
          <div className="absolute -right-8 -top-8 h-32 w-32 rounded-bl-full bg-[var(--success-status)]/5 transition-transform group-hover:scale-110" aria-hidden="true" />
          <div className="relative z-10 mb-4 flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--success-status)]/10 text-[var(--success-status)]">
                <span className="material-symbols-outlined" aria-hidden="true" style={{ fontVariationSettings: "'FILL' 1" }}>
                  domain
                </span>
              </div>
              <h2 className="headline-md text-[var(--on-surface)]">Business Profile</h2>
            </div>
            <span className="inline-flex items-center gap-1 rounded-full bg-[var(--success-status)]/10 px-2 py-1 text-[var(--success-status)] label-caps">
              <span className="material-symbols-outlined text-[14px]" aria-hidden="true">
                check_circle
              </span>
              COMPLETED
            </span>
          </div>
          <div className="relative z-10 mt-6 space-y-3">
            <div className="flex items-start gap-3">
              <span className="material-symbols-outlined mt-0.5 text-[20px] text-[var(--success-status)]" aria-hidden="true" style={{ fontVariationSettings: "'FILL' 1" }}>
                check_circle
              </span>
              <div>
                <div className="body-md font-medium text-[var(--on-surface)]">Company Details</div>
                <div className="body-sm text-[var(--on-surface-variant)]">Legal name, DBA, address</div>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <span className="material-symbols-outlined mt-0.5 text-[20px] text-[var(--success-status)]" aria-hidden="true" style={{ fontVariationSettings: "'FILL' 1" }}>
                check_circle
              </span>
              <div>
                <div className="body-md font-medium text-[var(--on-surface)]">Ownership Structure</div>
                <div className="body-sm text-[var(--on-surface-variant)]">UBOs holding &gt; 25%</div>
              </div>
            </div>
          </div>
          <Button
            variant="outline"
            className="relative z-10 mt-6 w-full border-[var(--border-subtle)] bg-[var(--surface-container)] hover:bg-[var(--surface-variant)] text-[var(--on-surface)] body-sm font-medium"
          >
            Review Details
          </Button>
        </Card>

        {/* Compliance — COMPLETED */}
        <Card className="group relative overflow-hidden rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-container-lowest)] p-6 shadow-sm">
          <div className="absolute -right-8 -top-8 h-32 w-32 rounded-bl-full bg-[var(--success-status)]/5 transition-transform group-hover:scale-110" aria-hidden="true" />
          <div className="relative z-10 mb-4 flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--success-status)]/10 text-[var(--success-status)]">
                <span className="material-symbols-outlined" aria-hidden="true" style={{ fontVariationSettings: "'FILL' 1" }}>
                  description
                </span>
              </div>
              <h2 className="headline-md text-[var(--on-surface)]">Compliance</h2>
            </div>
            <span className="inline-flex items-center gap-1 rounded-full bg-[var(--success-status)]/10 px-2 py-1 text-[var(--success-status)] label-caps">
              <span className="material-symbols-outlined text-[14px]" aria-hidden="true">
                check_circle
              </span>
              COMPLETED
            </span>
          </div>
          <div className="relative z-10 mt-6 space-y-3">
            <div className="flex items-start gap-3">
              <span className="material-symbols-outlined mt-0.5 text-[20px] text-[var(--success-status)]" aria-hidden="true" style={{ fontVariationSettings: "'FILL' 1" }}>
                check_circle
              </span>
              <div>
                <div className="body-md font-medium text-[var(--on-surface)]">Articles of Incorporation</div>
                <div className="body-sm text-[var(--on-surface-variant)]">Verified by system</div>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <span className="material-symbols-outlined mt-0.5 text-[20px] text-[var(--success-status)]" aria-hidden="true" style={{ fontVariationSettings: "'FILL' 1" }}>
                check_circle
              </span>
              <div>
                <div className="body-md font-medium text-[var(--on-surface)]">W-9 Tax Form</div>
                <div className="body-sm text-[var(--on-surface-variant)]">Signed &amp; uploaded</div>
              </div>
            </div>
          </div>
          <Button
            variant="outline"
            className="relative z-10 mt-6 w-full border-[var(--border-subtle)] bg-[var(--surface-container)] hover:bg-[var(--surface-variant)] text-[var(--on-surface)] body-sm font-medium"
          >
            View Documents
          </Button>
        </Card>

        {/* Bank Setup — COMPLETED with ****4592 */}
        <Card className="group relative overflow-hidden rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-container-lowest)] p-6 shadow-sm">
          <div className="absolute -right-8 -top-8 h-32 w-32 rounded-bl-full bg-[var(--success-status)]/5 transition-transform group-hover:scale-110" aria-hidden="true" />
          <div className="relative z-10 mb-4 flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--success-status)]/10 text-[var(--success-status)]">
                <span className="material-symbols-outlined" aria-hidden="true" style={{ fontVariationSettings: "'FILL' 1" }}>
                  account_balance_wallet
                </span>
              </div>
              <h2 className="headline-md text-[var(--on-surface)]">Bank Setup</h2>
            </div>
            <span className="inline-flex items-center gap-1 rounded-full bg-[var(--success-status)]/10 px-2 py-1 text-[var(--success-status)] label-caps">
              <span className="material-symbols-outlined text-[14px]" aria-hidden="true">
                check_circle
              </span>
              COMPLETED
            </span>
          </div>
          <div className="relative z-10 mt-6 space-y-3">
            <div className="flex items-start gap-3">
              <span className="material-symbols-outlined mt-0.5 text-[20px] text-[var(--success-status)]" aria-hidden="true" style={{ fontVariationSettings: "'FILL' 1" }}>
                check_circle
              </span>
              <div>
                <div className="body-md font-medium text-[var(--on-surface)]">Operating Account</div>
                <div className="data-mono text-[var(--on-surface-variant)]">****4592</div>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <span className="material-symbols-outlined mt-0.5 text-[20px] text-[var(--success-status)]" aria-hidden="true" style={{ fontVariationSettings: "'FILL' 1" }}>
                check_circle
              </span>
              <div>
                <div className="body-md font-medium text-[var(--on-surface)]">Micro-deposits</div>
                <div className="body-sm text-[var(--on-surface-variant)]">Verified on Oct 24</div>
              </div>
            </div>
          </div>
          <Button
            variant="outline"
            className="relative z-10 mt-6 w-full border-[var(--border-subtle)] bg-[var(--surface-container)] hover:bg-[var(--surface-variant)] text-[var(--on-surface)] body-sm font-medium"
          >
            Manage Accounts
          </Button>
        </Card>

        {/* Technical Setup — IN PROGRESS primary */}
        <Card className="group relative overflow-hidden rounded-xl border-2 border-[var(--primary)] bg-[var(--surface-container-lowest)] p-6 shadow-[0_0_15px_rgba(0,63,177,0.1)]">
          <div className="absolute -right-8 -top-8 h-32 w-32 rounded-bl-full bg-[var(--primary)]/5 transition-transform group-hover:scale-110" aria-hidden="true" />
          <div className="relative z-10 mb-4 flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--primary)]/10 text-[var(--primary)]">
                <span className="material-symbols-outlined" aria-hidden="true" style={{ fontVariationSettings: "'FILL' 1" }}>
                  integration_instructions
                </span>
              </div>
              <h2 className="headline-md text-[var(--primary)]">Technical Setup</h2>
            </div>
            <span className="inline-flex items-center gap-1 rounded-full border border-[var(--pending-status)]/20 bg-[var(--pending-status)]/10 px-2 py-1 text-[var(--pending-status)] label-caps">
              <span className="material-symbols-outlined text-[14px]" aria-hidden="true">
                pending
              </span>
              IN PROGRESS
            </span>
          </div>
          <div className="relative z-10 mt-6 space-y-3">
            <div className="flex items-start gap-3">
              <span className="material-symbols-outlined mt-0.5 text-[20px] text-[var(--success-status)]" aria-hidden="true" style={{ fontVariationSettings: "'FILL' 1" }}>
                check_circle
              </span>
              <div>
                <div className="body-md font-medium text-[var(--on-surface-variant)] line-through">API Keys Generated</div>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <span className="material-symbols-outlined mt-0.5 text-[20px] text-[var(--success-status)]" aria-hidden="true" style={{ fontVariationSettings: "'FILL' 1" }}>
                check_circle
              </span>
              <div>
                <div className="body-md font-medium text-[var(--on-surface-variant)] line-through">Webhook Endpoints Configured</div>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <span className="material-symbols-outlined mt-0.5 text-[20px] text-[var(--outline)]" aria-hidden="true">
                radio_button_unchecked
              </span>
              <div>
                <div className="body-md font-medium text-[var(--on-surface)]">First Test Transaction</div>
                <div className="body-sm mt-1 text-[var(--on-surface-variant)]">Send a successful payment in test mode to proceed.</div>
              </div>
            </div>
          </div>
          <Button className="relative z-10 mt-6 flex w-full items-center justify-center gap-2 bg-[var(--primary)] text-[var(--on-primary)] hover:bg-[var(--surface-tint)] body-sm font-medium shadow-sm">
            Go to Developer Dashboard
            <span className="material-symbols-outlined text-[16px]" aria-hidden="true">
              arrow_forward
            </span>
          </Button>
        </Card>
      </div>
    </main>
  );
}
