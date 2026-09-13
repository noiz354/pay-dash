import "server-only";

import { type Transaction } from "./transactions";
import { countLedgerTenants, listTransactions, soleLedgerOrganizationId } from "./transactions";
import { DEFAULT_DEMO_ORG } from "@/domain/payments/runtime-defaults";
import { parseOrganizationContext, type OrganizationContext } from "@/domain/tenancy/organization-context";
import { TenantIsolationError } from "@/domain/security/tenant";
import { recordTenantDenial } from "@/server/services/tenant-denial";
// Status vocabulary lives in a client-safe module; re-exported here so server
// code keeps a single import site for everything customer-shaped.
import { CUSTOMER_STATUSES, type CustomerStatus } from "@/lib/customer-status";

export { CUSTOMER_STATUSES };
export type { CustomerStatus };

// ---------------------------------------------------------------------------
// Customer directory (Wave 7C — tenant-scoped).
// Derived from the same ledger store as transactions, so a customer's lifetime
// value and their payment list can never disagree. The derivation composes on
// the Wave 7A slice: scoped ledger in, scoped directory out. Manually-created
// customers live alongside the derived ones behind the same seam, partitioned
// per tenant (swap for Prisma in one place, exactly like `transactions.ts`).
// ---------------------------------------------------------------------------

export type Customer = {
  id: string;
  /** Owner tenant. Same email in two tenants ⇒ two rows (composite key). */
  organizationId: string;
  name: string;
  email: string;
  referenceId: string;
  status: CustomerStatus;
  createdAt: string;
  lastSeenAt: string | null;
  lifetimeValue: number;
  currency: string;
  paymentCount: number;
  succeededCount: number;
  failedCount: number;
  successRate: number;
  methods: string[];
  channels: string[];
  notes?: string;
  initials: string;
  source: "ledger" | "manual";
};

export type CustomerFilters = {
  q?: string;
  status?: CustomerStatus | "ALL";
  /**
   * `recent` sorts by last activity, `added` by record creation — they differ
   * for a long-dormant customer, so both are offered in the URL state.
   */
  sort?: "recent" | "ltv" | "name" | "added";
  direction?: "asc" | "desc";
  page?: number;
  pageSize?: number;
};

