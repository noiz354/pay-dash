import { describe, it, expect } from "vitest";
import { parseTableUrlState, serializeTableUrlState, activeFilterCount, toFilterChips, normalizeParams } from "./table-url-state";

describe("table-url-state parser/serializer (Wave2)", () => {
  it("parses empty → defaults", () => {
    const s = parseTableUrlState("");
    expect(s.page).toBe(1);
    expect(s.pageSize).toBe(10);
    expect(s.q).toBe("");
    expect(s.status).toBe("ALL");
    expect(s.sort).toBe("recent");
    expect(s.direction).toBe("desc");
  });

  it("parses valid params", () => {
    const s = parseTableUrlState("?page=3&pageSize=25&q=acme&status=FAILED&channel=CARD&range=7d&sort=amount&direction=asc");
    expect(s.page).toBe(3);
    expect(s.pageSize).toBe(25);
    expect(s.q).toBe("acme");
    expect(s.status).toBe("FAILED");
    expect(s.channel).toBe("CARD");
    expect(s.range).toBe("7d");
    expect(s.sort).toBe("amount");
    expect(s.direction).toBe("asc");
  });

  it("handles missing/invalid/duplicate with deterministic fallback", () => {
    const s = parseTableUrlState("?page=0&page=abc&pageSize=999&status=INVALID&direction=up&q=%20%20");
    expect(s.page).toBe(1);
    expect(s.pageSize).toBe(10);
    expect(s.status).toBe("ALL");
    expect(s.direction).toBe("desc");
    expect(s.q).toBe("");
  });

  it("handles legacy params", () => {
    const s = parseTableUrlState("?search=hello&page_size=50&sortBy=date&order=asc");
    expect(s.q).toBe("hello");
    expect(s.pageSize).toBe(50);
    expect(s.sort).toBe("date");
    expect(s.direction).toBe("asc");
  });

  it("handles duplicate param last wins", () => {
    const s = parseTableUrlState("?status=FAILED&status=SUCCEEDED");
    expect(s.status).toBe("SUCCEEDED");
  });

  it("supports unsupported value fallback", () => {
    const s = parseTableUrlState("?sort=unknown&direction=sideways");
    expect(s.sort).toBe("recent");
    expect(s.direction).toBe("desc");
  });

  it("serializes only non-defaults", () => {
    expect(serializeTableUrlState({ page: 1, q: "" })).toBe("");
    expect(serializeTableUrlState({ page: 2, q: "acme", status: "FAILED" })).toBe("?page=2&q=acme&status=FAILED");
  });

  it("normalizes legacy keys", () => {
    const sp = new URLSearchParams("search=foo&page_size=25");
    const norm = normalizeParams(sp);
    expect(norm.get("q")).toBe("foo");
    expect(norm.get("pageSize")).toBe("25");
    expect(norm.has("search")).toBe(false);
  });

  it("activeFilterCount and chips", () => {
    const s = parseTableUrlState("?status=FAILED&range=7d&q=hello");
    expect(activeFilterCount(s)).toBe(3);
    const chips = toFilterChips(s);
    expect(chips.map((c) => c.key)).toEqual(expect.arrayContaining(["status", "range", "q"]));
  });

  it("alias + query preserved (locale irrelevant)", () => {
    const s = parseTableUrlState("?q=test&status=PENDING&page=2");
    expect(s.q).toBe("test");
    expect(s.status).toBe("PENDING");
    expect(s.page).toBe(2);
    // Serialize round-trip
    const qs = serializeTableUrlState(s);
    const reparsed = parseTableUrlState(qs);
    expect(reparsed).toEqual(s);
  });

  it("pageSize validation allows only 10,25,50", () => {
    expect(parseTableUrlState("?pageSize=25").pageSize).toBe(25);
    expect(parseTableUrlState("?pageSize=15").pageSize).toBe(10);
  });
});

// ---------------------------------------------------------------------------
// Wave 4 §3 — SLA band filter contract (?sla=)
// ---------------------------------------------------------------------------

