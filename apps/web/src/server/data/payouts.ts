import "server-only";

import {
  PAYOUT_STATUSES,
  isApprovable,
  isCancellable,
  type PayoutCadence,
  type PayoutStatus,
  type RecipientStatus,
  type Weekday,
} from "@/lib/payout-status";
import type { RecipientDraft } from "@/lib/payout-csv";
import { DEFAULT_DEMO_ORG } from "@/domain/payments/runtime-defaults";
import {
  parseOrganizationContext,
  type OrganizationContext,
} from "@/domain/tenancy/organization-context";
import { TenantIsolationError } from "@/domain/security/tenant";
import { recordTenantDenial } from "@/server/services/tenant-denial";

export { PAYOUT_STATUSES };
export type { PayoutStatus, RecipientStatus, PayoutCadence, Weekday };

// ---------------------------------------------------------------------------
// Payouts data source.
//
// The prototype had two orphan screens — a bulk page whose numbers were broken
// string literals (",250,890.00") and a settings page whose controls saved
// nothing — and no payout list, no batch record and no recipient anywhere in
// the app. This module is the missing spine: batches own recipients, every
// aggregate (pending total, completed 30d, batch status) is *derived* from
// those recipients, so the summary cards can never disagree with the tables.
//
// Same in-memory `globalThis` seam as transactions / customers / invoices /
// settings, ready to swap for Prisma.
// ---------------------------------------------------------------------------

export type Recipient = {
  id: string;
  name: string;
  bank: string;
  accountNumber: string;
  amount: number;
  reference: string;
  status: RecipientStatus;
  failureReason: string | null;
  paidAt: string | null;
};

export type PayoutEvent = {
  id: string;
  at: string;
  label: string;
  detail: string;
  kind: "info" | "success" | "warning" | "error";
};

export type PayoutBatch = {
  /**
   * Wave 7B — the owning tenant. Part of the row, not of a query: a batch
   * without an owner is unreachable by construction (every read filters on
   * equality with the resolved context). Recipients and timeline entries are
   * owned transitively through their batch — there is no standalone
   * unscoped recipient or timeline reader.
   */
  organizationId: string;
  /**
   * Wave 7B — the actor that created the batch, for money-out dual control.
   * The creator may not approve their own batch. `null` for seeded/demo rows
   * that predate actor tracking (any authorized approver may release those).
   */
  createdBy: string | null;
  id: string;
  name: string;
  source: "CSV upload" | "Manual" | "API";
  currency: string;
  createdAt: string;
  scheduledFor: string | null;
  completedAt: string | null;
  status: PayoutStatus;
  recipients: Recipient[];
  timeline: PayoutEvent[];
  note?: string;
};

export type BatchSummary = Omit<PayoutBatch, "recipients" | "timeline"> & {
  recipientCount: number;
  paidCount: number;
  failedCount: number;
  totalAmount: number;
  paidAmount: number;
  failedAmount: number;
};

export type BatchFilters = {
  q?: string;
  status?: PayoutStatus | "ALL";
  range?: "30d" | "90d" | "12m" | "all";
  sort?: "recent" | "amount" | "recipients";
  direction?: "asc" | "desc";
  page?: number;
  pageSize?: number;
};

