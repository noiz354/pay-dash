import "server-only";

import { formatDateTime, formatMoney } from "@/lib/format";
import type {
  MovementStatus,
  MovementType,
} from "@/lib/balance-status";
import type { RecipientDraft } from "@/lib/payout-csv";
import { getLedgerRows } from "./transactions";
import { approveBatch, createBatch, listBankAccounts, getPayoutBatches } from "./payouts";
import type { ProviderBalance, ProviderReadResult } from "@/domain/payments/provider-read";

export type { MovementStatus, MovementType };
export { MOVEMENT_TYPES, MOVEMENT_STATUSES, MOVEMENT_TYPE_LABELS, MOVEMENT_STATUS_LABELS } from "@/lib/balance-status";

// ---------------------------------------------------------------------------
// Balance data source (ADR-0011).
//
// The prototype balance page printed two contradictory available figures on
// one screen (`Rp 1.240.500.000` desktop, `IDR 1.005.870.599` mobile), an
// Auto-Withdrawal card that invented "Daily → BCA ****4910" while the payout
// schedule said "Weekly → BCA ****1234", and a 5-row history const with mixed
// date formats and a "Mobile prototype rows" comment.
//
// This module is the single derivation behind every figure on the page:
//
//   movements  ← transaction ledger (settlements / refunds / pending)
//              ← payout batches      (paid / reserved / failed withdrawals)
//              ← this module's own store (top-ups)
//   available  ← OPENING_BALANCE + settled movements − reserved withdrawals
//
// Nothing is stored twice: a withdrawal is a one-recipient payout batch
// (ADR-0010) that is created and released on demand, so the balance page, the
// payout history and the CSV export can never disagree. The same in-memory
// `globalThis` seam as the other data modules — the own store only keeps the
// opening balance and merchant top-ups, the only things that have no other
// home in the app.
// ---------------------------------------------------------------------------

export type Movement = {
  id: string;
  at: string;
  type: MovementType;
  status: MovementStatus;
  label: string;
  reference: string;
  /** Where the money can be inspected: `/transactions/<id>` or `/payouts/<id>`. */
  link: string | null;
  /** Signed amount in IDR. */
  amount: number;
  currency: string;
  note?: string;
};

export type MovementFilters = {
  type?: MovementType | "all";
  status?: MovementStatus | "all";
  range?: "7d" | "30d" | "90d" | "all";
  q?: string;
  sort?: "recent" | "amount";
  page?: number;
  pageSize?: number;
};