describe("table-url-state SLA contract (Wave 4)", () => {
  it("parses canonical bands, case-insensitively", () => {
    expect(parseTableUrlState("?sla=OVERDUE").sla).toBe("OVERDUE");
    expect(parseTableUrlState("?sla=overdue").sla).toBe("OVERDUE");
    expect(parseTableUrlState("?sla=critical").sla).toBe("CRITICAL");
    expect(parseTableUrlState("?sla=approaching").sla).toBe("APPROACHING");
    expect(parseTableUrlState("?sla=normal").sla).toBe("NORMAL");
    expect(parseTableUrlState("?sla=ALL").sla).toBe("ALL");
  });

  it("unknown or malformed bands fall back to ALL (fail-open, never 4xx)", () => {
    expect(parseTableUrlState("?sla=bogus").sla).toBe("ALL");
    expect(parseTableUrlState("?sla=").sla).toBe("ALL");
    expect(parseTableUrlState("?sla=DROP%20TABLE").sla).toBe("ALL");
    expect(parseTableUrlState("?sla=OVERDUE&sla=ALL").sla).toBe("ALL"); // last wins
  });

  it("absent param defaults to ALL", () => {
    expect(parseTableUrlState("").sla).toBe("ALL");
  });

  it("serializes only non-ALL values", () => {
    expect(serializeTableUrlState({ sla: "ALL" })).toBe("");
    expect(serializeTableUrlState({ sla: "OVERDUE" })).toBe("?sla=OVERDUE");
    // round-trip: serialize → parse is the identity for the sla field
    const state = serializeTableUrlState({ sla: "CRITICAL" });
    expect(parseTableUrlState(state).sla).toBe("CRITICAL");
  });

  it("sla participates in the full URL round-trip", () => {
    const url = "?page=2&status=FAILED&sla=OVERDUE&sort=sla&direction=desc";
    const s = parseTableUrlState(url);
    expect(s.sla).toBe("OVERDUE");
    expect(s.sort).toBe("recent"); // default opts allowlist — the ledger opts add "sla"
  });

  it("chips render the human band label and clear by key", () => {
    const chips = toFilterChips(parseTableUrlState("?sla=CRITICAL"));
    expect(chips).toEqual([{ key: "sla", label: "SLA: Critically overdue", value: "CRITICAL" }]);
    expect(activeFilterCount(parseTableUrlState("?sla=CRITICAL"))).toBe(1);
    expect(toFilterChips(parseTableUrlState(""))).toEqual([]);
  });

  it("the ledger parser accepts sort=sla via allowedSorts", () => {
    const s = parseTableUrlState("?sort=sla", { allowedSorts: ["date", "amount", "status", "sla"], defaultSort: "date" });
    expect(s.sort).toBe("sla");
  });
});

// ---------------------------------------------------------------------------
// Wave 4 §4 — dual-control refund state contract (?refundState=, JRN-003)
// ---------------------------------------------------------------------------

describe("table-url-state refundState contract (Wave 4)", () => {
  it("parses canonical values, case-insensitively", () => {
    expect(parseTableUrlState("?refundState=AWAITING_APPROVAL").refundState).toBe("AWAITING_APPROVAL");
    expect(parseTableUrlState("?refundState=awaiting_approval").refundState).toBe("AWAITING_APPROVAL");
    expect(parseTableUrlState("?refundState=approved").refundState).toBe("APPROVED");
    expect(parseTableUrlState("?refundState=rejected").refundState).toBe("REJECTED");
    expect(parseTableUrlState("?refundState=ALL").refundState).toBe("ALL");
  });

  it("unknown or malformed values fall back to ALL (fail-open)", () => {
    expect(parseTableUrlState("?refundState=bogus").refundState).toBe("ALL");
    expect(parseTableUrlState("?refundState=").refundState).toBe("ALL");
    expect(parseTableUrlState("?refundState=DROP%20TABLE").refundState).toBe("ALL");
    expect(parseTableUrlState("?refundState=REJECTED&refundState=ALL").refundState).toBe("ALL"); // last wins
    expect(parseTableUrlState("").refundState).toBe("ALL");
  });

  it("serializes only non-ALL values and round-trips", () => {
    expect(serializeTableUrlState({ refundState: "ALL" })).toBe("");
    expect(serializeTableUrlState({ refundState: "AWAITING_APPROVAL" })).toBe("?refundState=AWAITING_APPROVAL");
    expect(parseTableUrlState(serializeTableUrlState({ refundState: "APPROVED" })).refundState).toBe("APPROVED");
  });

  it("participates in the combined URL round-trip (Role B queue link)", () => {
    const s = parseTableUrlState("?refundState=AWAITING_APPROVAL&sla=OVERDUE&status=FAILED");
    expect(s.refundState).toBe("AWAITING_APPROVAL");
    expect(s.sla).toBe("OVERDUE");
    expect(s.status).toBe("FAILED");
    expect(serializeTableUrlState(s)).toBe("?status=FAILED&sla=OVERDUE&refundState=AWAITING_APPROVAL");
  });

  it("chips render the human label and clear by key", () => {
    const chips = toFilterChips(parseTableUrlState("?refundState=AWAITING_APPROVAL"));
    expect(chips).toEqual([{ key: "refundState", label: "Refund: Awaiting approval", value: "AWAITING_APPROVAL" }]);
    expect(activeFilterCount(parseTableUrlState("?refundState=REJECTED"))).toBe(1);
    expect(toFilterChips(parseTableUrlState(""))).toEqual([]);
  });
});
