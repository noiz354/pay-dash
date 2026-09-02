import { Link } from "@/i18n/navigation";
import { Card } from "@/components/ui/card";
import { formatDateTime, formatMoney } from "@/lib/format";
import { getBalanceOverview } from "@/server/data/balance";

// Home-page balance strip (ADR-0012): the single most important merchant
// figure is derived from the same overview as /balance (ADR-0011), so the
// two surfaces cannot disagree. Read-only — every mutation stays on
// /balance and /payouts.
export async function BalanceStrip() {
  const o = await getBalanceOverview();

  return (
    <Card className="bg-[var(--surface)] border-[var(--border-subtle)] p-5 shadow-sm">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="label-caps text-[var(--on-surface-variant)] mb-1">Available balance</p>
          <p
            data-testid="balance-strip-available"
            className="data-mono text-[28px] font-bold text-[var(--on-surface)] leading-none"
          >
            {formatMoney(o.available, o.currency)}
          </p>
          <Link
            href="/balance"
            className="mt-3 inline-flex items-center gap-1 body-sm font-medium text-[var(--primary)] hover:underline"
          >
            View balance &amp; history
            <span className="material-symbols-outlined text-[16px]" aria-hidden="true">
              arrow_forward
            </span>
          </Link>
        </div>

        <dl className="grid grid-cols-1 sm:grid-cols-3 gap-4 lg:gap-8">
          <div>
            <dt className="label-caps text-[var(--on-surface-variant)] text-[11px]">
              Pending clearance
            </dt>
            <dd className="data-mono text-[15px] font-medium text-[var(--on-surface)] mt-1">
              {formatMoney(o.pendingSettlements, o.currency)}
            </dd>
          </div>
          <div>
            <dt className="label-caps text-[var(--on-surface-variant)] text-[11px]">Reserved</dt>
            <dd className="data-mono text-[15px] font-medium text-[var(--on-surface)] mt-1">
              {formatMoney(o.reserved, o.currency)}
            </dd>
          </div>
          <div>
            <dt className="label-caps text-[var(--on-surface-variant)] text-[11px]">Last payout</dt>
            <dd className="body-sm font-medium text-[var(--on-surface)] mt-1">
              {o.lastPayoutAt ? formatDateTime(o.lastPayoutAt) : "—"}
            </dd>
          </div>
        </dl>
      </div>
    </Card>
  );
}
