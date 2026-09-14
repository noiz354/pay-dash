// Subscription plans (ADR-0021) — the recurring-billing records the app can
// hold. INTEGRATION.md (:96/:119) maps the subscription screen to
// "getInvoices() with recurring filters", but the Invoice model is the
// platform's own billing (no recurring dimension, no such filter), and the v7
// SDK product list has no Subscriptions product — so the app keeps plans in
// its own store, the same class of record as links, batches and webhooks.
//
// Deliberately seeded (the ADR-0019 distinction): a plan is a business record
// the merchant's app "would have generated", not an unverified claim about the
// merchant's identity. The ledger's own description pool already contains
// "Subscription renewal — Growth plan", and every plan below points at a
// customer that exists in the customer directory (ids via the same pure hash).

import { customerIdFromEmail } from "./customers";
import { DEFAULT_DEMO_ORG } from "@/domain/payments/runtime-defaults";
import { parseOrganizationContext, type OrganizationContext } from "@/domain/tenancy/organization-context";
import {
  SUBSCRIPTION_STATUSES,
  type SubscriptionStatus,
} from "@/lib/subscription-status";

export { SUBSCRIPTION_STATUSES };

export type SubscriptionInterval = "monthly" | "yearly";

export type Subscription = {
  id: string;
  /**
   * Owner tenant (Wave 7D). The plan id is a pure hash of `(email, planName)`,
   * so the same customer on the same plan in two tenants produces the same id
   * *shape* — the partition, not the id, is what makes them different rows
   * (spec P-10, mirroring 7C's composite customer key).
   */
  organizationId: string;
  planName: string;
  customerId: string;
  customerName: string;
  customerEmail: string;
  interval: SubscriptionInterval;
  amount: number;
  currency: string;
  status: SubscriptionStatus;
  startedAt: string;
  nextBillingAt: string | null;
  cancelledAt: string | null;
  notes?: string;
};

export type SubscriptionFilters = {
  q?: string;
  status?: SubscriptionStatus | "ALL";
  sort?: "recent" | "amount";
  page?: number;
  pageSize?: number;
};