export type PaginatedMovements = {
  rows: Movement[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
  isFiltered: boolean;
};

export type BalanceOverview = {
  available: number;
  /** Incoming settlements not yet in `available` (pending ledger rows). */
  pendingSettlements: number;
  /** Scheduled/processing withdrawals already subtracted from `available`. */
  reserved: number;
  lastPayoutAt: string | null;
  currency: string;
};

export type TrendPoint = {
  date: string;
  /** Ending balance for the day, under the same rules as `available`. */
  ending: number;
  inflow: number;
  outflow: number;
};

const CURRENCY = "IDR";

/** Everything before the seeded ledger window. Constant — see ADR-0011. */
export const OPENING_BALANCE = 1_000_000_000;

type TopUp = {
  id: string;
  at: string;
  amount: number;
  method: string;
};

type Store = {
  topUps: TopUp[];
  sequence: number;
};

// --- seeds ------------------------------------------------------------------

// Anchored like the ledger seed (`new Date()` at 09:00 UTC) so SSR renders
// agree and the top-ups sit inside the 30-day trend window.
function defaultStore(): Store {
  const anchor = new Date();
  anchor.setUTCHours(9, 0, 0, 0);
  const at = (daysAgo: number, hour: number, minute = 0) =>
    new Date(anchor.getTime() - daysAgo * 24 * 60 * 60 * 1000 + (hour - 9) * 60 * 60 * 1000 + minute * 60_000)
      .toISOString();
  return {
    topUps: [
      { id: "top_1", at: at(6, 12, 30), amount: 450_000_000, method: "BCA Virtual Account" },
      { id: "top_2", at: at(3, 8, 15), amount: 200_000_000, method: "QRIS — GoPay" },
    ],
    sequence: 3,
  };
}

const globalStore = globalThis as unknown as { __kineticBalanceStore?: Store };
function store(): Store {
  if (!globalStore.__kineticBalanceStore) globalStore.__kineticBalanceStore = defaultStore();
  return globalStore.__kineticBalanceStore;
}

// --- derivation --------------------------------------------------------------

/**
 * Effect a movement has on the balance under the overview rules:
 * settled movements count at their time, reserved (pending) withdrawals
 * already count, pending settlements wait, failed rows move no money.
 */
function effectOf(m: Movement): number {
  if (m.status === "SETTLED") return m.amount;
  if (m.status === "PENDING" && m.type === "WITHDRAWAL") return m.amount;
  return 0;
}

function deriveMovements(): Movement[] {
  const out: Movement[] = [];

  // 1. Ledger: settlements, refunds and what is still clearing.
  for (const tx of getLedgerRows()) {
    if (tx.status === "SUCCEEDED") {
      out.push({
        id: `mv_setl_${tx.id}`,
        at: tx.createdAt,
        type: "SETTLEMENT",
        status: "SETTLED",
        label: `Payment — ${tx.customerName}`,
        reference: tx.id,
        link: `/transactions/${tx.id}`,
        amount: tx.net,
        currency: tx.currency,
        note: tx.description,
      });
    } else if (tx.status === "PROCESSING" || tx.status === "PENDING") {
      out.push({
        id: `mv_setl_${tx.id}`,
        at: tx.createdAt,
        type: "SETTLEMENT",
        status: "PENDING",
        label: `Payment — ${tx.customerName}`,
        reference: tx.id,
        link: `/transactions/${tx.id}`,
        amount: tx.net,
        currency: tx.currency,
        note: "Awaiting channel confirmation",
      });
    }
    if (tx.refundedAmount > 0) {
      out.push({
        id: `mv_ref_${tx.id}`,
        at: tx.updatedAt,
        type: "REFUND",
        status: "SETTLED",
        label: `Refund — ${tx.customerName}`,
        reference: tx.id,
        link: `/transactions/${tx.id}`,
        amount: -tx.refundedAmount,
        currency: tx.currency,
        note: "Refund issued",
      });
    }
  }

  // 2. Payouts: every recipient is a withdrawal in this ledger.
  for (const batch of getPayoutBatches()) {
    batch.recipients.forEach((r, index) => {
      const base = {
        id: `mv_wd_${batch.id}_${index + 1}`,
        type: "WITHDRAWAL" as const,
        label: `Withdrawal — ${r.name}`,
        reference: batch.id,
        link: `/payouts/${batch.id}`,
        amount: -r.amount,
        currency: batch.currency,
      };
      if (r.status === "PAID") {
        out.push({ ...base, at: r.paidAt ?? batch.createdAt, status: "SETTLED", note: batch.name });
      } else if (r.status === "PENDING") {
        // Reserved when the batch was created — not when it will run — so the
        // available figure and the trend book the deduction at the moment it
        // actually happened.
        out.push({
          ...base,
          at: batch.createdAt,
          status: "PENDING",
          note: batch.scheduledFor
            ? `${batch.name} · reserved until release ${formatDateTime(batch.scheduledFor)}`
            : `${batch.name} · reserved until release`,
        });
      } else {
        out.push({
          ...base,
          at: batch.completedAt ?? batch.createdAt,
          status: "FAILED",
          note: `${r.failureReason ?? "No funds moved"} · ${batch.name}`,
        });
      }
    });
  }

  // 3. Merchant top-ups live only here.
  for (const t of store().topUps) {
    out.push({
      id: t.id,
      at: t.at,
      type: "TOP_UP",
      status: "SETTLED",
      label: `Top up — ${t.method}`,
      reference: t.id,
      link: null,
      amount: t.amount,
      currency: CURRENCY,
    });
  }

  return out.sort((a, b) => b.at.localeCompare(a.at));
}

// --- reads -------------------------------------------------------------------

const RANGE_DAYS: Record<NonNullable<MovementFilters["range"]>, number | null> = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
  all: null,
};

