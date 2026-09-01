import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { formatMoney, formatNumber } from "@/lib/format";
import type { Customer } from "@/server/data/customers";

// Lifetime metrics for one customer — derived from the same ledger rows the
// payments panel lists, so the numbers can never disagree with the table.
export function CustomerLifetimeStats({ customer }: { customer: Customer }) {
  const avg = customer.succeededCount ? customer.lifetimeValue / customer.succeededCount : 0;

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
      <Card className="border-[var(--border-subtle)] bg-[var(--surface)] p-4">
        <span className="label-caps text-[var(--on-surface-variant)]">Lifetime value</span>
        <div className="mt-2 headline-lg data-mono text-[var(--on-surface)]">
          {formatMoney(customer.lifetimeValue, customer.currency)}
        </div>
      </Card>
      <Card className="border-[var(--border-subtle)] bg-[var(--surface)] p-4">
        <span className="label-caps text-[var(--on-surface-variant)]">Payments</span>
        <div className="mt-2 headline-lg data-mono text-[var(--on-surface)]">{formatNumber(customer.paymentCount)}</div>
        <p className="body-sm mt-1 text-[var(--on-surface-variant)]">
          {customer.succeededCount} succeeded · {customer.failedCount} failed
        </p>
      </Card>
      <Card className="border-[var(--border-subtle)] bg-[var(--surface)] p-4">
        <span className="label-caps text-[var(--on-surface-variant)]">Success rate</span>
        <div className="mt-2 headline-lg data-mono text-[var(--on-surface)]">{customer.successRate.toFixed(1)}%</div>
        <Progress
          value={customer.successRate}
          className="mt-2 h-1.5 bg-[var(--surface-container-high)]"
          aria-label={`Success rate ${customer.successRate.toFixed(1)} percent`}
        />
      </Card>
      <Card className="border-[var(--border-subtle)] bg-[var(--surface)] p-4">
        <span className="label-caps text-[var(--on-surface-variant)]">Average payment</span>
        <div className="mt-2 headline-lg data-mono text-[var(--on-surface)]">{formatMoney(avg, customer.currency)}</div>
      </Card>
    </div>
  );
}

// Payment methods / channels this customer has actually used. Empty is a real
// state here, not a blank card.
export function CustomerPaymentMethods({ customer }: { customer: Customer }) {
  return (
    <Card className="border-[var(--border-subtle)] bg-[var(--surface)] p-4">
      <h2 className="headline-md text-[var(--on-surface)]">Payment methods</h2>
      {customer.methods.length === 0 ? (
        <p className="body-sm mt-2 text-[var(--on-surface-variant)]">
          No stored methods yet — the first successful charge will record one here.
        </p>
      ) : (
        <ul className="mt-3 space-y-2">
          {customer.methods.map((m) => (
            <li
              key={m}
              className="flex items-center gap-3 rounded border border-[var(--border-subtle)] bg-[var(--surface-container-lowest)] px-3 py-2"
            >
              <span className="material-symbols-outlined text-[18px] text-[var(--on-surface-variant)]" aria-hidden="true">
                credit_card
              </span>
              <span className="body-sm text-[var(--on-surface)]">{m}</span>
            </li>
          ))}
        </ul>
      )}
      {customer.channels.length ? (
        <p className="body-sm mt-3 text-[var(--on-surface-variant)]">
          Channels: <span className="data-mono">{customer.channels.join(", ")}</span>
        </p>
      ) : null}
    </Card>
  );
}