export type PaginatedCustomers = {
  rows: Customer[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
  isFiltered: boolean;
  /** ISO instant this page was read — the freshness anchor for CMP-008. */
  fetchedAt: string;
};

type ManualRecord = {
  id: string;
  organizationId: string;
  name: string;
  email: string;
  referenceId: string;
  status: CustomerStatus;
  createdAt: string;
  notes?: string;
  seededValue?: number;
  seededCurrency?: string;
};

type Overrides = Record<string, { name?: string; status?: CustomerStatus; notes?: string }>;
type TenantCustomerState = { manual: ManualRecord[]; overrides: Overrides };
type Store = { tenants: Map<string, TenantCustomerState> };

export function customerIdFromEmail(email: string) {
  // Stable, URL-safe id derived from the email so ledger rows and the directory
  // always resolve to the same customer page. Pure and tenant-free BY DESIGN:
  // the id shape is the same in every tenant; the (organizationId, id) pair is
  // the key (spec P-10, 7A txn_shared pattern).
  const normalised = email.trim().toLowerCase();
  let hash = 0;
  for (let i = 0; i < normalised.length; i++) {
    hash = (hash * 31 + normalised.charCodeAt(i)) >>> 0;
  }
  return `cus_${hash.toString(36).padStart(7, "0")}`;
}

// The original static prototype (Acme / Global Logistics / Stark) shipped three
// hard-coded rows whose LTV strings had lost their currency prefix (",520.00").
// Instead of deleting them they are seeded into the store as real records with
// real numbers, so the page keeps rendering exactly the customers it always did
// — now clickable, searchable and formatted through `formatMoney`. Seeds belong
// to the demo organization only: any other tenant starts empty.
const PROTOTYPE_SEED: Array<Omit<ManualRecord, "organizationId">> = [
  {
    id: customerIdFromEmail("contact@acmecorp.com"),
    name: "Acme Corporation",
    email: "contact@acmecorp.com",
    referenceId: "REF-10042",
    status: "ACTIVE",
    createdAt: "2023-10-24T09:00:00.000Z",
    seededValue: 45_520,
    seededCurrency: "USD",
    notes: "Imported from the launch prototype.",
  },
  {
    id: customerIdFromEmail("billing@globallogistics.com"),
    name: "Global Logistics Ltd.",
    email: "billing@globallogistics.com",
    referenceId: "REF-10056",
    status: "ACTIVE",
    createdAt: "2023-10-22T09:00:00.000Z",
    seededValue: 18_250.5,
    seededCurrency: "USD",
    notes: "Imported from the launch prototype.",
  },
  {
    id: customerIdFromEmail("tony@stark.com"),
    name: "Stark Industries",
    email: "tony@stark.com",
    referenceId: "REF-10088",
    status: "REVIEW",
    createdAt: "2023-10-15T09:00:00.000Z",
    seededValue: 92_900,
    seededCurrency: "USD",
    notes: "Imported from the launch prototype.",
  },
];

const globalStore = globalThis as unknown as { __kineticCustomerStore?: Store };
function store(): Store {
  if (!globalStore.__kineticCustomerStore) {
    // The demo organization is seeded eagerly so a first read already renders
    // the prototype world; every other tenant starts empty on first write.
    // (Seeds are manual records, so the demo tenant always counts in
    // countCustomerTenants — the single-tenant demo is tenant #1, not #0.)
    globalStore.__kineticCustomerStore = {
      tenants: new Map([
        [
          DEFAULT_DEMO_ORG,
          {
            manual: PROTOTYPE_SEED.map((m) => ({ ...m, organizationId: DEFAULT_DEMO_ORG })),
            overrides: {},
          },
        ],
      ]),
    };
  }
  return globalStore.__kineticCustomerStore;
}

// --- Wave 7C: tenancy seam ---------------------------------------------------
//
// Mirrors `server/data/transactions.ts` (7A) and `server/data/payouts.ts`
// (7B): the tenant predicate lives at the data boundary. Every read filters
// on the resolved context BEFORE any search/filter/sort/pagination; foreign
// reads answer `null`; foreign writes throw `TenantIsolationError` (audited)
// so the wire can answer not-found without the log going silent.

function scopeOf(ctx: OrganizationContext): OrganizationContext {
  return parseOrganizationContext(ctx);
}

function freshTenantState(): TenantCustomerState {
  return { manual: [], overrides: {} };
}

/** Read-only view of one tenant's partition; never persists. */
function readPartition(organizationId: string): TenantCustomerState {
  return store().tenants.get(organizationId) ?? freshTenantState();
}

/** Writable view of one tenant's partition; persists the partition. */
function writePartition(organizationId: string): TenantCustomerState {
  const s = store();
  let partition = s.tenants.get(organizationId);
  if (!partition) {
    // The demo organization keeps the prototype world; every other tenant
    // starts empty (an empty tenant gets `[]`, not the demo directory).
    const manual =
      organizationId === DEFAULT_DEMO_ORG
        ? PROTOTYPE_SEED.map((m) => ({ ...m, organizationId }))
        : [];
    partition = { manual, overrides: {} };
    s.tenants.set(organizationId, partition);
  }
  return partition;
}

/**
 * How many tenants hold customers. Manual records are counted directly; the
 * ledger side is folded in via the 7A probes, because a tenant whose buyers
 * exist only as ledger rows still owns a directory. The quarantine
 * (`customers-unscoped.ts`) fails closed on `> 1`.
 */
export function countCustomerTenants(): number {
  const ids = new Set<string>();
  for (const [id, t] of store().tenants.entries()) {
    if (t.manual.length > 0) ids.add(id);
  }
  if (countLedgerTenants() > 1) return 2;
  const sole = soleLedgerOrganizationId();
  if (sole) ids.add(sole);
  return ids.size;
}

/**
 * The identity of the only customer-holding tenant, or `null` when there is
 * not exactly one. Tenancy *probe*: answers a question about the store, never
 * a row — the quarantine's gate.
 */
export function soleCustomerOrganizationId(): string | null {
  if (countLedgerTenants() > 1) return null;
  const ids = new Set<string>();
  for (const [id, t] of store().tenants.entries()) {
    if (t.manual.length > 0) ids.add(id);
  }
  const sole = soleLedgerOrganizationId();
  if (sole) ids.add(sole);
  return ids.size === 1 ? ([...ids][0] ?? null) : null;
}

/** Every ledger row of one tenant (paged through the scoped 7A read). */
async function scopedLedgerRows(ctx: OrganizationContext): Promise<Transaction[]> {
  const rows: Transaction[] = [];
  let page = 1;
  for (;;) {
    const { rows: batch } = await listTransactions(ctx, { page, pageSize: 100 });
    rows.push(...batch);
    if (batch.length < 100) break;
    page += 1;
  }
  return rows;
}

function initialsOf(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() ?? "")
      .join("") || "?"
  );
}

