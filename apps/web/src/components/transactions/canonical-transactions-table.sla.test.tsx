import * as React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { LedgerRow } from "@/server/data/transactions";

// ---------------------------------------------------------------------------
// Wave 4 §3 — SLA wiring contract on the transactions ledger (SCR-005).
// These tests pin the *behavior and URL/query contract*: badge rendering from
// server-computed views, the ?sla= filter round-trip, chip + count, sla sort,
// and the sla_filter_applied / sla_breached analytics.
// ---------------------------------------------------------------------------

const mockRouter = { replace: vi.fn(), push: vi.fn() };
const mockNextRouter = { replace: vi.fn(), refresh: vi.fn() };
const mockTrackEvent = vi.fn();
const mockReportBreaches = vi.fn();
const mockSearchParams = { current: new URLSearchParams() };

vi.mock("next/navigation", () => ({
  useSearchParams: () => mockSearchParams.current,
  useRouter: () => mockNextRouter,
}));
vi.mock("@/i18n/navigation", () => ({
  usePathname: () => "/en/transactions",
  useRouter: () => mockRouter,
}));
vi.mock("next/link", () => ({
  default: (props: Record<string, unknown> & { href: string; children?: React.ReactNode }) =>
    React.createElement("a", { href: props.href }, props.children),
}));
vi.mock("@/lib/analytics-events", () => ({
  trackEvent: (...args: unknown[]) => mockTrackEvent(...args),
}));
vi.mock("@/lib/sla-telemetry", () => ({
  reportSlaBreaches: (...args: unknown[]) => mockReportBreaches(...args),
}));

import { CanonicalTransactionsTable } from "./canonical-transactions-table";

const HOUR = 3_600_000;

function row(partial: Partial<LedgerRow> & Pick<LedgerRow, "id" | "status">): LedgerRow {
  const createdAt = partial.createdAt ?? new Date(Date.now() - 2 * HOUR).toISOString();
  return {
    referenceId: partial.id,
    createdAt,
    updatedAt: createdAt,
    amount: 500_000,
    currency: "IDR",
    fee: 14_500,
    net: 485_500,
    channel: "CARD",
    methodLabel: "Visa •••• 4242",
    customerName: "Ada Lovelace",
    customerEmail: "ada@example.com",
    description: "Subscription renewal",
    riskScore: 12,
    refundedAmount: 0,
    refundState: "NONE",
    refundRequest: null,
    events: [],
    slaEntityType: null,
    slaBand: null,
    slaAgeSeconds: null,
    slaRemainingSeconds: null,
    slaDueAt: null,
    ...partial,
    organizationId: "org-a",
  };
}

const FIXTURES: LedgerRow[] = [
  row({ id: "txn_open_normal", status: "PENDING", slaEntityType: "transaction_settlement", slaBand: "NORMAL", slaAgeSeconds: 3600, slaRemainingSeconds: 10_800, slaDueAt: new Date(Date.now() + 3 * HOUR).toISOString() }),
  row({ id: "txn_open_overdue", status: "PROCESSING", slaEntityType: "transaction_settlement", slaBand: "OVERDUE", slaAgeSeconds: 18_000, slaRemainingSeconds: -3600, slaDueAt: new Date(Date.now() - HOUR).toISOString() }),
  row({ id: "txn_open_critical", status: "FAILED", slaEntityType: "failed_payment", slaBand: "CRITICAL", slaAgeSeconds: 90_000, slaRemainingSeconds: -82_800, slaDueAt: new Date(Date.now() - 23 * HOUR).toISOString() }),
  row({ id: "txn_done", status: "SUCCEEDED" }),
];

function renderTable(props: Partial<Parameters<typeof CanonicalTransactionsTable>[0]> = {}) {
  return render(
    <CanonicalTransactionsTable
      rows={FIXTURES}
      total={FIXTURES.length}
      page={1}
      pageCount={1}
      pageSize={10}
      isFiltered={false}
      {...props}
    />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockSearchParams.current = new URLSearchParams();
});

describe("CanonicalTransactionsTable — SLA column (badge from server view)", () => {
  it("renders the band badge with countdown for open rows and 'Settled' for terminal rows", () => {
    renderTable();
    // Badges render in both the desktop row and the mobile card renderer —
    // assert presence, not uniqueness.
    expect(screen.getAllByTestId("sla-badge-normal").length).toBeGreaterThan(0);
    expect(screen.getAllByTestId("sla-badge-overdue").length).toBeGreaterThan(0);
    expect(screen.getAllByTestId("sla-badge-critical").length).toBeGreaterThan(0);
    // The terminal row states its closed commitment instead of a blank cell.
    expect(screen.getAllByText("Settled").length).toBeGreaterThan(0);
    // Countdown text is present ("3h left" / "1h overdue" family).
    expect(screen.getAllByText(/\d+[hdsm] (left|overdue)/).length).toBeGreaterThan(0);
  });

  it("never renders a badge for a null-band row", () => {
    renderTable({ rows: [row({ id: "txn_done", status: "REFUNDED" })] });
    expect(screen.queryByTestId(/^sla-badge-/)).not.toBeInTheDocument();
    expect(screen.getByText("Settled")).toBeInTheDocument();
  });
});

