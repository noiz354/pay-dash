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