export type PaginatedBatches = {
  rows: BatchSummary[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
  isFiltered: boolean;
};

export type BankAccount = {
  id: string;
  bank: string;
  holder: string;
  accountNumber: string;
  masked: string;
  verified: boolean;
  isDefault: boolean;
};

export type PayoutSettings = {
  automated: boolean;
  cadence: PayoutCadence;
  weekday: Weekday;
  monthDay: number;
  minimumAmount: number;
  currency: string;
  notifyInitiated: boolean;
  notifyCompleted: boolean;
  notifyFailed: boolean;
  destinationAccountId: string;
  updatedAt: string | null;
};

/**
 * Wave 7B (P-6 decision) — bank accounts and payout settings are partitioned
 * per organization alongside batches. Account numbers and destination settings
 * are tenant-sensitive (they direct money), so a shared/global partition would
 * be a cross-tenant read by construction. There is no global payout setting.
 */
export type TenantPayoutState = {
  batches: PayoutBatch[];
  accounts: BankAccount[];
  settings: PayoutSettings;
};

type Store = {
  tenants: Map<string, TenantPayoutState>;
  sequence: number;
};

function defaultTenantState(
  batches: PayoutBatch[],
  accounts: BankAccount[],
  settings: PayoutSettings,
): TenantPayoutState {
  return { batches, accounts, settings };
}

const CURRENCY = "IDR";

// --- seeds ------------------------------------------------------------------

function recipient(
  id: string,
  name: string,
  bank: string,
  accountNumber: string,
  amount: number,
  status: RecipientStatus,
  extra: Partial<Recipient> = {}
): Recipient {
  return {
    id,
    name,
    bank,
    accountNumber,
    amount,
    reference: extra.reference ?? "",
    status,
    failureReason: extra.failureReason ?? null,
    paidAt: extra.paidAt ?? null,
  };
}

function defaultStore(): Store {
  const batches: Array<Omit<PayoutBatch, "organizationId" | "createdBy">> = [
    {
      id: "BATCH-2026-08-014",
      name: "Vendor settlement — week 35",
      source: "CSV upload",
      currency: CURRENCY,
      createdAt: "2026-08-28T03:20:00.000Z",
      scheduledFor: "2026-09-02T02:00:00.000Z",
      completedAt: null,
      status: "SCHEDULED",
      note: "Awaiting finance approval before release.",
      recipients: [
        recipient("R-14-1", "Budi Santoso", "BCA", "1234567890", 25_000_000, "PENDING", { reference: "INV-1001" }),
        recipient("R-14-2", "Siti Rahayu", "Mandiri", "9876543210", 17_500_000, "PENDING", { reference: "INV-1002" }),
        recipient("R-14-3", "Agus Wijaya", "BNI", "5544332211", 8_250_890, "PENDING", { reference: "INV-1003" }),
      ],
      timeline: [
        {
          id: "E-14-1",
          at: "2026-08-28T03:20:00.000Z",
          label: "Batch created",
          detail: "3 recipients imported from vendors-w35.csv",
          kind: "info",
        },
        {
          id: "E-14-2",
          at: "2026-08-28T03:21:00.000Z",
          label: "Scheduled",
          detail: "Release set for 2 Sep 2026",
          kind: "info",
        },
      ],
    },
    {
      id: "BATCH-2026-08-013",
      name: "Merchant payouts — 26 Aug",
      source: "API",
      currency: CURRENCY,
      createdAt: "2026-08-26T01:10:00.000Z",
      scheduledFor: "2026-08-26T02:00:00.000Z",
      completedAt: null,
      status: "PROCESSING",
      recipients: [
        recipient("R-13-1", "Warung Kopi Nusantara", "BCA", "3344556677", 4_200_000, "PAID", {
          paidAt: "2026-08-26T02:04:00.000Z",
        }),
        recipient("R-13-2", "Toko Buku Aksara", "BRI", "7788990011", 2_150_000, "PENDING"),
        recipient("R-13-3", "Studio Rekam Jaya", "Mandiri", "2233445566", 6_890_000, "PENDING"),
      ],
      timeline: [
        {
          id: "E-13-1",
          at: "2026-08-26T01:10:00.000Z",
          label: "Batch created",
          detail: "Created via API by integration key sk_live_••••4a2b",
          kind: "info",
        },
        {
          id: "E-13-2",
          at: "2026-08-26T02:00:00.000Z",
          label: "Disbursement started",
          detail: "3 transfers submitted to the banking partner",
          kind: "info",
        },
      ],
    },
    {
      id: "BATCH-2026-08-012",
      name: "Affiliate commissions — August",
      source: "CSV upload",
      currency: CURRENCY,
      createdAt: "2026-08-15T04:00:00.000Z",
      scheduledFor: "2026-08-15T05:00:00.000Z",
      completedAt: "2026-08-15T05:40:00.000Z",
      status: "PARTIAL",
      recipients: [
        recipient("R-12-1", "Dewi Lestari", "BCA", "1010101010", 3_500_000, "PAID", {
          paidAt: "2026-08-15T05:12:00.000Z",
        }),
        recipient("R-12-2", "Rizky Pratama", "Jenius", "2020202020", 1_250_000, "FAILED", {
          failureReason: "Account name mismatch",
        }),
        recipient("R-12-3", "Nadia Putri", "BNI", "3030303030", 2_000_000, "PAID", {
          paidAt: "2026-08-15T05:14:00.000Z",
        }),
        recipient("R-12-4", "Fajar Nugroho", "BRI", "4040404040", 750_000, "RETURNED", {
          failureReason: "Beneficiary account closed",
        }),
      ],
      timeline: [
        {
          id: "E-12-1",
          at: "2026-08-15T04:00:00.000Z",
          label: "Batch created",
          detail: "4 recipients imported from affiliates-aug.csv",
          kind: "info",
        },
        {
          id: "E-12-2",
          at: "2026-08-15T05:40:00.000Z",
          label: "Completed with failures",
          detail: "2 paid, 1 failed, 1 returned",
          kind: "warning",
        },
      ],
    },
    {
      id: "BATCH-2026-08-011",
      name: "Payroll top-up — August",
      source: "Manual",
      currency: CURRENCY,
      createdAt: "2026-08-05T02:00:00.000Z",
      scheduledFor: "2026-08-05T03:00:00.000Z",
      completedAt: "2026-08-05T03:25:00.000Z",
      status: "PAID",
      recipients: [
        recipient("R-11-1", "Tim Operasional", "BCA", "5050505050", 42_000_000, "PAID", {
          paidAt: "2026-08-05T03:20:00.000Z",
        }),
        recipient("R-11-2", "Tim Dukungan", "BCA", "6060606060", 28_500_000, "PAID", {
          paidAt: "2026-08-05T03:22:00.000Z",
        }),
      ],
      timeline: [
        {
          id: "E-11-1",
          at: "2026-08-05T02:00:00.000Z",
          label: "Batch created",
          detail: "2 recipients entered manually",
          kind: "info",
        },
        {
          id: "E-11-2",
          at: "2026-08-05T03:25:00.000Z",
          label: "Completed",
          detail: "All transfers settled",
          kind: "success",
        },
      ],
    },
    {
      id: "BATCH-2026-07-009",
      name: "Refund reimbursements — July",
      source: "CSV upload",
      currency: CURRENCY,
      createdAt: "2026-07-22T06:00:00.000Z",
      scheduledFor: "2026-07-22T07:00:00.000Z",
      completedAt: "2026-07-22T07:30:00.000Z",
      status: "PAID",
      recipients: [
        recipient("R-09-1", "Hendra Kusuma", "Mandiri", "7070707070", 1_900_000, "PAID", {
          paidAt: "2026-07-22T07:12:00.000Z",
        }),
        recipient("R-09-2", "Maya Sari", "BCA", "8080808080", 2_400_000, "PAID", {
          paidAt: "2026-07-22T07:15:00.000Z",
        }),
        recipient("R-09-3", "Yoga Saputra", "BNI", "9090909090", 1_100_000, "PAID", {
          paidAt: "2026-07-22T07:18:00.000Z",
        }),
      ],
      timeline: [
        {
          id: "E-09-1",
          at: "2026-07-22T06:00:00.000Z",
          label: "Batch created",
          detail: "3 recipients imported from refunds-jul.csv",
          kind: "info",
        },
        {
          id: "E-09-2",
          at: "2026-07-22T07:30:00.000Z",
          label: "Completed",
          detail: "All transfers settled",
          kind: "success",
        },
      ],
    },
  ];

  const accounts: BankAccount[] = [
    {
      id: "acct_bca_1234",
      bank: "Bank Central Asia",
      holder: "Acme Corporation LLC",
      accountNumber: "1234567890001234",
      masked: "**** 1234",
      verified: true,
      isDefault: true,
    },
    {
      id: "acct_mandiri_8891",
      bank: "Bank Mandiri",
      holder: "Acme Corporation LLC",
      accountNumber: "8899001122338891",
      masked: "**** 8891",
      verified: true,
      isDefault: false,
    },
    {
      id: "acct_bni_4420",
      bank: "Bank Negara Indonesia",
      holder: "Acme Corporation LLC",
      accountNumber: "1122334455664420",
      masked: "**** 4420",
      verified: false,
      isDefault: false,
    },
  ];

  return {
    tenants: new Map([
      [
        DEFAULT_DEMO_ORG,
        defaultTenantState(
          batches.map((b) => ({ organizationId: DEFAULT_DEMO_ORG, createdBy: null, ...b })),
          accounts,
          {
            automated: true,
            cadence: "weekly",
            weekday: "Friday",
            monthDay: 1,
            minimumAmount: 50_000,
            currency: CURRENCY,
            notifyInitiated: true,
            notifyCompleted: true,
            notifyFailed: true,
            destinationAccountId: "acct_bca_1234",
            updatedAt: null,
          },
        ),
      ],
    ]),
    sequence: 15,
  };
}

const globalStore = globalThis as unknown as { __kineticPayoutStore?: Store };
function store(): Store {
  if (!globalStore.__kineticPayoutStore) globalStore.__kineticPayoutStore = defaultStore();
  return globalStore.__kineticPayoutStore;
}

// --- Wave 7B: tenancy seam ---------------------------------------------------
//
// Mirrors `server/data/transactions.ts` (Wave 7A): the tenant predicate lives
// at the data boundary. Every read filters on the resolved context BEFORE any
// search/filter/sort/pagination; foreign reads answer `null`; foreign writes
// throw `TenantIsolationError` (audited) so the wire can answer not-found
// without the log going silent.

function scopeOf(ctx: OrganizationContext): OrganizationContext {
  return parseOrganizationContext(ctx);
}

function freshTenantState(): TenantPayoutState {
  return {
    batches: [],
    accounts: [],
    settings: {
      automated: false,
      cadence: "manual",
      weekday: "Friday",
      monthDay: 1,
      minimumAmount: 0,
      currency: CURRENCY,
      notifyInitiated: true,
      notifyCompleted: true,
      notifyFailed: true,
      destinationAccountId: "",
      updatedAt: null,
    },
  };
}

/** Read-only view of one tenant's partition; never persists. */
function readPartition(organizationId: string): TenantPayoutState {
  return store().tenants.get(organizationId) ?? freshTenantState();
}

/** Writable view of one tenant's partition; persists the partition. */
function writePartition(organizationId: string): TenantPayoutState {
  const s = store();
  let partition = s.tenants.get(organizationId);
  if (!partition) {
    partition = freshTenantState();
    s.tenants.set(organizationId, partition);
  }
  return partition;
}

/**
 * How many tenants hold batches. The quarantine (`payouts-unscoped.ts`) fails
 * closed on `> 1`, so "the demo store is single-tenant" is a checked fact.
 */
export function countPayoutTenants(): number {
  return [...store().tenants.entries()].filter(([, t]) => t.batches.length > 0).length;
}

/**
 * The identity of the only batch-holding tenant, or `null` when there is not
 * exactly one. Tenancy *probe*: answers a question about the store, never a
 * row — the quarantine's gate.
 */
export function solePayoutOrganizationId(): string | null {
  const ids = [...store().tenants.entries()]
    .filter(([, t]) => t.batches.length > 0)
    .map(([id]) => id);
  return ids.length === 1 ? (ids[0] ?? null) : null;
}

/** One tenant's batches, defensively copied, ownership re-checked per row. */
function scopedBatches(ctx: OrganizationContext): PayoutBatch[] {
  const { organizationId } = scopeOf(ctx);
  return (readPartition(organizationId).batches ?? [])
    .filter((b) => b.organizationId === organizationId)
    .map((b) => copyBatch(b));
}

function copyBatch(batch: PayoutBatch): PayoutBatch {
  return {
    ...batch,
    status: deriveStatus(batch),
    recipients: batch.recipients.map((r) => ({ ...r })),
    timeline: batch.timeline.map((e) => ({ ...e })),
  };
}

function batchKeyMatches(batch: PayoutBatch, id: string): boolean {
  const needle = typeof id === "string" ? id.trim() : "";
  if (!needle) return false;
  return batch.id.toLowerCase() === needle.toLowerCase();
}

/**
 * The caller's own batch for an id. A foreign id and an unknown id both answer
 * `null` — that indistinguishability is the anti-enumeration property, so it
 * is implemented here, once, rather than at each call site. Timeline and
 * recipients inherit this scope: they are only reachable through the batch.
 */
function findOwnedBatch(ctx: OrganizationContext, id: string): PayoutBatch | null {
  const { organizationId } = scopeOf(ctx);
  return (
    (readPartition(organizationId).batches ?? []).find(
      (b) => b.organizationId === organizationId && batchKeyMatches(b, id),
    ) ?? null
  );
}

/** Cross-partition probe. Answers yes/no for the audit record only — the
 *  foreign batch itself is never returned to a scoped caller. */
function batchOwnedByAnotherTenant(organizationId: string, id: string): string | null {
  for (const [tenant, state] of store().tenants) {
    if (tenant === organizationId) continue;
    if ((state.batches ?? []).some((b) => batchKeyMatches(b, id))) return tenant;
  }
  return null;
}

/**
 * Resolve the batch a **write** will mutate (live reference, not a copy).
 *
 *   own batch  → returned
 *   unknown id → `null` (the caller's existing NOT_FOUND path)
 *   foreign id → throws `TenantIsolationError` after recording the denial
 */
function writableBatch(
  ctx: OrganizationContext,
  id: string,
  surface: string,
  actorId?: string | null,
): PayoutBatch | null {
  const own = findOwnedBatch(ctx, id);
  if (own) return own;
  const { organizationId } = scopeOf(ctx);
  const foreignOwner = batchOwnedByAnotherTenant(organizationId, id);
  if (foreignOwner) {
    recordTenantDenial({
      surface,
      actorOrganizationId: organizationId,
      requestedOrganizationId: foreignOwner,
      actorId: actorId ?? null,
      resourceId: typeof id === "string" ? id : null,
    });
    throw new TenantIsolationError(
      "CROSS_TENANT_WRITE",
      { surface, actorOrg: organizationId, requestedOrg: foreignOwner },
      `Refusing a cross-tenant write on ${surface}: the batch belongs to another organization.`,
    );
  }
  return null;
}

// --- derivation --------------------------------------------------------------

/** Batch status is derived from its recipients unless the batch is still editable. */
export function deriveStatus(batch: PayoutBatch): PayoutStatus {
  if (batch.status === "DRAFT" || batch.status === "SCHEDULED") return batch.status;
  const rows = batch.recipients;
  if (rows.length === 0) return batch.status;
  const paid = rows.filter((r) => r.status === "PAID").length;
  const failed = rows.filter((r) => r.status === "FAILED").length;
  const returned = rows.filter((r) => r.status === "RETURNED").length;
  const pending = rows.filter((r) => r.status === "PENDING").length;
  if (pending > 0) return "PROCESSING";
  if (paid === rows.length) return "PAID";
  if (paid === 0 && returned > 0 && failed === 0) return "RETURNED";
  if (paid === 0) return "FAILED";
  return "PARTIAL";
}

export function summarise(batch: PayoutBatch): BatchSummary {
  const status = deriveStatus(batch);
  const paidRows = batch.recipients.filter((r) => r.status === "PAID");
  const failedRows = batch.recipients.filter((r) => r.status === "FAILED" || r.status === "RETURNED");
  return {
    organizationId: batch.organizationId,
    createdBy: batch.createdBy,
    id: batch.id,
    name: batch.name,
    source: batch.source,
    currency: batch.currency,
    createdAt: batch.createdAt,
    scheduledFor: batch.scheduledFor,
    completedAt: batch.completedAt,
    status,
    note: batch.note,
    recipientCount: batch.recipients.length,
    paidCount: paidRows.length,
    failedCount: failedRows.length,
    totalAmount: batch.recipients.reduce((s, r) => s + r.amount, 0),
    paidAmount: paidRows.reduce((s, r) => s + r.amount, 0),
    failedAmount: failedRows.reduce((s, r) => s + r.amount, 0),
  };
}

// --- reads -------------------------------------------------------------------

const RANGE_DAYS: Record<NonNullable<BatchFilters["range"]>, number | null> = {
  "30d": 30,
  "90d": 90,
  "12m": 365,
  all: null,
};

export async function listBatches(
  ctx: OrganizationContext,
  filters: BatchFilters = {},
): Promise<PaginatedBatches> {
  const { organizationId } = scopeOf(ctx);
  const {
    q = "",
    status = "ALL",
    range = "all",
    sort = "recent",
    direction = "desc",
    page = 1,
    pageSize = 10,
  } = filters;
  const dir = direction === "asc" ? 1 : -1;

  // The tenant predicate first: everything below narrows the caller's own
  // partition, so a filter can never widen the view to another tenant.
  let rows = (readPartition(organizationId).batches ?? [])
    .filter((b) => b.organizationId === organizationId)
    .map(summarise);
  const term = q.trim().toLowerCase();

  if (term) {
    rows = rows.filter(
      (b) => b.name.toLowerCase().includes(term) || b.id.toLowerCase().includes(term)
    );
  }
  if (status !== "ALL") rows = rows.filter((b) => b.status === status);

  const days = RANGE_DAYS[range];
  if (days !== null) {
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    rows = rows.filter((b) => new Date(b.createdAt).getTime() >= cutoff);
  }

  rows.sort((a, b) => {
    if (sort === "amount") return dir * (a.totalAmount - b.totalAmount);
    if (sort === "recipients") return dir * (a.recipientCount - b.recipientCount);
    return dir * a.createdAt.localeCompare(b.createdAt);
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
    isFiltered: Boolean(term) || status !== "ALL" || range !== "all",
  };
}

export async function getBatch(ctx: OrganizationContext, id: string): Promise<PayoutBatch | null> {
  const batch = findOwnedBatch(ctx, id);
  if (!batch) return null;
  return copyBatch(batch);
}

/**
 * Scoped view of one tenant's batches (recipients included) for callers that
 * have resolved a tenant. Unscoped derived readers use `payouts-unscoped.ts`
 * until Wave 7C — they may not call this without a context. Copies only; do
 * not mutate.
 */
export function getPayoutBatches(ctx: OrganizationContext): PayoutBatch[] {
  return scopedBatches(ctx);
}

export type PayoutsOverview = {
  pendingAmount: number;
  pendingBatches: number;
  pendingRecipients: number;
  completedAmount30d: number;
  completedRecipients30d: number;
  failedAmount: number;
  failedRecipients: number;
  nextScheduledAt: string | null;
  currency: string;
};

export async function getPayoutsOverview(ctx: OrganizationContext): Promise<PayoutsOverview> {
  const { organizationId } = scopeOf(ctx);
  const partition = readPartition(organizationId);
  const own = (partition.batches ?? []).filter((b) => b.organizationId === organizationId);
  const summaries = own.map(summarise);
  const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;

  const inFlight = summaries.filter((b) => b.status === "SCHEDULED" || b.status === "PROCESSING" || b.status === "DRAFT");
  const pendingRecipients = own
    .flatMap((b) => b.recipients)
    .filter((r) => r.status === "PENDING");

  const completed = summaries.filter(
    (b) => b.completedAt && new Date(b.completedAt).getTime() >= cutoff
  );

  const failedRows = own
    .flatMap((b) => b.recipients)
    .filter((r) => r.status === "FAILED" || r.status === "RETURNED");

  const upcoming = summaries
    .filter((b) => b.scheduledFor && (b.status === "SCHEDULED" || b.status === "DRAFT"))
    .map((b) => b.scheduledFor!)
    .sort();

  return {
    pendingAmount: pendingRecipients.reduce((s, r) => s + r.amount, 0),
    pendingBatches: inFlight.length,
    pendingRecipients: pendingRecipients.length,
    completedAmount30d: completed.reduce((s, b) => s + b.paidAmount, 0),
    completedRecipients30d: completed.reduce((s, b) => s + b.paidCount, 0),
    failedAmount: failedRows.reduce((s, r) => s + r.amount, 0),
    failedRecipients: failedRows.length,
    nextScheduledAt: upcoming[0] ?? null,
    currency: CURRENCY,
  };
}

// --- writes ------------------------------------------------------------------

function nextBatchId() {
  const s = store();
  const now = new Date();
  const id = `BATCH-${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-${String(
    s.sequence
  ).padStart(3, "0")}`;
  s.sequence += 1;
  return id;
}

export type CreateBatchInput = {
  name: string;
  source?: PayoutBatch["source"];
  scheduledFor?: string | null;
  note?: string;
  recipients: RecipientDraft[];
};

export async function createBatch(
  ctx: OrganizationContext,
  input: CreateBatchInput,
  opts: { createdBy?: string | null } = {},
): Promise<PayoutBatch> {
  const { organizationId } = scopeOf(ctx);
  const id = nextBatchId();
  const now = new Date().toISOString();
  // The owner comes from the resolved context only. Any `organizationId`
  // smuggled inside `input` is ignored — a caller cannot mint a batch for
  // another tenant by shaping its payload.
  const batch: PayoutBatch = {
    organizationId,
    createdBy: opts.createdBy ?? null,
    id,
    name: input.name.trim(),
    source: input.source ?? "Manual",
    currency: CURRENCY,
    createdAt: now,
    scheduledFor: input.scheduledFor ?? null,
    completedAt: null,
    status: input.scheduledFor ? "SCHEDULED" : "DRAFT",
    note: input.note,
    recipients: input.recipients.map((r, index) => ({
      id: `${id}-R${index + 1}`,
      name: r.name,
      bank: r.bank,
      accountNumber: r.accountNumber,
      amount: r.amount,
      reference: r.reference,
      status: "PENDING",
      failureReason: null,
      paidAt: null,
    })),
    timeline: [
      {
        id: `${id}-E1`,
        at: now,
        label: "Batch created",
        detail: `${input.recipients.length} recipient${input.recipients.length === 1 ? "" : "s"} · ${
          input.source ?? "Manual"
        }`,
        kind: "info",
      },
    ],
  };
  writePartition(organizationId).batches.unshift(batch);
  // Wave 7A convention: creates return the stored row (reads return copies) —
  // a caller that captures the row for a follow-up write must see mutations.
  return batch;
}

/**
 * Approve = release the money. Deterministic settlement so tests and demos are
 * reproducible: rows whose account number ends in "0000" are rejected by the
 * partner, everything else settles.
 */
export async function approveBatch(
  ctx: OrganizationContext,
  id: string,
  opts: { actorId?: string | null } = {},
): Promise<{ batch: PayoutBatch; paid: number; failed: number } | null> {
  const batch = writableBatch(ctx, id, "payouts.approve", opts.actorId);
  if (!batch) return null;
  // Money-out dual control, checked AFTER the tenant check so a cross-tenant
  // probe learns nothing about the batch's workflow state: the creator may not
  // approve their own batch. Seeded rows predate actor tracking
  // (`createdBy: null`) and stay releasable by any authorized approver.
  if (batch.createdBy && opts.actorId && batch.createdBy === opts.actorId) {
    throw new Error("The batch creator cannot approve their own batch — a different user must release this payout.");
  }
  if (!isApprovable(deriveStatus(batch))) {
    throw new Error(`${batch.id} is already ${deriveStatus(batch).toLowerCase()} — it cannot be sent again`);
  }
  if (batch.recipients.length === 0) throw new Error("Add at least one recipient before sending this batch");

  const now = new Date().toISOString();

  // Rekomendasi #5: when a TEST provider connection resolves, release each
  // recipient through the payment-flow orchestration (idempotency + authz +
  // audit). A configured-but-failing provider marks that recipient failed (never
  // a mock success); with no connection the in-memory dev/demo store is used.
  let providerConnected = false;
  try {
    const { resolveProviderWrite } = await import("@/server/payment-flows/execute-provider-write");
    const probe = await resolveProviderWrite();
    providerConnected = probe.connected;
  } catch {
    // Non-server / no SDK — fall back to the in-memory dev store.
    providerConnected = false;
  }

  if (providerConnected) {
    let paid = 0;
    let failed = 0;
    for (const row of batch.recipients) {
      if (row.status !== "PENDING") continue;
      try {
        const { tryProviderPayout } = await import("@/server/payment-flows/execute-provider-write");
        const r = await tryProviderPayout({
          recipientId: row.id,
          channelCode: row.bank,
          accountNumber: row.accountNumber,
          accountHolderName: row.name,
          amountMinor: String(row.amount),
          currency: "IDR",
        });
        if (r.connected) {
          row.status = "PAID";
          row.paidAt = now;
          row.failureReason = null;
          paid += 1;
        } else {
          row.status = "FAILED";
          row.failureReason = "No provider connection for release";
          failed += 1;
        }
      } catch (err) {
        row.status = "FAILED";
        row.failureReason = err instanceof Error ? err.message : "Provider failed";
        failed += 1;
      }
    }
    batch.status = "PROCESSING";
    batch.completedAt = now;
    batch.status = deriveStatus(batch);
    batch.timeline.push({
      id: `${batch.id}-E${batch.timeline.length + 1}`,
      at: now,
      label: failed ? "Completed with failures" : "Completed",
      detail: `${paid} paid, ${failed} failed`,
      kind: failed ? "warning" : "success",
    });
    return { batch, paid, failed };
  }

  let paid = 0;
  let failed = 0;
  for (const row of batch.recipients) {
    if (row.status !== "PENDING") continue;
    if (row.accountNumber.endsWith("0000")) {
      row.status = "FAILED";
      row.failureReason = "Rejected by the banking partner";
      failed += 1;
    } else {
      row.status = "PAID";
      row.paidAt = now;
      row.failureReason = null;
      paid += 1;
    }
  }

  batch.status = "PROCESSING";
  batch.completedAt = now;
  batch.status = deriveStatus(batch);
  batch.timeline.push({
    id: `${batch.id}-E${batch.timeline.length + 1}`,
    at: now,
    label: failed ? "Completed with failures" : "Completed",
    detail: `${paid} paid, ${failed} failed`,
    kind: failed ? "warning" : "success",
  });

  return { batch, paid, failed };
}

export async function cancelBatch(
  ctx: OrganizationContext,
  id: string,
  opts: { actorId?: string | null } = {},
): Promise<PayoutBatch | null> {
  const batch = writableBatch(ctx, id, "payouts.cancel", opts.actorId);
  if (!batch) return null;
  if (!isCancellable(deriveStatus(batch))) {
    throw new Error(`${batch.id} has already started — it can no longer be cancelled`);
  }
  const now = new Date().toISOString();
  for (const row of batch.recipients) {
    row.status = "RETURNED";
    row.failureReason = "Batch cancelled before release";
  }
  batch.status = "RETURNED";
  batch.completedAt = now;
  batch.timeline.push({
    id: `${batch.id}-E${batch.timeline.length + 1}`,
    at: now,
    label: "Batch cancelled",
    detail: "No funds were released",
    kind: "warning",
  });
  return batch;
}

/** Retry every failed/returned row in a batch. */
export async function retryBatchFailures(
  ctx: OrganizationContext,
  id: string,
  opts: { actorId?: string | null } = {},
): Promise<{ batch: PayoutBatch; retried: number; paid: number; failed: number } | null> {
  const batch = writableBatch(ctx, id, "payouts.retry", opts.actorId);
  if (!batch) return null;
  const targets = batch.recipients.filter((r) => r.status === "FAILED" || r.status === "RETURNED");
  if (targets.length === 0) throw new Error("There is nothing to retry in this batch");

  const now = new Date().toISOString();
  let paid = 0;
  let failed = 0;
  for (const row of targets) {
    if (row.accountNumber.endsWith("0000")) {
      row.status = "FAILED";
      row.failureReason = "Rejected by the banking partner";
      failed += 1;
    } else {
      row.status = "PAID";
      row.paidAt = now;
      row.failureReason = null;
      paid += 1;
    }
  }
  batch.status = deriveStatus(batch);
  batch.timeline.push({
    id: `${batch.id}-E${batch.timeline.length + 1}`,
    at: now,
    label: "Failures retried",
    detail: `${targets.length} retried · ${paid} paid, ${failed} failed`,
    kind: failed ? "warning" : "success",
  });
  return { batch, retried: targets.length, paid, failed };
}

export async function retryRecipient(
  ctx: OrganizationContext,
  batchId: string,
  recipientId: string,
  opts: { actorId?: string | null } = {},
): Promise<Recipient | null> {
  const batch = writableBatch(ctx, batchId, "payouts.retry-recipient", opts.actorId);
  if (!batch) return null;
  const row = batch.recipients.find((r) => r.id === recipientId);
  if (!row) return null;
  if (row.status === "PAID") throw new Error(`${row.name} was already paid`);

  const now = new Date().toISOString();
  if (row.accountNumber.endsWith("0000")) {
    row.status = "FAILED";
    row.failureReason = "Rejected by the banking partner";
  } else {
    row.status = "PAID";
    row.paidAt = now;
    row.failureReason = null;
  }
  batch.status = deriveStatus(batch);
  batch.timeline.push({
    id: `${batch.id}-E${batch.timeline.length + 1}`,
    at: now,
    label: "Recipient retried",
    detail: `${row.name} → ${row.status.toLowerCase()}`,
    kind: row.status === "PAID" ? "success" : "error",
  });
  return { ...row };
}

// --- settings & bank accounts -------------------------------------------------

export async function getPayoutSettings(ctx: OrganizationContext): Promise<PayoutSettings> {
  const { organizationId } = scopeOf(ctx);
  return { ...readPartition(organizationId).settings };
}

export async function updatePayoutSettings(
  ctx: OrganizationContext,
  input: Partial<Omit<PayoutSettings, "updatedAt" | "currency">>
): Promise<PayoutSettings> {
  const { organizationId } = scopeOf(ctx);
  const s = writePartition(organizationId);
  if (input.destinationAccountId) {
    const account = s.accounts.find((a) => a.id === input.destinationAccountId);
    if (!account) throw new Error("That destination account does not exist");
    if (!account.verified) throw new Error(`${account.bank} ${account.masked} is not verified yet`);
  }
  if (input.minimumAmount !== undefined && input.minimumAmount < 0) {
    throw new Error("Minimum payout cannot be negative");
  }
  s.settings = {
    ...s.settings,
    ...Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined)),
    updatedAt: new Date().toISOString(),
  } as PayoutSettings;
  return { ...s.settings };
}

