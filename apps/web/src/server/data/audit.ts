import "server-only";

import { formatMoney } from "@/lib/format";
import type { AuditCategoryValue, AuditRangeValue, AuditStatusValue } from "@/lib/audit-options";
import { BLOCKLIST_REASON_LABELS, BLOCKLIST_TYPE_LABELS } from "@/lib/blocklist-options";
import { ROLE_LABELS } from "@/lib/team-roles";
import { listBlocklist } from "./blocklist";
import { getPayoutBatches } from "./payouts";
import { getRiskOverview } from "./risk";
import { listApiKeys } from "./settings";
import { listMembers } from "./team";
import { getLedgerRows } from "./transactions";
import { listWebhooks } from "./webhooks";

// ---------------------------------------------------------------------------
// Audit log data source (ADR-0026).
//
// The prototype /audit printed five hard-coded rows — all dated
// 2023-10-24, from off-world actors (@org.com / @ledger.io / @vendor.co)
// with invented identifiers (key_prod_892f..., batch_77x21, txn_9942a) —
// under a "Showing 1-5 of 12,042 events / Page 1 of 2409" footer, with a
// User column and an IP column that NO store in this app can fill (the
// ledger has no user or IP field, INTEGRATION.md:111 grounds the screen in
// transactions + webhook events only) and every control inert.
//
// This module owns no facts — it unifies the timestamped events the
// existing stores already hold (the ADR-0025 onboarding pattern):
//
//   payments      ← ledger transaction event timelines (created / authorized
//                   / captured / declined / awaiting / refunded)
//   payouts       ← payout batch timelines (actor = the batch's real source)
//   webhooks      ← the inbound callback log (received / deduplicated /
//                   rejected, with the real rejection reason)
//   configuration ← API-key creations, blocklist additions, the deployed
//                   velocity ruleset, team joins/invites
//
// Columns are honest: Timestamp · Category · Action & Resource · Detail ·
// Status. There is no User column and no IP column — the detail text
// carries what the stores know (method, issuer code, callback source).
// ---------------------------------------------------------------------------

export type AuditCategory = AuditCategoryValue;
export type AuditStatus = AuditStatusValue;

export type AuditEvent = {
  id: string;
  at: string;
  category: AuditCategory;
  action: string;
  resource: string;
  detail: string;
  status: AuditStatus;
};

export type AuditFilters = {
  q?: string;
  category?: AuditCategory | "ALL";
  status?: AuditStatus | "ALL";
  range?: AuditRangeValue;
  page?: number;
  pageSize?: number;
};

