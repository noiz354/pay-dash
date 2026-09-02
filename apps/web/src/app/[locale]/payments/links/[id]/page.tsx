import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Separator } from "@/components/ui/separator";
import { CopyButton } from "@/components/common/copy-button";
import { LinkStatusPill } from "@/components/links/link-status-pill";
import { ExpireLinkButton } from "@/components/links/expire-link-button";
import { SimulatePaymentButton } from "@/components/links/simulate-payment-button";
import { getLink } from "@/server/data/links";
import { getTransaction } from "@/server/data/transactions";
import { formatMoney, formatDateLong, formatDateTime, formatRelative } from "@/lib/format";
import { LINK_KIND_LABELS, LINK_STATUS_ICONS, shareUrlOf } from "@/lib/link-status";

// Payment-link detail (ADR-0013) — the destination of every row in the link
// table. The status pill is derived (cancelled → paid → expired → open); the
// only merchant actions are closing an open link and, in TEST MODE, standing
// in for the payer. A simulated payment lands in the ledger, which is what
// flips the pill and unlocks "View payment".
export const dynamic = "force-dynamic";

type Params = Promise<{ locale: string; id: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { id } = await params;
  return { title: `${id} — Payment Link — Kinetic Ledger` };
}

function Row({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5">
      <span className="label-caps text-[var(--on-surface-variant)] shrink-0">{label}</span>
      <span className={`text-right break-words ${mono ? "data-mono text-[var(--on-surface)]" : "body-sm text-[var(--on-surface)]"}`}>
        {value}
      </span>
    </div>
  );
}

