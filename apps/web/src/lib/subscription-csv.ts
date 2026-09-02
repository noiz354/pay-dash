// Client-safe CSV serializer for subscription plans (ADR-0021) — the same
// shape as the store's toCsv()/customersToCsv()/invoicesToCsv() exports,
// kept client-safe so the export button can build the download from the
// rows the server page already fetched (mirrors ADR-0020's builder export).

export interface SubscriptionCsvRow {
  id: string;
  planName: string;
  customerName: string;
  customerEmail: string;
  interval: string;
  amount: number;
  currency: string;
  status: string;
  startedAt: string;
  nextBillingAt: string | null;
  cancelledAt: string | null;
}

export function subscriptionsToCsv(rows: SubscriptionCsvRow[]): string {
  const header = [
    "id",
    "plan",
    "customer_name",
    "customer_email",
    "interval",
    "amount",
    "currency",
    "status",
    "started_at",
    "next_billing_at",
    "cancelled_at",
  ];
  const cell = (v: string | number | null) => {
    const s = v === null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const body = rows.map((s) =>
    [
      s.id,
      s.planName,
      s.customerName,
      s.customerEmail,
      s.interval,
      s.amount,
      s.currency,
      s.status,
      s.startedAt,
      s.nextBillingAt,
      s.cancelledAt,
    ]
      .map(cell)
      .join(",")
  );
  return [header.join(","), ...body].join("\n");
}