function statusFor(succeeded: number, failed: number, total: number, lastSeen: string | null): CustomerStatus {
  if (total === 0) return "NEW";
  const failRate = total ? failed / total : 0;
  if (failRate > 0.5) return "REVIEW";
  if (!lastSeen) return "NEW";
  const ageDays = (Date.now() - new Date(lastSeen).getTime()) / 86_400_000;
  if (ageDays > 90) return "REVIEW";
  return succeeded > 0 ? "ACTIVE" : "REVIEW";
}

async function buildDirectory(ctx: OrganizationContext): Promise<Customer[]> {
  const { organizationId } = scopeOf(ctx);
  const rows = await scopedLedgerRows(ctx);
  const byEmail = new Map<string, Transaction[]>();
  for (const t of rows) {
    const key = t.customerEmail.toLowerCase();
    const list = byEmail.get(key);
    if (list) list.push(t);
    else byEmail.set(key, [t]);
  }

  const { manual, overrides } = readPartition(organizationId);

  const derived: Customer[] = Array.from(byEmail.entries()).map(([email, txns]) => {
    const sorted = [...txns].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    const succeeded = txns.filter((t) => t.status === "SUCCEEDED" || t.status === "REFUNDED").length;
    const failed = txns.filter((t) => t.status === "FAILED").length;
    const id = customerIdFromEmail(email);
    const override = overrides[id] ?? {};
    const name = override.name ?? first.customerName;
    return {
      id,
      organizationId,
      name,
      email,
      referenceId: `REF-${id.slice(4).toUpperCase()}`,
      status: override.status ?? statusFor(succeeded, failed, txns.length, last.createdAt),
      createdAt: first.createdAt,
      lastSeenAt: last.createdAt,
      lifetimeValue: txns
        .filter((t) => t.status === "SUCCEEDED" || t.status === "REFUNDED")
        .reduce((a, t) => a + t.amount - t.refundedAmount, 0),
      currency: first.currency,
      paymentCount: txns.length,
      succeededCount: succeeded,
      failedCount: failed,
      successRate: txns.length ? (succeeded / txns.length) * 100 : 0,
      methods: Array.from(new Set(txns.map((t) => t.methodLabel))),
      channels: Array.from(new Set(txns.map((t) => t.channel))),
      notes: override.notes,
      initials: initialsOf(name),
      source: "ledger",
    };
  });

  const manualCustomers: Customer[] = manual
    .filter((m) => !byEmail.has(m.email.toLowerCase()))
    .map((m) => {
      const override = overrides[m.id] ?? {};
      const name = override.name ?? m.name;
      return {
        id: m.id,
        organizationId,
        name,
        email: m.email,
        referenceId: m.referenceId,
        status: override.status ?? m.status,
        createdAt: m.createdAt,
        lastSeenAt: null,
        lifetimeValue: m.seededValue ?? 0,
        currency: m.seededCurrency ?? "IDR",
        paymentCount: 0,
        succeededCount: 0,
        failedCount: 0,
        successRate: 0,
        methods: [],
        channels: [],
        notes: override.notes ?? m.notes,
        initials: initialsOf(name),
        source: "manual",
      };
    });

  return [...manualCustomers, ...derived];
}