export type PaginatedSubscriptions = {
  rows: Subscription[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
  isFiltered: boolean;
};

export type SubscriptionSummary = {
  active: number;
  activeMrr: number;
  pendingSetup: number;
  pastDue: number;
  pastDueTotal: number;
  cancelled: number;
};

/* --------------------------------- seeding -------------------------------- */

function subscriptionIdFrom(email: string, planName: string): string {
  const key = `${email.trim().toLowerCase()}|${planName.trim().toLowerCase()}`;
  let hash = 5381;
  for (let i = 0; i < key.length; i++) {
    hash = (hash * 33 + key.charCodeAt(i)) >>> 0;
  }
  return `sub_${hash.toString(36).padStart(8, "0")}`;
}

const DAY = 86_400_000;

function isoDaysFromNow(days: number, anchor: number): string {
  return new Date(anchor + days * DAY).toISOString();
}

type SeedPlan = {
  customerName: string;
  customerEmail: string;
  planName: string;
  interval: SubscriptionInterval;
  amount: number;
  status: SubscriptionStatus;
  startedDaysAgo: number;
  nextBillingDaysFromNow: number | null;
  cancelledDaysAgo?: number;
};

const SEED_PLANS: SeedPlan[] = [
  {
    customerName: "Initech BV",
    customerEmail: "finance@initech.eu",
    planName: "Growth",
    interval: "monthly",
    amount: 15_000_000,
    status: "ACTIVE",
    startedDaysAgo: 155,
    nextBillingDaysFromNow: 3,
  },
  {
    customerName: "Globex Retail",
    customerEmail: "ap@globex-retail.com",
    planName: "Scale",
    interval: "monthly",
    amount: 48_500_000,
    status: "ACTIVE",
    startedDaysAgo: 240,
    nextBillingDaysFromNow: 9,
  },
  {
    customerName: "Sarah Chen",
    customerEmail: "sarah.chen@example.com",
    planName: "Starter",
    interval: "monthly",
    amount: 3_900_000,
    status: "ACTIVE",
    startedDaysAgo: 62,
    nextBillingDaysFromNow: 28,
  },
  {
    customerName: "Warung Kopi Nusantara",
    customerEmail: "owner@kopinusantara.id",
    planName: "Starter",
    interval: "yearly",
    amount: 39_000_000,
    status: "ACTIVE",
    startedDaysAgo: 95,
    nextBillingDaysFromNow: 270,
  },
  {
    customerName: "Acme Corporation",
    customerEmail: "contact@acmecorp.com",
    planName: "Enterprise",
    interval: "yearly",
    amount: 240_000_000,
    status: "ACTIVE",
    startedDaysAgo: 420,
    nextBillingDaysFromNow: 30,
  },
  {
    customerName: "Kevin Tan",
    customerEmail: "kevin.tan@domain.net",
    planName: "Growth",
    interval: "monthly",
    amount: 15_000_000,
    status: "PAST_DUE",
    startedDaysAgo: 120,
    nextBillingDaysFromNow: -6,
  },
  {
    customerName: "Nadia Rahman",
    customerEmail: "nadia@rahmanstudio.id",
    planName: "Starter",
    interval: "monthly",
    amount: 3_900_000,
    status: "ACTIVE",
    startedDaysAgo: 33,
    nextBillingDaysFromNow: 27,
  },
  {
    customerName: "Budi Santoso",
    customerEmail: "budi.santoso@mail.co.id",
    planName: "Scale",
    interval: "monthly",
    amount: 48_500_000,
    status: "PENDING_SETUP",
    startedDaysAgo: 1,
    nextBillingDaysFromNow: 29,
  },
  {
    customerName: "Global Logistics Ltd.",
    customerEmail: "billing@globallogistics.com",
    planName: "Growth",
    interval: "monthly",
    amount: 15_000_000,
    status: "CANCELLED",
    startedDaysAgo: 200,
    nextBillingDaysFromNow: null,
    cancelledDaysAgo: 60,
  },
  {
    customerName: "Acme Corp",
    customerEmail: "billing@acme-corp.com",
    planName: "Starter",
    interval: "yearly",
    amount: 39_000_000,
    status: "PENDING_SETUP",
    startedDaysAgo: 0,
    nextBillingDaysFromNow: 365,
  },
];

function seedPlans(organizationId: string): Subscription[] {
  const anchor = Date.now();
  return SEED_PLANS.map((p) => ({
    id: subscriptionIdFrom(p.customerEmail, p.planName),
    organizationId,
    planName: p.planName,
    customerId: customerIdFromEmail(p.customerEmail),
    customerName: p.customerName,
    customerEmail: p.customerEmail,
    interval: p.interval,
    amount: p.amount,
    currency: "IDR",
    status: p.status,
    startedAt: isoDaysFromNow(-p.startedDaysAgo, anchor),
    nextBillingAt:
      p.nextBillingDaysFromNow === null ? null : isoDaysFromNow(p.nextBillingDaysFromNow, anchor),
    cancelledAt: p.cancelledDaysAgo === undefined ? null : isoDaysFromNow(-p.cancelledDaysAgo, anchor),
    notes: "Seeded for the prototype directory.",
  }));
}

/* ---------------------------------- store ---------------------------------- */

type TenantPlanState = { plans: Subscription[] };
type Store = { tenants: Map<string, TenantPlanState> };

const globalStore = globalThis as unknown as { __kineticSubscriptionStore?: Store };
function store(): Store {
  if (!globalStore.__kineticSubscriptionStore) {
    // The demo organization is seeded eagerly so a first read already renders
    // the prototype world; every other tenant starts empty on first write
    // (7C's rule: an empty tenant gets `[]`, not somebody else's plan book).
    globalStore.__kineticSubscriptionStore = {
      tenants: new Map([[DEFAULT_DEMO_ORG, { plans: seedPlans(DEFAULT_DEMO_ORG) }]]),
    };
  }
  return globalStore.__kineticSubscriptionStore;
}

// --- Wave 7D: tenancy seam ---------------------------------------------------
//
// Mirrors `server/data/customers.ts` (7C), `payouts.ts` (7B) and
// `transactions.ts` (7A): the tenant predicate lives at the data boundary.
// Every read filters on the resolved context BEFORE any search/filter/sort/
// pagination, so a needle can only ever match the caller's own plans; a foreign
// id answers `null` (never 403 — no enumeration oracle), and a create lands in
// the caller's partition and nowhere else.

function scopeOf(ctx: OrganizationContext): OrganizationContext {
  return parseOrganizationContext(ctx);
}

function freshTenantState(): TenantPlanState {
  return { plans: [] };
}

/** Read-only view of one tenant's plan book; never persists. */
function readPartition(organizationId: string): TenantPlanState {
  return store().tenants.get(organizationId) ?? freshTenantState();
}

/** Writable view of one tenant's plan book; persists the partition. */
function writePartition(organizationId: string): TenantPlanState {
  const s = store();
  let partition = s.tenants.get(organizationId);
  if (!partition) {
    const plans = organizationId === DEFAULT_DEMO_ORG ? seedPlans(organizationId) : [];
    partition = { plans };
    s.tenants.set(organizationId, partition);
  }
  return partition;
}

/**
 * How many tenants hold plans. Tenancy *probe*: answers a question about the
 * store, never returns a plan row — the billing seam's demo-fallback refusal is
 * its only consumer (`server/services/billing-organization-context.ts`).
 */
export function countSubscriptionTenants(): number {
  return [...store().tenants.entries()].filter(([, t]) => t.plans.length > 0).length;
}

/**
 * The identity of the only plan-holding tenant, or `null` when there is not
 * exactly one. Same probe contract as `countSubscriptionTenants`: ids, no rows.
 */
export function soleSubscriptionOrganizationId(): string | null {
  const ids = [...store().tenants.entries()]
    .filter(([, t]) => t.plans.length > 0)
    .map(([id]) => id);
  return ids.length === 1 ? (ids[0] ?? null) : null;
}

/* ----------------------------------- api ----------------------------------- */

export async function listSubscriptions(
  ctx: OrganizationContext,
  filters: SubscriptionFilters = {},
): Promise<PaginatedSubscriptions> {
  const { organizationId } = scopeOf(ctx);
  const { q = "", status = "ALL", sort = "recent" } = filters;
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(100, Math.max(5, filters.pageSize ?? 10));
  const needle = q.trim().toLowerCase();

  // The predicate is the partition: filter/sort/page below only ever see the
  // caller's plans, so no needle or status can widen the answer.
  const all = readPartition(organizationId).plans;
  const filtered = all.filter((s) => {
    if (status !== "ALL" && s.status !== status) return false;
    if (needle) {
      const hay = `${s.id} ${s.planName} ${s.customerName} ${s.customerEmail}`.toLowerCase();
      if (!hay.includes(needle)) return false;
    }
    return true;
  });

  filtered.sort((a, b) => {
    if (sort === "amount") return b.amount - a.amount;
    return b.startedAt.localeCompare(a.startedAt);
  });

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, pageCount);
  return {
    rows: filtered.slice((safePage - 1) * pageSize, safePage * pageSize),
    total: filtered.length,
    page: safePage,
    pageSize,
    pageCount,
    isFiltered: needle.length > 0 || status !== "ALL",
  };
}