export type PaginatedAuditEvents = {
  rows: AuditEvent[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
  isFiltered: boolean;
};

export type AuditSummary = {
  total: number;
  byCategory: Record<AuditCategory, number>;
};

const KIND_STATUS: Record<"info" | "success" | "warning" | "error", AuditStatus> = {
  info: "INFO",
  success: "SUCCESS",
  warning: "WARNING",
  error: "FAILED",
};

const RANGE_DAYS: Record<AuditRangeValue, number | null> = {
  "24h": 1,
  "7d": 7,
  "30d": 30,
  "90d": 90,
  all: null,
};

/** Synchronous owners: ledger transaction timelines + payout batch timelines. */
function syncEvents(): AuditEvent[] {
  const events: AuditEvent[] = [];

  // --- payments ← ledger transaction timelines ------------------------------
  for (const tx of getLedgerRows()) {
    for (const ev of tx.events) {
      events.push({
        id: ev.id,
        at: ev.at,
        category: "PAYMENTS",
        action: ev.label,
        resource: tx.id,
        detail: `${ev.detail} · ${formatMoney(tx.amount, tx.currency)}`,
        status: KIND_STATUS[ev.kind],
      });
    }
  }

  // --- payouts ← batch timelines --------------------------------------------
  for (const batch of getPayoutBatches()) {
    for (const ev of batch.timeline) {
      events.push({
        id: `${batch.id}:${ev.id}`,
        at: ev.at,
        category: "PAYOUTS",
        action: ev.label,
        resource: batch.id,
        detail: ev.detail,
        status: KIND_STATUS[ev.kind],
      });
    }
  }

  return events;
}

/** The full derived event history, newest first. Read-only over the owners. */
export async function getAuditEvents(): Promise<AuditEvent[]> {
  const [keys, blocklist, risk, members] = await Promise.all([
    listApiKeys(),
    listBlocklist({ page: 1, pageSize: 100 }),
    getRiskOverview(),
    listMembers({ page: 1, pageSize: 100 }),
  ]);

  const asyncEvents: AuditEvent[] = [];

  for (const key of keys) {
    asyncEvents.push({
      id: `${key.id}:created`,
      at: key.createdAt,
      category: "CONFIGURATION",
      action: "API key created",
      resource: key.name,
      detail: `${key.environment === "LIVE" ? "Live" : "Sandbox"} · ${key.maskedSecret}`,
      status: "SUCCESS",
    });
  }

  for (const entry of blocklist.rows) {
    asyncEvents.push({
      id: `${entry.id}:added`,
      at: entry.addedAt,
      category: "CONFIGURATION",
      action: `${BLOCKLIST_TYPE_LABELS[entry.type]} added to blocklist`,
      resource: entry.value,
      detail: BLOCKLIST_REASON_LABELS[entry.reason],
      status: "SUCCESS",
    });
  }

  asyncEvents.push({
    id: "risk:deployed",
    at: risk.deployedAt,
    category: "CONFIGURATION",
    action: "Velocity ruleset deployed",
    resource: "velocity_ruleset",
    detail: `${risk.deployed.rules.length} rules · daily and monthly caps in force`,
    status: "SUCCESS",
  });

  for (const member of members.rows) {
    const roleLabel = ROLE_LABELS[member.role];
    if (member.joinedAt) {
      asyncEvents.push({
        id: `${member.id}:joined`,
        at: member.joinedAt,
        category: "CONFIGURATION",
        action: "Team member joined",
        resource: member.email,
        detail: `${roleLabel} · ${member.name}`,
        status: "SUCCESS",
      });
    }
    if (member.invitedAt && !member.joinedAt) {
      asyncEvents.push({
        id: `${member.id}:invited`,
        at: member.invitedAt,
        category: "CONFIGURATION",
        action: "Team invite sent",
        resource: member.email,
        detail: `${roleLabel} · ${member.name}`,
        status: "INFO",
      });
    }
  }

  // --- webhooks ← the inbound callback log -----------------------------------
  const webhooks = listWebhooks({ page: 1, pageSize: 100 });
  for (const ev of webhooks.rows) {
    const action =
      ev.status === "RECEIVED"
        ? "Callback received"
        : ev.status === "DUPLICATED"
          ? "Callback deduplicated"
          : "Callback rejected";
    const detail = [
      ev.type,
      ev.reason ?? (ev.unhandled ? "No handler for this event type" : "Verified and stored"),
    ].join(" · ");
    asyncEvents.push({
      id: ev.id,
      at: ev.receivedAt,
      category: "WEBHOOKS",
      action,
      resource: ev.eventId,
      detail,
      // a rejected callback is the endpoint doing its job — a warning, not a failure
      status: ev.status === "RECEIVED" ? "SUCCESS" : ev.status === "DUPLICATED" ? "INFO" : "WARNING",
    });
  }

  return [...syncEvents(), ...asyncEvents].sort(
    (a, b) => b.at.localeCompare(a.at) || a.id.localeCompare(b.id)
  );
}

export async function listAuditEvents(filters: AuditFilters = {}): Promise<PaginatedAuditEvents> {
  const { q = "", category = "ALL", status = "ALL", range = "all" } = filters;
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(100, Math.max(5, filters.pageSize ?? 10));

  let rows = await getAuditEvents();
  const needle = q.trim().toLowerCase();
  if (needle) {
    rows = rows.filter(
      (e) =>
        e.action.toLowerCase().includes(needle) ||
        e.resource.toLowerCase().includes(needle) ||
        e.detail.toLowerCase().includes(needle)
    );
  }
  if (category !== "ALL") rows = rows.filter((e) => e.category === category);
  if (status !== "ALL") rows = rows.filter((e) => e.status === status);
  const days = RANGE_DAYS[range];
  if (days !== null) {
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    rows = rows.filter((e) => new Date(e.at).getTime() >= cutoff);
  }

  const total = rows.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, pageCount);
  const start = (safePage - 1) * pageSize;

  return {
    rows: rows.slice(start, start + pageSize),
    total,
    page: safePage,
    pageSize,
    pageCount,
    isFiltered: Boolean(needle) || category !== "ALL" || status !== "ALL" || range !== "all",
  };
}

export async function auditSummary(): Promise<AuditSummary> {
  const rows = await getAuditEvents();
  const byCategory: Record<AuditCategory, number> = {
    PAYMENTS: 0,
    PAYOUTS: 0,
    WEBHOOKS: 0,
    CONFIGURATION: 0,
  };
  for (const e of rows) byCategory[e.category] += 1;
  return { total: rows.length, byCategory };
}

function csvCell(value: string) {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function auditEventsToCsv(rows: AuditEvent[]) {
  const header = ["timestamp", "category", "status", "action", "resource", "detail"];
  const body = rows.map((e) =>
    [e.at, e.category, e.status, e.action, e.resource, e.detail].map(csvCell).join(",")
  );
  return [header.join(","), ...body].join("\n");
}