export async function listCustomers(ctx: OrganizationContext, filters: CustomerFilters = {}): Promise<PaginatedCustomers> {
  // The predicate ran inside buildDirectory (partition + scoped ledger);
  // filter/sort/page below only ever see the caller's rows.
  scopeOf(ctx);
  const { q = "", status = "ALL", sort = "recent", direction } = filters;
  // Each sort key has a natural reading order: names go A-Z, everything else is
  // newest/largest first. An explicit `direction` from the URL overrides it; when
  // omitted we keep the natural order so existing callers see no change.
  const dir = direction ? (direction === "asc" ? 1 : -1) : sort === "name" ? 1 : -1;
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(100, Math.max(5, filters.pageSize ?? 10));
  const needle = q.trim().toLowerCase();

  const all = await buildDirectory(ctx);
  const filtered = all.filter((c) => {
    if (status !== "ALL" && c.status !== status) return false;
    if (needle) {
      const hay = `${c.name} ${c.email} ${c.referenceId}`.toLowerCase();
      if (!hay.includes(needle)) return false;
    }
    return true;
  });

  filtered.sort((a, b) => {
    if (sort === "ltv") return dir * (a.lifetimeValue - b.lifetimeValue);
    // Name always sorts alphabetically; `direction` flips A-Z / Z-A.
    if (sort === "name") return dir * a.name.localeCompare(b.name);
    if (sort === "added") return dir * a.createdAt.localeCompare(b.createdAt);
    return dir * (a.lastSeenAt ?? a.createdAt).localeCompare(b.lastSeenAt ?? b.createdAt);
  });

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, pageCount);
  return {
    rows: filtered.slice((safePage - 1) * pageSize, safePage * pageSize),
    total: filtered.length,
    page: safePage,
    pageSize,
    pageCount,
    // Sorting is a *view* preference, not a filter — `isFiltered` drives the
    // "no data" vs "no results" empty state, so it stays keyed on q/status.
    isFiltered: needle.length > 0 || status !== "ALL",
    fetchedAt: new Date().toISOString(),
  };
}

export async function getCustomer(ctx: OrganizationContext, idOrEmail: string): Promise<Customer | null> {
  const all = await buildDirectory(ctx);
  const needle = idOrEmail.trim().toLowerCase();
  return all.find((c) => c.id === idOrEmail || c.email.toLowerCase() === needle) ?? null;
}

export async function getCustomerTransactions(ctx: OrganizationContext, email: string): Promise<Transaction[]> {
  const rows = await scopedLedgerRows(ctx);
  return rows.filter((t) => t.customerEmail.toLowerCase() === email.toLowerCase());
}

export type CustomerMetrics = {
  total: number;
  active: number;
  review: number;
  newThisWeek: number;
  totalLifetimeValue: number;
  currency: string;
};

export async function getCustomerMetrics(ctx: OrganizationContext): Promise<CustomerMetrics> {
  const all = await buildDirectory(ctx);
  const weekAgo = Date.now() - 7 * 86_400_000;
  return {
    total: all.length,
    active: all.filter((c) => c.status === "ACTIVE").length,
    review: all.filter((c) => c.status === "REVIEW").length,
    newThisWeek: all.filter((c) => new Date(c.createdAt).getTime() >= weekAgo).length,
    totalLifetimeValue: all.reduce((a, c) => a + c.lifetimeValue, 0),
    currency: "IDR",
  };
}