export default async function PaymentLinkDetailPage({ params }: { params: Params }) {
  const { id } = await params;
  const link = await getLink(id);
  if (!link) notFound();

  const open = link.status === "OPEN";
  const paid = link.status === "PAID";
  // A simulated payment creates a ledger row whose id equals the link id;
  // seeded pre-window payments have paidAt but no ledger row — "View payment"
  // only points where a record actually exists.
  const paymentTx = paid ? await getTransaction(link.id) : null;

  return (
    <main className="mx-auto w-full max-w-container-max p-gutter space-y-6 pb-12">
      <Breadcrumb>
        <BreadcrumbList className="body-sm">
          <BreadcrumbItem>
            <BreadcrumbLink render={<Link href="/dashboard">Dashboard</Link>} />
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink render={<Link href="/payments/links">Payment links</Link>} />
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage className="data-mono">{link.id}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      {/* Header */}
      <section className="flex flex-col lg:flex-row justify-between items-start lg:items-end gap-4 border-b border-[var(--border-subtle)] pb-4">
        <div className="min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="headline-xl data-mono text-[var(--on-surface)] break-all">{link.id}</h1>
            <LinkStatusPill status={link.status} />
            <CopyButton value={link.id} label="Copy ID" />
          </div>
          <p className="body-md text-[var(--on-surface-variant)] mt-1">
            {formatMoney(link.total, link.currency)} · {LINK_KIND_LABELS[link.kind]} · created{" "}
            {formatDateLong(link.createdAt)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 shrink-0">
          <Link href="/payments/links">
            <Button variant="outline" className="border-[var(--border-subtle)] gap-1">
              <span className="material-symbols-outlined text-[18px]" aria-hidden="true">
                arrow_back
              </span>
              Back to links
            </Button>
          </Link>
          {open ? (
            <>
              <ExpireLinkButton id={link.id} />
              <SimulatePaymentButton id={link.id} />
            </>
          ) : null}
          {paid && paymentTx ? (
            <Link href={`/transactions/${paymentTx.id}`}>
              <Button className="bg-[var(--primary)] text-[var(--on-primary)] hover:bg-[var(--on-primary-fixed-variant)] gap-1">
                <span className="material-symbols-outlined text-[18px]" aria-hidden="true">
                  receipt_long
                </span>
                View payment
              </Button>
            </Link>
          ) : null}
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Details */}
        <Card className="lg:col-span-5 bg-[var(--surface)] border-[var(--border-subtle)] p-5 shadow-sm">
          <h2 className="headline-md text-[var(--on-surface)] mb-2">Link details</h2>
          <div className="divide-y divide-[var(--border-subtle)]">
            <Row label="Type" value={LINK_KIND_LABELS[link.kind]} />
            <Row label="Payer email" value={link.payerEmail ?? "—"} mono={!!link.payerEmail} />
            <Row label="Created" value={`${formatDateTime(link.createdAt)} · ${formatRelative(link.createdAt)}`} />
            <Row
              label="Expires"
              value={link.expiresAt ? `${formatDateLong(link.expiresAt)} · ${formatRelative(link.expiresAt)}` : "No expiry"}
            />
            {link.paidAt ? <Row label="Paid" value={`${formatDateLong(link.paidAt)} · ${formatRelative(link.paidAt)}`} /> : null}
            {link.cancelledAt ? (
              <Row label="Closed" value={`${formatDateLong(link.cancelledAt)} · ${formatRelative(link.cancelledAt)}`} />
            ) : null}
          </div>
        </Card>

        {/* Items + share */}
        <div className="lg:col-span-7 space-y-6">
          <Card className="bg-[var(--surface)] border-[var(--border-subtle)] p-5 shadow-sm">
            <h2 className="headline-md text-[var(--on-surface)] mb-2">Items</h2>
            <div className="divide-y divide-[var(--border-subtle)]">
              {link.items.map((item) => (
                <div key={item.id} className="flex items-center justify-between gap-4 py-2.5">
                  <span className="body-sm text-[var(--on-surface)]">{item.label}</span>
                  <span className="data-mono text-[var(--on-surface)]">{formatMoney(item.amount, link.currency)}</span>
                </div>
              ))}
            </div>
            <Separator className="my-2 bg-[var(--border-subtle)]" />
            <div className="flex items-center justify-between gap-4 pt-2.5">
              <span className="label-md text-[var(--on-surface)]">Total</span>
              <span className="data-mono text-base font-semibold text-[var(--on-surface)]">
                {formatMoney(link.total, link.currency)}
              </span>
            </div>
          </Card>

          <Card className="bg-[var(--surface)] border-[var(--border-subtle)] p-5 shadow-sm">
            <h2 className="headline-md text-[var(--on-surface)] mb-2">Checkout URL</h2>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="data-mono text-sm text-[var(--on-surface)] break-all">{shareUrlOf(link.id)}</span>
              <CopyButton value={shareUrlOf(link.id)} label="Copy URL" />
            </div>
            <p className="body-sm text-[var(--on-surface-variant)] mt-2">
              Send this to your customer — payment on it settles straight into your ledger.
            </p>
          </Card>

          {/* Status note — what this status means and what can still happen */}
          <Card className="border-[var(--border-subtle)] bg-[var(--surface-container-low)]/40 p-5 shadow-sm">
            <div className="flex items-start gap-3">
              <span className="material-symbols-outlined text-[22px] mt-0.5 text-[var(--on-surface-variant)]" aria-hidden="true">
                {LINK_STATUS_ICONS[link.status]}
              </span>
              <div>
                <h2 className="headline-md text-[var(--on-surface)]">
                  {link.status === "OPEN" && "This link is open"}
                  {link.status === "PAID" && "This link was paid"}
                  {link.status === "EXPIRED" && "This link expired"}
                  {link.status === "CANCELLED" && "You closed this link"}
                </h2>
                <p className="body-sm text-[var(--on-surface-variant)] mt-1">
                  {link.status === "OPEN" &&
                    "Anyone with the URL can still pay it. In TEST MODE you can stand in for the payer — the payment is recorded in the ledger immediately and the link flips to paid."}
                  {link.status === "PAID" &&
                    (paymentTx
                      ? `Payment captured ${formatRelative(link.paidAt ?? link.createdAt)}. The ledger keeps the full record — amounts, fee and settlement.`
                      : `Payment captured ${link.paidAt ? formatRelative(link.paidAt) : "before the test ledger window"}. The amount is already in your balance.`)}
                  {link.status === "EXPIRED" &&
                    `The clock ran out ${link.expiresAt ? formatRelative(link.expiresAt) : ""} — this URL no longer accepts payment. Create a fresh link to collect this amount.`}
                  {link.status === "CANCELLED" &&
                    `Closed ${link.cancelledAt ? formatRelative(link.cancelledAt) : ""} — the URL no longer accepts payment. Nothing was charged.`}
                </p>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </main>
  );
}