/** Lazily attempt a provider balance read (see transactions.ts note re: jsdom env). */
async function tryProviderBalance(): Promise<ProviderReadResult<ProviderBalance>> {
  try {
    const { getProviderReadService } = await import("@/server/repositories/provider-read");
    const service = await getProviderReadService();
    return await service.readBalance();
  } catch {
    return { connected: false };
  }
}

export async function getBalanceOverview(): Promise<BalanceOverview> {
  // Live provider balance (rekomendasi #4) takes precedence for the available
  // figure; derived pending/reserved settlements still come from the ledger.
  // A configured-but-failing provider propagates (never mocked); with no
  // connection the in-memory dev/demo ledger is the fallback.
  const providerResult = await tryProviderBalance();
  if (providerResult.connected) {
    const { available, currency } = providerResult.data;
    let pendingSettlements = 0;
    let reserved = 0;
    let lastPayoutAt: string | null = null;
    for (const m of deriveMovements()) {
      if (m.type === "WITHDRAWAL") {
        if (m.status === "SETTLED" && (!lastPayoutAt || m.at > lastPayoutAt)) lastPayoutAt = m.at;
        if (m.status === "PENDING") reserved += -m.amount;
      } else if (m.status === "PENDING") {
        pendingSettlements += m.amount;
      }
    }
    return { available, pendingSettlements, reserved, lastPayoutAt, currency };
  }

  let available = OPENING_BALANCE;
  let pendingSettlements = 0;
  let reserved = 0;
  let lastPayoutAt: string | null = null;

  for (const m of deriveMovements()) {
    const effect = effectOf(m);
    available += effect;
    if (m.type === "WITHDRAWAL") {
      if (m.status === "SETTLED" && (!lastPayoutAt || m.at > lastPayoutAt)) lastPayoutAt = m.at;
      if (m.status === "PENDING") reserved += -m.amount;
    } else if (m.status === "PENDING") {
      pendingSettlements += m.amount;
    }
  }

  return { available, pendingSettlements, reserved, lastPayoutAt, currency: CURRENCY };
}

export async function listMovements(filters: MovementFilters = {}): Promise<PaginatedMovements> {
  const {
    type = "all",
    status = "all",
    range = "all",
    q = "",
    sort = "recent",
    page = 1,
    pageSize = 10,
  } = filters;

  let rows = deriveMovements();
  const term = q.trim().toLowerCase();

  if (type !== "all") rows = rows.filter((m) => m.type === type);
  if (status !== "all") rows = rows.filter((m) => m.status === status);

  const days = RANGE_DAYS[range];
  if (days !== null) {
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    rows = rows.filter((m) => new Date(m.at).getTime() >= cutoff);
  }

  if (term) {
    rows = rows.filter((m) =>
      `${m.label} ${m.reference} ${m.note ?? ""}`.toLowerCase().includes(term)
    );
  }

  rows.sort((a, b) => {
    if (sort === "amount") return Math.abs(b.amount) - Math.abs(a.amount);
    return b.at.localeCompare(a.at);
  });

  const total = rows.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(1, page), pageCount);
  const start = (safePage - 1) * pageSize;

  return {
    rows: rows.slice(start, start + pageSize),
    total,
    page: safePage,
    pageSize,
    pageCount,
    isFiltered: type !== "all" || status !== "all" || range !== "all" || term.length > 0,
  };
}

