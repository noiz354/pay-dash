// Wave2: URL state as source of truth — parser/serializer canonical, deterministic fallback, legacy param support
// Implements: URL-backed state, normalization, refresh/back/share, filter persistence

export type TableUrlState = {
  page: number;
  pageSize: number;
  q: string;
  sort: string;
  direction: "asc" | "desc";
  status: string;
  channel: string;
  range: string;
  // Payout-specific
  batchStatus: string;
  batchSort: string;
  // Wave 4 — SLA band filter (transactions ledger); canonical vocabulary ALL|NORMAL|APPROACHING|OVERDUE|CRITICAL
  sla: string;
};

export type ParseOptions = {
  allowedStatuses?: string[];
  allowedChannels?: string[];
  allowedRanges?: string[];
  allowedSorts?: string[];
  defaultSort?: string;
  defaultDirection?: "asc" | "desc";
  defaultPageSize?: number;
  allowedPageSizes?: number[];
  allowedSlaBands?: string[];
};

const DEFAULT_OPTS: Required<ParseOptions> = {
  allowedStatuses: ["ALL", "SUCCEEDED", "PROCESSING", "PENDING", "FAILED", "REFUNDED"],
  allowedChannels: ["ALL", "CARD", "ACH", "VA", "QRIS", "EWALLET"],
  allowedRanges: ["all", "7d", "30d", "90d"],
  allowedSorts: ["recent", "amount", "date"],
  defaultSort: "recent",
  defaultDirection: "desc",
  defaultPageSize: 10,
  allowedPageSizes: [10, 25, 50],
  allowedSlaBands: ["ALL", "NORMAL", "APPROACHING", "OVERDUE", "CRITICAL"],
};

// Legacy param aliases (old → canonical)
const LEGACY_PARAM_MAP: Record<string, string> = {
  search: "q",
  query: "q",
  page_size: "pageSize",
  sortBy: "sort",
  order: "direction",
};

function one(v: string | string[] | null | undefined): string | undefined {
  if (Array.isArray(v)) return v[0];
  return v ?? undefined;
}

export function normalizeParams(sp: URLSearchParams): URLSearchParams {
  const normalized = new URLSearchParams();
  for (const [k, v] of sp.entries()) {
    const canonical = LEGACY_PARAM_MAP[k] ?? k;
    // Keep last occurrence for duplicates (deterministic: last wins)
    normalized.set(canonical, v);
  }
  return normalized;
}

export function parseTableUrlState(search: string | URLSearchParams, opts: ParseOptions = {}): TableUrlState {
  const sp = typeof search === "string" ? new URLSearchParams(search) : new URLSearchParams(search.toString());
  const params = normalizeParams(sp);
  const o = { ...DEFAULT_OPTS, ...opts };

  // page
  const rawPage = one(params.get("page"));
  let page = parseInt(rawPage ?? "", 10);
  if (!Number.isFinite(page) || page < 1) page = 1;

  // pageSize
  const rawSize = one(params.get("pageSize"));
  let pageSize = parseInt(rawSize ?? "", 10);
  if (!Number.isFinite(pageSize) || !o.allowedPageSizes.includes(pageSize)) pageSize = o.defaultPageSize;

  // q
  const q = (one(params.get("q")) ?? "").trim().slice(0, 200);

  // sort
  let sort = one(params.get("sort")) ?? o.defaultSort;
  if (!o.allowedSorts.includes(sort)) sort = o.defaultSort;

  // direction
  const rawDirection = one(params.get("direction"));
  const direction: "asc" | "desc" = rawDirection === "asc" || rawDirection === "desc" ? rawDirection : o.defaultDirection;

  // status
  let status = one(params.get("status")) ?? "ALL";
  if (!o.allowedStatuses.includes(status)) status = "ALL";

  // channel
  let channel = one(params.get("channel")) ?? "ALL";
  if (!o.allowedChannels.includes(channel)) channel = "ALL";

  // range
  let range = one(params.get("range")) ?? "all";
  if (!o.allowedRanges.includes(range)) range = "all";

  // payout batch
  let batchStatus = one(params.get("batchStatus")) ?? "ALL";
  // Allow generic status check for batch
  if (batchStatus !== "ALL" && !["SCHEDULED", "PROCESSING", "PAID", "PARTIAL", "FAILED", "CANCELLED"].includes(batchStatus)) batchStatus = "ALL";
  let batchSort = one(params.get("batchSort")) ?? "recent";
  if (!["recent", "amount", "recipients"].includes(batchSort)) batchSort = "recent";

  // Wave 4 — SLA band filter. Case-insensitive canonicalization (users and
  // links may carry `?sla=overdue`); anything unknown falls back to ALL so a
  // malformed URL can only ever widen back to the permitted full view.
  const rawSla = (one(params.get("sla")) ?? "ALL").trim().toUpperCase();
  const sla = o.allowedSlaBands!.includes(rawSla) ? rawSla : "ALL";

  return { page, pageSize, q, sort, direction, status, channel, range, batchStatus, batchSort, sla };
}