export async function getSubscription(ctx: OrganizationContext, id: string): Promise<Subscription | null> {
  const { organizationId } = scopeOf(ctx);
  // A foreign id and a missing id answer identically: `null` (spec §2 C-5).
  return readPartition(organizationId).plans.find((s) => s.id === id) ?? null;
}

export type CreateSubscriptionInput = {
  customerName: string;
  customerEmail: string;
  planName: string;
  interval: SubscriptionInterval;
  amount: number;
};

// A new plan lands in PENDING_SETUP — the customer must confirm before the
// first charge, so the app never claims a plan is live the moment it is made.
export async function createSubscription(
  ctx: OrganizationContext,
  input: CreateSubscriptionInput,
): Promise<Subscription> {
  // The owner comes from the context only — never from the form, never from a
  // default. This runs before the row is built, so there is no window in which
  // an ownerless plan exists.
  const { organizationId } = scopeOf(ctx);
  const now = Date.now();
  const sub: Subscription = {
    id: subscriptionIdFrom(input.customerEmail, input.planName) + new Date(now).getTime().toString(36),
    organizationId,
    planName: input.planName,
    customerId: customerIdFromEmail(input.customerEmail),
    customerName: input.customerName,
    customerEmail: input.customerEmail,
    interval: input.interval,
    amount: input.amount,
    currency: "IDR",
    status: "PENDING_SETUP",
    startedAt: new Date(now).toISOString(),
    nextBillingAt: new Date(now + (input.interval === "monthly" ? 30 : 365) * DAY).toISOString(),
    cancelledAt: null,
  };
  const partition = writePartition(organizationId);
  partition.plans = [sub, ...partition.plans];
  return sub;
}

/* --------------------------------- summary ---------------------------------- */

// Monthly recurring revenue: monthly plans at face value, yearly plans ÷ 12.
export function monthlyRecurring(sub: Subscription): number {
  if (sub.status !== "ACTIVE") return 0;
  return sub.interval === "yearly" ? Math.round(sub.amount / 12) : sub.amount;
}

export function subscriptionSummary(rows: Subscription[]): SubscriptionSummary {
  const active = rows.filter((s) => s.status === "ACTIVE");
  const pastDue = rows.filter((s) => s.status === "PAST_DUE");
  return {
    active: active.length,
    activeMrr: active.reduce((sum, s) => sum + monthlyRecurring(s), 0),
    pendingSetup: rows.filter((s) => s.status === "PENDING_SETUP").length,
    pastDue: pastDue.length,
    pastDueTotal: pastDue.reduce((sum, s) => sum + s.amount, 0),
    cancelled: rows.filter((s) => s.status === "CANCELLED").length,
  };
}

/* ----------------------------------- csv ------------------------------------ */

// Client-safe canonical implementation (the export button runs in the browser);
// re-exported so tests and server code can import it from the store.
export { subscriptionsToCsv } from "@/lib/subscription-csv";