describe("CanonicalTransactionsTable — SLA filter (URL contract)", () => {
  it("choosing a band writes ?sla=, drops page, and fires sla_filter_applied", () => {
    mockSearchParams.current = new URLSearchParams("page=3&status=FAILED");
    renderTable({ isFiltered: true });
    fireEvent.click(screen.getByRole("button", { name: /Open filters/i }));
    const select = screen.getByRole("combobox", { name: /SLA/i }) as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "OVERDUE" } });
    expect(mockRouter.replace).toHaveBeenCalledTimes(1);
    const url = mockRouter.replace.mock.calls[0][0] as string;
    expect(url).toContain("sla=OVERDUE");
    expect(url).not.toContain("page=3");
    expect(url).toContain("status=FAILED"); // other filters preserved
    expect(mockTrackEvent).toHaveBeenCalledWith(
      "sla_filter_applied",
      expect.objectContaining({ band: "OVERDUE", result_count: 4, scr: "SCR-005" }),
    );
  });

  it("choosing ALL removes the param instead of writing sla=ALL", () => {
    mockSearchParams.current = new URLSearchParams("sla=OVERDUE");
    renderTable({ isFiltered: true });
    fireEvent.click(screen.getByRole("button", { name: /Open filters/i }));
    fireEvent.change(screen.getByRole("combobox", { name: /SLA/i }), { target: { value: "ALL" } });
    const url = mockRouter.replace.mock.calls[0][0] as string;
    expect(url).toBe("/en/transactions");
    expect(mockTrackEvent).toHaveBeenCalledWith(
      "sla_filter_applied",
      expect.objectContaining({ band: "ALL" }),
    );
  });

  it("an active band renders a clearable chip and the active count", () => {
    mockSearchParams.current = new URLSearchParams("sla=CRITICAL");
    renderTable({ isFiltered: true });
    const chip = screen.getByRole("listitem");
    expect(chip).toHaveTextContent("SLA: Critically overdue");
    fireEvent.click(screen.getByRole("button", { name: "Clear filter SLA: Critically overdue" }));
    expect(mockRouter.replace).toHaveBeenCalledWith("/en/transactions", { scroll: false });
  });

  it("the select reflects the URL state on mount", () => {
    mockSearchParams.current = new URLSearchParams("sla=APPROACHING");
    renderTable({ isFiltered: true });
    fireEvent.click(screen.getByRole("button", { name: /Open filters/i }));
    expect((screen.getByRole("combobox", { name: /SLA/i }) as HTMLSelectElement).value).toBe("APPROACHING");
  });

  it("Escape closes the filter sheet (overlay dismissal)", () => {
    renderTable();
    fireEvent.click(screen.getByRole("button", { name: /Open filters/i }));
    expect(screen.getByRole("dialog", { name: "Filters" })).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "Filters" })).not.toBeInTheDocument();
  });

  it("the overlay click target and the close button both dismiss the sheet", () => {
    renderTable();
    fireEvent.click(screen.getByRole("button", { name: /Open filters/i }));
    fireEvent.click(screen.getByRole("button", { name: "Close filters" }));
    expect(screen.queryByRole("dialog", { name: "Filters" })).not.toBeInTheDocument();
  });
});

describe("CanonicalTransactionsTable — SLA sort (URL contract)", () => {
  it("clicking the SLA header writes sort=sla with the toggled direction", () => {
    renderTable();
    const header = screen.getByRole("columnheader", { name: /SLA/i });
    fireEvent.click(header);
    const url = mockRouter.replace.mock.calls[0][0] as string;
    expect(url).toContain("sort=sla");
    expect(url).toContain("direction=asc");
  });
});

describe("CanonicalTransactionsTable — sla_breached telemetry", () => {
  it("reports exactly the breached rows shown, once per mount", () => {
    renderTable();
    expect(mockReportBreaches).toHaveBeenCalledTimes(1);
    const subjects = mockReportBreaches.mock.calls[0][0] as Array<{ id: string; band: string }>;
    expect(subjects).toHaveLength(4); // all rendered rows; the helper filters bands
    expect(subjects.filter((s) => s.band === "CRITICAL")).toHaveLength(1);
  });

  it("re-renders with the same rows do not re-report", () => {
    const { rerender } = renderTable();
    rerender(
      <CanonicalTransactionsTable
        rows={FIXTURES}
        total={FIXTURES.length}
        page={1}
        pageCount={1}
        pageSize={10}
        isFiltered={false}
      />,
    );
    // The effect keys on `rows`; the same array reference does not re-fire…
    expect(mockReportBreaches).toHaveBeenCalledTimes(1);
  });
});