export async function listBankAccounts(ctx: OrganizationContext): Promise<BankAccount[]> {
  const { organizationId } = scopeOf(ctx);
  return readPartition(organizationId).accounts.map((a) => ({ ...a }));
}

export async function getDestinationAccount(ctx: OrganizationContext): Promise<BankAccount | null> {
  const { organizationId } = scopeOf(ctx);
  const s = readPartition(organizationId);
  return s.accounts.find((a) => a.id === s.settings.destinationAccountId) ?? null;
}

export async function addBankAccount(
  ctx: OrganizationContext,
  input: {
    bank: string;
    holder: string;
    accountNumber: string;
  }
): Promise<BankAccount> {
  const { organizationId } = scopeOf(ctx);
  const s = writePartition(organizationId);
  const digits = input.accountNumber.replace(/[\s-]/g, "");
  if (s.accounts.some((a) => a.accountNumber === digits)) {
    throw new Error("That account is already on file");
  }
  const account: BankAccount = {
    id: `acct_${Date.now().toString(36)}`,
    bank: input.bank.trim(),
    holder: input.holder.trim(),
    accountNumber: digits,
    masked: `**** ${digits.slice(-4)}`,
    verified: false,
    isDefault: false,
  };
  s.accounts.push(account);
  return { ...account };
}