export function serializeTableUrlState(state: Partial<TableUrlState>, opts: ParseOptions = {}): string {
  const o = { ...DEFAULT_OPTS, ...opts };
  const p = new URLSearchParams();
  if (state.page && state.page !== 1) p.set("page", String(state.page));
  if (state.pageSize && state.pageSize !== o.defaultPageSize) p.set("pageSize", String(state.pageSize));
  if (state.q) p.set("q", state.q);
  if (state.sort && state.sort !== o.defaultSort) p.set("sort", state.sort);
  if (state.direction && state.direction !== o.defaultDirection) p.set("direction", state.direction);
  if (state.status && state.status !== "ALL") p.set("status", state.status);
  if (state.channel && state.channel !== "ALL") p.set("channel", state.channel);
  if (state.range && state.range !== "all") p.set("range", state.range);
  if (state.batchStatus && state.batchStatus !== "ALL") p.set("batchStatus", state.batchStatus);
  if (state.batchSort && state.batchSort !== "recent") p.set("batchSort", state.batchSort);
  if (state.sla && state.sla !== "ALL") p.set("sla", state.sla);
  const s = p.toString();
  return s ? `?${s}` : "";
}

// For filter chips helpers
export function activeFilterCount(state: TableUrlState): number {
  let n = 0;
  if (state.status !== "ALL") n++;
  if (state.channel !== "ALL") n++;
  if (state.range !== "all") n++;
  if (state.q) n++;
  if (state.batchStatus !== "ALL") n++;
  if (state.sla !== "ALL") n++;
  return n;
}

/** Human label per SLA band — chip text matches the badge vocabulary exactly. */
const SLA_CHIP_LABELS: Record<string, string> = {
  NORMAL: "On track",
  APPROACHING: "Approaching SLA",
  OVERDUE: "Overdue",
  CRITICAL: "Critically overdue",
};

export function toFilterChips(state: TableUrlState): Array<{ key: string; label: string; value: string }> {
  const chips: Array<{ key: string; label: string; value: string }> = [];
  if (state.status !== "ALL") chips.push({ key: "status", label: `Status: ${state.status}`, value: state.status });
  if (state.channel !== "ALL") chips.push({ key: "channel", label: `Channel: ${state.channel}`, value: state.channel });
  if (state.range !== "all") chips.push({ key: "range", label: `Date: ${state.range}`, value: state.range });
  if (state.q) chips.push({ key: "q", label: `Search: "${state.q}"`, value: state.q });
  if (state.batchStatus !== "ALL") chips.push({ key: "batchStatus", label: `Batch: ${state.batchStatus}`, value: state.batchStatus });
  if (state.sla !== "ALL") chips.push({ key: "sla", label: `SLA: ${SLA_CHIP_LABELS[state.sla] ?? state.sla}`, value: state.sla });
  return chips;
}