export type CreateCustomerInput = {
  name: string;
  email: string;
  status?: CustomerStatus;
  notes?: string;
};

export async function createCustomer(ctx: OrganizationContext, input: CreateCustomerInput): Promise<Customer> {
  const { organizationId } = scopeOf(ctx);
  const email = input.email.trim().toLowerCase();
  // Uniqueness is per-tenant (composite key, spec P-10): the same email in
  // another tenant is a different row, twice in one tenant is a duplicate.
  const existing = await getCustomer(ctx, email);
  if (existing) throw new Error("A customer with this email already exists");

  const id = customerIdFromEmail(email);
  writePartition(organizationId).manual.unshift({
    id,
    organizationId,
    name: input.name.trim(),
    email,
    referenceId: `REF-${id.slice(4).toUpperCase()}`,
    status: input.status ?? "NEW",
    createdAt: new Date().toISOString(),
    notes: input.notes?.trim() || undefined,
  });

  const created = await getCustomer(ctx, id);
  if (!created) throw new Error("Customer could not be created");
  return created;
}

export type UpdateCustomerInput = {
  id: string;
  name?: string;
  status?: CustomerStatus;
  notes?: string;
};

/**
 * own id     → updated
 * unknown id → `null` (the caller's existing NOT_FOUND path)
 * foreign id → throws `TenantIsolationError` after recording the denial, so
 *   the wire can answer not-found without the log going silent.
 */
export async function updateCustomer(ctx: OrganizationContext, input: UpdateCustomerInput): Promise<Customer | null> {
  const { organizationId } = scopeOf(ctx);
  const existing = await getCustomer(ctx, input.id);
  if (existing) {
    const s = writePartition(organizationId);
    s.overrides[input.id] = {
      ...s.overrides[input.id],
      ...(input.name !== undefined ? { name: input.name.trim() } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.notes !== undefined ? { notes: input.notes.trim() } : {}),
    };
    return getCustomer(ctx, input.id);
  }
  const foreignOwner = customerOwnedByAnotherTenant(organizationId, input.id);
  if (foreignOwner) {
    recordTenantDenial({
      surface: "server/data/customers.updateCustomer",
      actorOrganizationId: organizationId,
      requestedOrganizationId: foreignOwner,
      actorId: null,
      resourceId: typeof input.id === "string" ? input.id : null,
    });
    throw new TenantIsolationError(
      "CROSS_TENANT_WRITE",
      { surface: "server/data/customers.updateCustomer", actorOrg: organizationId, requestedOrg: foreignOwner },
      "Refusing a cross-tenant write on server/data/customers.updateCustomer: the customer belongs to another organization.",
    );
  }
  return null;
}

/** Which other tenant (if any) owns a manual record or override with this id. */
function customerOwnedByAnotherTenant(organizationId: string, id: string): string | null {
  for (const [tenantId, state] of store().tenants.entries()) {
    if (tenantId === organizationId) continue;
    if (state.manual.some((m) => m.id === id)) return tenantId;
    if (state.overrides[id]) return tenantId;
  }
  return null;
}

export function customersToCsv(rows: Customer[]) {
  const header = [
    "customer_id",
    "reference_id",
    "name",
    "email",
    "status",
    "created_at",
    "last_seen_at",
    "payments",
    "success_rate",
    "lifetime_value",
    "currency",
  ];
  const escape = (v: string | number | null) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const lines = rows.map((c) =>
    [
      c.id,
      c.referenceId,
      c.name,
      c.email,
      c.status,
      c.createdAt,
      c.lastSeenAt,
      c.paymentCount,
      c.successRate.toFixed(1),
      c.lifetimeValue,
      c.currency,
    ]
      .map(escape)
      .join(",")
  );
  return [header.join(","), ...lines].join("\n");
}