// --- CSV ----------------------------------------------------------------------

function csvCell(value: string | number | null) {
  const text = value === null ? "" : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function batchesToCsv(rows: BatchSummary[]) {
  const header = [
    "batch_id",
    "name",
    "status",
    "source",
    "recipients",
    "paid",
    "failed",
    "total_amount",
    "paid_amount",
    "currency",
    "created_at",
    "scheduled_for",
    "completed_at",
  ];
  const body = rows.map((b) =>
    [
      b.id,
      b.name,
      b.status,
      b.source,
      b.recipientCount,
      b.paidCount,
      b.failedCount,
      b.totalAmount,
      b.paidAmount,
      b.currency,
      b.createdAt,
      b.scheduledFor ?? "",
      b.completedAt ?? "",
    ]
      .map(csvCell)
      .join(",")
  );
  return [header.join(","), ...body].join("\n");
}

export function recipientsToCsv(batch: PayoutBatch) {
  const header = ["batch_id", "recipient_id", "name", "bank", "account_number", "amount", "reference", "status", "failure_reason", "paid_at"];
  const body = batch.recipients.map((r) =>
    [batch.id, r.id, r.name, r.bank, r.accountNumber, r.amount, r.reference, r.status, r.failureReason ?? "", r.paidAt ?? ""]
      .map(csvCell)
      .join(",")
  );
  return [header.join(","), ...body].join("\n");
}
