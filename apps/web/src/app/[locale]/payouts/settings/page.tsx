import type { Metadata } from "next";
import { Link } from "@/i18n/navigation";
import { Badge } from "@/components/ui/badge";
import { PayoutScheduleForm } from "@/components/payouts/payout-schedule-form";
import { DestinationAccountDialog } from "@/components/payouts/destination-account-dialog";
import { getDestinationAccount, getPayoutSettings, listBankAccounts, getPayoutsOverview } from "@/server/data/payouts";
import { formatDateLong, formatMoney } from "@/lib/format";

// Payout settings — every control here used to be uncontrolled decoration.

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Payout Settings — Kinetic Ledger",
  description: "Cadence, minimum amount, destination account and notifications.",
};

export default async function PayoutSettingsPage() {
  const [settings, accounts, destination, overview] = await Promise.all([
    getPayoutSettings(),
    listBankAccounts(),
    getDestinationAccount(),
    getPayoutsOverview(),
  ]);

  return (
    <main className="mx-auto w-full max-w-container-max space-y-6 p-gutter">
      <nav aria-label="Breadcrumb" className="body-sm flex items-center gap-2 text-[var(--on-surface-variant)]">
        <Link href="/payouts" className="transition-colors hover:text-[var(--primary)]">
          Payouts
        </Link>
        <span className="material-symbols-outlined text-[16px]" aria-hidden="true">
          chevron_right
        </span>
        <span className="text-[var(--on-surface)]" aria-current="page">
          Settings
        </span>
      </nav>

      <div className="flex flex-col gap-2">
        <h1 className="headline-xl text-[var(--on-surface)]">Payout Settings</h1>
        <p className="body-md text-[var(--on-surface-variant)]">
          When money leaves the balance, how much has to accumulate first, and where it lands.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="space-y-6 lg:col-span-8">
          <PayoutScheduleForm settings={settings} />
        </div>

        <div className="space-y-6 lg:col-span-4">
          <section className="group relative overflow-hidden rounded-xl border border-[var(--outline-variant)] bg-[var(--surface-container-lowest)] p-6">
            <div
              className="pointer-events-none absolute -right-16 -top-16 h-32 w-32 rounded-bl-full bg-[var(--primary)]/5 transition-transform duration-500 group-hover:scale-110"
              aria-hidden="true"
            />
            <div className="relative z-10 mb-6 flex items-start justify-between">
              <h2 className="headline-md flex items-center gap-2 text-[var(--on-surface)]">
                <span className="material-symbols-outlined text-[var(--primary)]" aria-hidden="true">
                  account_balance_wallet
                </span>
                Destination Account
              </h2>
              <DestinationAccountDialog accounts={accounts} currentId={settings.destinationAccountId} />
            </div>
            <div className="relative z-10 flex items-center gap-4 rounded-lg border border-[var(--surface-container-high)] bg-[var(--surface-bright)] p-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded border border-[var(--outline-variant)] bg-white">
                <span className="headline-md font-bold text-[var(--primary)]">
                  {(destination?.bank ?? "N/A").slice(0, 3).toUpperCase()}
                </span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="body-md truncate font-semibold text-[var(--on-surface)]">
                  {destination?.bank ?? "No account selected"}
                </p>
                <div className="mt-1 flex items-center gap-2">
                  <span className="data-mono text-[var(--on-surface-variant)]">{destination?.masked ?? "—"}</span>
                  {destination?.verified ? (
                    <Badge className="bg-[var(--status-success-bg)] text-[var(--success-status)]">Verified</Badge>
                  ) : (
                    <Badge className="bg-[var(--surface-container-high)] text-[var(--on-surface-variant)]">
                      Verifying
                    </Badge>
                  )}
                </div>
              </div>
            </div>
          </section>

          <section className="rounded-xl border border-[var(--outline-variant)] bg-[var(--surface-container-lowest)] p-6">
            <h2 className="headline-md mb-2 text-[var(--on-surface)]">What this schedule means</h2>
            <ul className="body-sm space-y-2 text-[var(--on-surface-variant)]">
              <li>
                Next run:{" "}
                <span className="text-[var(--on-surface)]">
                  {overview.nextScheduledAt ? formatDateLong(overview.nextScheduledAt) : "nothing scheduled"}
                </span>
              </li>
              <li>
                Threshold:{" "}
                <span className="data-mono text-[var(--on-surface)]">
                  {formatMoney(settings.minimumAmount, settings.currency)}
                </span>
              </li>
              <li>
                Currently in flight:{" "}
                <span className="data-mono text-[var(--on-surface)]">
                  {formatMoney(overview.pendingAmount, overview.currency)}
                </span>
              </li>
            </ul>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link
                href="/payouts"
                className="label-md rounded-lg border border-[var(--border-subtle)] px-3 py-2 text-[var(--on-surface)] hover:bg-[var(--surface-container-low)]"
              >
                Payout history
              </Link>
              <Link
                href="/settings/notifications"
                className="label-md rounded-lg border border-[var(--border-subtle)] px-3 py-2 text-[var(--on-surface)] hover:bg-[var(--surface-container-low)]"
              >
                Notification preferences
              </Link>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