export async function getBalanceTrend(days = 30): Promise<TrendPoint[]> {
  const sorted = deriveMovements().sort((a, b) => a.at.localeCompare(b.at));
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const startMs = today.getTime() - (days - 1) * 24 * 60 * 60 * 1000;
  const fmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "2-digit", timeZone: "UTC" });

  const points: TrendPoint[] = [];
  let running = OPENING_BALANCE;
  let pointer = 0;

  for (let i = 0; i < days; i++) {
    const dayStart = startMs + i * 24 * 60 * 60 * 1000;
    const dayEnd = dayStart + 24 * 60 * 60 * 1000;
    let inflow = 0;
    let outflow = 0;

    while (pointer < sorted.length && new Date(sorted[pointer].at).getTime() < dayEnd) {
      const m = sorted[pointer++];
      const effect = effectOf(m);
      running += effect;
      if (new Date(m.at).getTime() >= startMs) {
        if (effect > 0) inflow += effect;
        else if (effect < 0) outflow += -effect;
      }
    }

    points.push({ date: fmt.format(new Date(dayStart)), ending: running, inflow, outflow });
  }

  return points;
}

// --- writes ------------------------------------------------------------------

export async function topUpBalance(input: {
  amount: number;
  method: string;
}): Promise<{ movement: Movement; available: number }> {
  const s = store();
  const id = `top_${s.sequence}`;
  s.sequence += 1;
  const at = new Date().toISOString();
  s.topUps.push({ id, at, amount: input.amount, method: input.method });
  const overview = await getBalanceOverview();
  return {
    movement: {
      id,
      at,
      type: "TOP_UP",
      status: "SETTLED",
      label: `Top up — ${input.method}`,
      reference: id,
      link: null,
      amount: input.amount,
      currency: CURRENCY,
    },
    available: overview.available,
  };
}

export type WithdrawResult = {
  batchId: string;
  paid: boolean;
  failureReason: string | null;
  available: number;
};

/**
 * A withdrawal is a payout batch — one recipient (the destination account),
 * created and released immediately (ADR-0010's deterministic settlement).
 * That keeps an audit trail, reuses the release gate, and means the
 * movements table, the payout history and the balance all show the same row.
 */
export async function withdrawBalance(input: {
  amount: number;
  accountId: string;
}): Promise<WithdrawResult> {
  const account = (await listBankAccounts()).find((a) => a.id === input.accountId);
  if (!account) throw new Error("That destination account does not exist");
  if (!account.verified) {
    throw new Error(`${account.bank} ${account.masked} is not verified yet`);
  }

  const overview = await getBalanceOverview();
  if (input.amount > overview.available) {
    throw new Error(
      `Only ${formatMoney(overview.available, overview.currency)} is available — the withdrawal exceeds it`
    );
  }

  const draft: RecipientDraft = {
    line: 1,
    name: account.holder,
    bank: account.bank,
    accountNumber: account.accountNumber,
    amount: input.amount,
    reference: "BALANCE",
  };

  const batch = await createBatch({
    name: `Withdrawal to ${account.bank} ${account.masked}`,
    source: "Manual",
    note: "Withdrawn from the balance",
    recipients: [draft],
  });
  const result = await approveBatch(batch.id);
  if (!result) throw new Error("The withdrawal batch disappeared before it could be released");

  const after = await getBalanceOverview();
  const failed = result.failed > 0;
  return {
    batchId: batch.id,
    paid: !failed,
    failureReason: failed ? "Rejected by the banking partner" : null,
    available: after.available,
  };
}

// --- CSV ----------------------------------------------------------------------

function csvCell(value: string | number | null) {
  const text = value === null ? "" : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function movementsToCsv(rows: Movement[]) {
  const header = [
    "id",
    "at",
    "type",
    "status",
    "label",
    "reference",
    "link",
    "amount",
    "currency",
    "note",
  ];
  const body = rows.map((m) =>
    [m.id, m.at, m.type, m.status, m.label, m.reference, m.link ?? "", m.amount, m.currency, m.note ?? ""]
      .map(csvCell)
      .join(",")
  );
  return [header.join(","), ...body].join("\n");
}
