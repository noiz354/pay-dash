import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/common/copy-button";
import { CustomerAvatar } from "@/components/customers/customer-avatar";
import { CustomerStatusPill } from "@/components/customers/customer-status-pill";
import { CustomerStatusMenu } from "@/components/customers/customer-status-menu";
import { CreateTransactionDialog } from "@/components/transactions/create-transaction-dialog";
import { formatDateLong, formatRelative } from "@/lib/format";
import type { Customer } from "@/server/data/customers";

// Identity block for a customer profile: who they are, what state they are in,
// and the two things you actually want to do next (charge them / see payments).
export function CustomerHeader({ customer }: { customer: Customer }) {
  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
      <div className="flex items-start gap-4">
        <CustomerAvatar
          name={customer.name}
          initials={customer.initials}
          seed={customer.email}
          className="size-14 text-base"
        />
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="headline-lg text-[var(--on-surface)]">{customer.name}</h1>
            <CustomerStatusPill status={customer.status} />
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <a
              href={`mailto:${customer.email}`}
              className="body-sm text-[var(--primary)] underline-offset-2 hover:underline"
            >
              {customer.email}
            </a>
            <CopyButton value={customer.email} label="Copy email" />
          </div>
          <p className="body-sm mt-1 text-[var(--on-surface-variant)]">
            <span className="data-mono">{customer.referenceId}</span> · Added {formatDateLong(customer.createdAt)}
            {customer.lastSeenAt ? <> · Last payment {formatRelative(customer.lastSeenAt)}</> : <> · No payments yet</>}
          </p>
          {customer.notes ? (
            <p className="body-sm mt-2 max-w-prose text-[var(--on-surface-variant)]">{customer.notes}</p>
          ) : null}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Link href={`/transactions?q=${encodeURIComponent(customer.email)}`}>
          <Button variant="outline" className="gap-2 border-[var(--border-subtle)]">
            <span className="material-symbols-outlined text-[18px]" aria-hidden="true">
              receipt_long
            </span>
            View payments
          </Button>
        </Link>
        <CreateTransactionDialog triggerLabel="Create payment" />
        <CustomerStatusMenu id={customer.id} name={customer.name} status={customer.status} />
      </div>
    </div>
  );
}
