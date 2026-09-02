import { Link } from "@/i18n/navigation";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AutoWithdrawalToggle } from "./auto-withdrawal-toggle";
import { PAYOUT_CADENCE_LABELS, type PayoutCadence, type Weekday } from "@/lib/payout-status";
import type { BankAccount, PayoutSettings } from "@/server/data/payouts";
import { formatDateLong } from "@/lib/format";

function cadenceLine(cadence: PayoutCadence, weekday: Weekday, monthDay: number) {
  const label = PAYOUT_CADENCE_LABELS[cadence];
  if (cadence === "weekly") return `${label} · ${weekday}`;
  if (cadence === "monthly") return `${label} · day ${monthDay}`;
  return label;
}

/**
 * Auto-Withdrawal, bound to the real payout schedule (ADR-0011).
 * The prototype hard-coded "Daily → BCA ****4910" while the schedule said
 * Weekly → BCA ****1234; now cadence, destination and next run all come from
 * `getPayoutSettings()` / `getDestinationAccount()` / `nextRunForCadence()`,
 * and the switch writes back through a server action.
 */
export function AutoWithdrawalCard({
  settings,
  destination,
  nextRunAt,
}: {
  settings: PayoutSettings;
  destination: BankAccount | null;
  nextRunAt: string | null;
}) {
  const on = settings.automated;
  const destinationLabel = destination ? `${destination.bank} ${destination.masked}` : "No account selected";

  return (
    <Card className="bg-[var(--surface-container-lowest)] border border-[var(--border-subtle)] rounded-xl p-6 shadow-sm flex flex-col">
      <div className="flex justify-between items-start mb-4">
        <div className="w-10 h-10 rounded-full bg-[var(--secondary-container)] flex items-center justify-center text-[var(--on-secondary-container)]">
          <span className="material-symbols-outlined" aria-hidden="true">
            autorenew
          </span>
        </div>
        <AutoWithdrawalToggle enabled={on} />
      </div>
      <h3 className="headline-md text-[var(--on-surface)] mb-2">Auto-Withdrawal</h3>
      <p className="body-sm text-[var(--on-surface-variant)] mb-4">
        Automatically transfer available funds to your designated bank account on a schedule.
      </p>
      <div className="mt-auto bg-[var(--surface)] p-3 rounded border border-[var(--border-subtle)] space-y-2.5">
        <div className="flex justify-between items-center gap-2">
          <span className="label-caps text-[var(--outline)]">Schedule</span>
          <span className="body-sm font-medium text-[var(--on-surface)]">
            {on ? cadenceLine(settings.cadence, settings.weekday, settings.monthDay) : "Paused"}
          </span>
        </div>
        <div className="flex justify-between items-center gap-2">
          <span className="label-caps text-[var(--outline)]">Destination</span>
          <span className="flex items-center gap-1.5 min-w-0" title={destinationLabel}>
            <span className="body-sm font-medium text-[var(--on-surface)] truncate max-w-[130px]">
              {destinationLabel}
            </span>
            {destination ? (
              destination.verified ? (
                <Badge className="bg-[var(--status-success-bg)] text-[var(--success-status)]">Verified</Badge>
              ) : (
                <Badge className="bg-[var(--surface-container-high)] text-[var(--on-surface-variant)]">Verifying</Badge>
              )
            ) : null}
          </span>
        </div>
        <div className="flex justify-between items-center gap-2">
          <span className="label-caps text-[var(--outline)]">Next run</span>
          <span className="body-sm font-medium text-[var(--on-surface)] text-right">
            {on && nextRunAt ? formatDateLong(nextRunAt) : "—"}
          </span>
        </div>
      </div>
      <Link
        href="/payouts/settings"
        className="body-sm font-medium text-[var(--primary)] hover:underline mt-3 inline-flex items-center gap-1 justify-center w-full"
      >
        Configure
        <span className="material-symbols-outlined text-[16px]" aria-hidden="true">
          arrow_forward
        </span>
      </Link>
    </Card>
  );
}
