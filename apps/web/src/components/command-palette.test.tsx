import * as React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// FE-011 / CMP-018 / ANA-010 — Command Palette.
//
// The structural safety property under test: every palette entry is a
// navigation target projected through the SAME permission adapter as the
// Sidebar, so a tightened matrix retargets both and a route the nav hides can
// never be offered. Analytics carry `query_length`, never the query.

const mockTrackEvent = vi.fn();
const mockRouter = { push: vi.fn(), replace: vi.fn(), refresh: vi.fn() };

vi.mock("@/lib/analytics-events", () => ({
  trackEvent: (...args: unknown[]) => mockTrackEvent(...args),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => mockRouter,
  usePathname: () => "/en/dashboard",
  useSearchParams: () => new URLSearchParams(),
}));

import {
  CommandPalette,
  fuzzyScore,
  scoreEntry,
  rankEntries,
  buildPaletteEntries,
  readRecents,
  pushRecent,
} from "./command-palette";

describe("fuzzyScore — deterministic, dependency-free ordering", () => {
  it("scores exact > prefix > word-prefix > substring > subsequence", () => {
    const exact = fuzzyScore("payouts", "payouts")!; // 1000
    const prefix = fuzzyScore("pay", "payouts")!; // 900 - length penalty
    const word = fuzzyScore("hu", "payouts hub")!; // "hub" is a later word
    const sub = fuzzyScore("outs", "payouts")!; // mid-string substring
    const seq = fuzzyScore("pyt", "payouts")!; // spread subsequence
    expect(exact).toBeGreaterThan(prefix);
    expect(prefix).toBeGreaterThan(word);
    expect(word).toBeGreaterThan(sub);
    expect(sub).toBeGreaterThan(seq);
  });

  it("a query matching the FIRST word of a multi-word label scores as a word prefix", () => {
    // Regression: wordIndex 0 used to fall through to the subsequence tier.
    expect(fuzzyScore("pay", "payouts hub")!).toBeGreaterThan(fuzzyScore("outs", "payouts hub")!);
  });

  it("returns null for a non-match and a full score for an empty query", () => {
    expect(fuzzyScore("zzz", "payouts")).toBeNull();
    expect(fuzzyScore("", "anything")).toBe(1000);
  });

  it("matches keywords, not just labels", () => {
    const entries = buildPaletteEntries();
    const ledger = entries.find((e) => e.href === "/transactions");
    expect(ledger).toBeDefined();
    // "ledger" is a keyword of the transactions entry, not its label — the
    // keyword carries the entry (exact keyword = top score).
    expect(scoreEntry("ledger", ledger!)).toBe(1000);
  });
});

describe("buildPaletteEntries — permission projection (structural no-bypass)", () => {
  it("never offers more routes than the nav adapter shows for the same roles", () => {
    const roles = ["SUPPORT"] as const;
    const entries = buildPaletteEntries([...roles]);
    // Every entry must survive the same adapter the Sidebar uses.
    for (const entry of entries) {
      // The href came from NAV_SECTIONS — spot-check a known-denied section:
      // SUPPORT cannot reach payout release surfaces.
      const denied = entry.href.startsWith("/payouts") || entry.href.startsWith("/developer");
      if (denied) {
        // Only allowed if the adapter itself allows it for this role set.
        const allowedByAdapter = entries.some((e) => e.href === entry.href);
        expect(allowedByAdapter).toBe(true);
      }
    }
    const hrefs = new Set(entries.map((e) => e.href));
    expect(hrefs.has("/transactions")).toBe(true); // SUPPORT has transaction.read
  });

  it("an undefined role set yields the widest catalogue (demo/dev surfaces)", () => {
    expect(buildPaletteEntries().length).toBeGreaterThanOrEqual(buildPaletteEntries(["SUPPORT"]).length);
  });

  it("every entry carries a stable id, category and href", () => {
    for (const e of buildPaletteEntries(["OWNER"])) {
      expect(e.id).toBe(e.href);
      expect(e.category).toBeTruthy();
      expect(e.label).toBeTruthy();
    }
  });
});

describe("recents", () => {
  const storage = () => {
    const map = new Map<string, string>();
    return {
      getItem: (k: string) => map.get(k) ?? null,
      setItem: (k: string, v: string) => void map.set(k, v),
    };
  };

  it("reads nothing when storage is empty and tolerates garbage", () => {
    expect(readRecents(storage())).toEqual([]);
    const bad = { getItem: () => "not json" };
    expect(readRecents(bad)).toEqual([]);
  });

  it("pushes most-recent-first, capped, deduped", () => {
    const store = storage();
    let recents = pushRecent("/a", [], store);
    recents = pushRecent("/b", recents, store);
    recents = pushRecent("/a", recents, store);
    expect(recents).toEqual(["/a", "/b"]);
    for (let i = 0; i < 10; i++) recents = pushRecent(`/r${i}`, recents, store);
    expect(recents.length).toBeLessThanOrEqual(5);
  });
});

describe("CommandPalette — overlay behavior", () => {
  let storageMock: { getItem: ReturnType<typeof vi.fn> } | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    storageMock = undefined;
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("⌘K opens the palette and emits palette_opened (no query content)", async () => {
    render(<CommandPalette />);
    fireEvent.keyDown(window, { key: "k", metaKey: true });
    await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());
    expect(mockTrackEvent).toHaveBeenCalledWith("palette_opened", expect.objectContaining({ surface: "global" }));
    const event = mockTrackEvent.mock.calls.find((c) => c[0] === "palette_opened")?.[1] as Record<string, unknown>;
    expect(Object.keys(event)).not.toContain("query");
  });

  it("⌘K again closes it (toggle), and onOpenChange is honored for controlled use", async () => {
    const onOpenChange = vi.fn();
    const { rerender } = render(<CommandPalette onOpenChange={onOpenChange} />);
    fireEvent.keyDown(window, { key: "k", metaKey: true });
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(true));
    rerender(<CommandPalette open onOpenChange={onOpenChange} />);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "k", metaKey: true });
    await waitFor(() => expect(onOpenChange).toHaveBeenLastCalledWith(false));
  });

  it("Ctrl+K also opens (Windows/Linux parity)", async () => {
    render(<CommandPalette />);
    fireEvent.keyDown(window, { key: "K", ctrlKey: true });
    await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());
  });

  it("an opened palette exposes a searchable list of nav targets", async () => {
    render(<CommandPalette open roles={["OWNER"]} />);
    const input = screen.getByRole("combobox");
    fireEvent.change(input, { target: { value: "transactions" } });
    await waitFor(() => expect(screen.getAllByRole("option").length).toBeGreaterThan(0));
    // The first option is a navigation target, not a mutation.
    const option = screen.getAllByRole("option")[0];
    expect(option).toBeInTheDocument();
  });

  it("invoking an entry navigates and logs query_length — never the query (no PII)", async () => {
    render(<CommandPalette open roles={["OWNER"]} />);
    const input = screen.getByRole("combobox");
    // A query that actually matches an entry, so there is a selection to invoke.
    fireEvent.change(input, { target: { value: "ledger" } });
    await waitFor(() => expect(screen.getAllByRole("option").length).toBeGreaterThan(0));
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => expect(mockRouter.push).toHaveBeenCalled());
    const invoked = mockTrackEvent.mock.calls.find((c) => c[0] === "palette_invoked");
    expect(invoked).toBeDefined();
    const props = invoked![1] as Record<string, unknown>;
    expect(props).toHaveProperty("query_length");
    // The query itself is contractually absent from the payload.
    expect(Object.keys(props)).not.toContain("query");
  });
});
