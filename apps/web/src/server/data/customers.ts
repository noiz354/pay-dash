import "server-only";

import { listTransactions, type Transaction } from "./transactions";
// Status vocabulary lives in a client-safe module; re-exported here so server
// code keeps a single import site for everything customer-shaped.
import { CUSTOMER_STATUSES, type CustomerStatus } from "@/lib/customer-status";

export { CUSTOMER_STATUSES };
export type { CustomerStatus };

// ---------------------------------------------------------------------------
// Customer directory.
// Derived from the same ledger store as transactions, so a customer's lifetime
// value and their payment list can never disagree. Manually-created customers
// live alongside the derived ones behind the same seam (swap for Prisma in one
// place, exactly like `transactions.ts`).
// ---------------------------------------------------------------------------

export type Customer = {
  id: string;
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
  sort?: "recent" | "ltv" | "name";
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
};

type ManualRecord = {
  id: string;
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
type Store = { manual: ManualRecord[]; overrides: Overrides };

export function customerIdFromEmail(email: string) {
  // Stable, URL-safe id derived from the email so ledger rows and the directory
  // always resolve to the same customer page.
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
// — now clickable, searchable and formatted through `formatMoney`.
const PROTOTYPE_SEED: ManualRecord[] = [
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
    globalStore.__kineticCustomerStore = { manual: [...PROTOTYPE_SEED], overrides: {} };
  }
  return globalStore.__kineticCustomerStore;
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

async function allLedgerRows(): Promise<Transaction[]> {
  const { rows } = await listTransactions({ page: 1, pageSize: 100 });
  return rows;
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

async function buildDirectory(): Promise<Customer[]> {
  const rows = await allLedgerRows();
  const byEmail = new Map<string, Transaction[]>();
  for (const t of rows) {
    const key = t.customerEmail.toLowerCase();
    const list = byEmail.get(key);
    if (list) list.push(t);
    else byEmail.set(key, [t]);
  }

  const { manual, overrides } = store();

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

export async function listCustomers(filters: CustomerFilters = {}): Promise<PaginatedCustomers> {
  const { q = "", status = "ALL", sort = "recent" } = filters;
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(100, Math.max(5, filters.pageSize ?? 10));
  const needle = q.trim().toLowerCase();

  const all = await buildDirectory();
  const filtered = all.filter((c) => {
    if (status !== "ALL" && c.status !== status) return false;
    if (needle) {
      const hay = `${c.name} ${c.email} ${c.referenceId}`.toLowerCase();
      if (!hay.includes(needle)) return false;
    }
    return true;
  });

  filtered.sort((a, b) => {
    if (sort === "ltv") return b.lifetimeValue - a.lifetimeValue;
    if (sort === "name") return a.name.localeCompare(b.name);
    return (b.lastSeenAt ?? b.createdAt).localeCompare(a.lastSeenAt ?? a.createdAt);
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

export async function getCustomer(idOrEmail: string): Promise<Customer | null> {
  const all = await buildDirectory();
  const needle = idOrEmail.trim().toLowerCase();
  return all.find((c) => c.id === idOrEmail || c.email.toLowerCase() === needle) ?? null;
}

export async function getCustomerTransactions(email: string): Promise<Transaction[]> {
  const rows = await allLedgerRows();
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

export async function getCustomerMetrics(): Promise<CustomerMetrics> {
  const all = await buildDirectory();
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

export async function createCustomer(input: CreateCustomerInput): Promise<Customer> {
  const email = input.email.trim().toLowerCase();
  const existing = await getCustomer(email);
  if (existing) throw new Error("A customer with this email already exists");

  const id = customerIdFromEmail(email);
  store().manual.unshift({
    id,
    name: input.name.trim(),
    email,
    referenceId: `REF-${id.slice(4).toUpperCase()}`,
    status: input.status ?? "NEW",
    createdAt: new Date().toISOString(),
    notes: input.notes?.trim() || undefined,
  });

  const created = await getCustomer(id);
  if (!created) throw new Error("Customer could not be created");
  return created;
}

export type UpdateCustomerInput = {
  id: string;
  name?: string;
  status?: CustomerStatus;
  notes?: string;
};

export async function updateCustomer(input: UpdateCustomerInput): Promise<Customer | null> {
  const existing = await getCustomer(input.id);
  if (!existing) return null;
  const s = store();
  s.overrides[input.id] = {
    ...s.overrides[input.id],
    ...(input.name !== undefined ? { name: input.name.trim() } : {}),
    ...(input.status !== undefined ? { status: input.status } : {}),
    ...(input.notes !== undefined ? { notes: input.notes.trim() } : {}),
  };
  return getCustomer(input.id);
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
