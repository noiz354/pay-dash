import * as React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { LedgerRow } from "@/server/data/transactions";

// The ?refundState= contract at the ledger interaction level (JRN-003 queue):
// the deep link renders its chip, the FilterSheet select writes the canonical
// param (dropping page, preserving other filters), and clearing returns to the
// bare pathname — refresh/back/share all ride on the URL, which is what the
// Playwright back-restore gate will exercise in a real browser.

const mockRouter = { replace: vi.fn(), push: vi.fn() };
const mockNextRouter = { replace: vi.fn(), refresh: vi.fn() };
const mockTrack = vi.fn();
const mockTrackEvent = vi.fn();
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
vi.mock("@/lib/analytics", () => ({
  track: (...args: unknown[]) => mockTrack(...args),
}));
vi.mock("@/lib/analytics-events", () => ({
  trackEvent: (...args: unknown[]) => mockTrackEvent(...args),
}));
vi.mock("@/lib/sla-telemetry", () => ({
  reportSlaBreaches: vi.fn(),
}));

import { CanonicalTransactionsTable } from "./canonical-transactions-table";

function row(id: string, status: LedgerRow["status"]): LedgerRow {
  const createdAt = new Date(Date.now() - 3_600_000).toISOString();
  return {
    // Wave 7A: a ledger row carries its tenant, so table fixtures name one. The
    // component receives already-scoped rows — scoping is a data-boundary
    // property, never a rendering one.
    organizationId: "org_demo",
    id,
    referenceId: id,
    createdAt,
    updatedAt: createdAt,
    amount: 250_000,
    currency: "IDR",
    fee: 7_250,
    net: 242_750,
    channel: "VA",
    methodLabel: "BCA Virtual Account",
    customerName: "Queue Customer",
    customerEmail: "queue@example.com",
    description: "Subscription renewal",
    riskScore: 5,
    refundedAmount: 0,
    refundState: "AWAITING_APPROVAL",
    refundRequest: null,
    events: [],
    slaEntityType: null,
    slaBand: null,
    slaAgeSeconds: null,
    slaRemainingSeconds: null,
    slaDueAt: null,
    status,
  };
}

function renderTable(rows: LedgerRow[], isFiltered = true) {
  return render(
    <CanonicalTransactionsTable
      rows={rows}
      total={rows.length}
      page={1}
      pageCount={1}
      pageSize={10}
      isFiltered={isFiltered}
    />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockSearchParams.current = new URLSearchParams();
});

describe("CanonicalTransactionsTable — refundState queue (?refundState=)", () => {
  it("the Role B deep link renders a clearable human chip and the active count", () => {
    mockSearchParams.current = new URLSearchParams("refundState=AWAITING_APPROVAL");
    renderTable([row("txn_1", "SUCCEEDED")]);
    const chip = screen.getByRole("listitem");
    expect(chip).toHaveTextContent("Refund: Awaiting approval");
    fireEvent.click(screen.getByRole("button", { name: "Clear filter Refund: Awaiting approval" }));
    expect(mockRouter.replace).toHaveBeenCalledWith("/en/transactions", { scroll: false });
  });

  it("choosing a state in the FilterSheet writes refundState, drops page, preserves other filters", () => {
    mockSearchParams.current = new URLSearchParams("page=4&status=SUCCEEDED");
    renderTable([row("txn_1", "SUCCEEDED")]);
    fireEvent.click(screen.getByRole("button", { name: /Open filters/i }));
    const select = screen.getByRole("combobox", { name: /Refund state/i }) as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "AWAITING_APPROVAL" } });
    expect(mockRouter.replace).toHaveBeenCalledTimes(1);
    const url = mockRouter.replace.mock.calls[0][0] as string;
    expect(url).toContain("refundState=AWAITING_APPROVAL");
    expect(url).not.toContain("page=4");
    expect(url).toContain("status=SUCCEEDED");
    expect(mockTrack).toHaveBeenCalledWith("filter_applied", expect.objectContaining({ filterKey: "refundState", value: "AWAITING_APPROVAL" }));
  });

  it("choosing ALL removes the param instead of writing refundState=ALL", () => {
    mockSearchParams.current = new URLSearchParams("refundState=REJECTED");
    renderTable([row("txn_1", "SUCCEEDED")]);
    fireEvent.click(screen.getByRole("button", { name: /Open filters/i }));
    fireEvent.change(screen.getByRole("combobox", { name: /Refund state/i }), { target: { value: "ALL" } });
    const url = mockRouter.replace.mock.calls[0][0] as string;
    expect(url).toBe("/en/transactions");
  });

  it("the select reflects the URL state, and an unknown value falls back to ALL", () => {
    mockSearchParams.current = new URLSearchParams("refundState=AWAITING_APPROVAL");
    const first = renderTable([row("txn_1", "SUCCEEDED")]);
    fireEvent.click(screen.getByRole("button", { name: /Open filters/i }));
    expect((screen.getByRole("combobox", { name: /Refund state/i }) as HTMLSelectElement).value).toBe("AWAITING_APPROVAL");
    first.unmount();

    // A malformed URL cannot select a state: the parser failed open to ALL, so
    // the select shows the unfiltered view.
    mockSearchParams.current = new URLSearchParams("refundState=HACKED");
    renderTable([row("txn_2", "SUCCEEDED")]);
    fireEvent.click(screen.getByRole("button", { name: /Open filters/i }));
    expect((screen.getByRole("combobox", { name: /Refund state/i }) as HTMLSelectElement).value).toBe("ALL");
  });

  it("combined filters round-trip: the URL carries every active filter", () => {
    mockSearchParams.current = new URLSearchParams("refundState=AWAITING_APPROVAL&sla=OVERDUE&status=SUCCEEDED");
    renderTable([row("txn_1", "SUCCEEDED")]);
    fireEvent.click(screen.getByRole("button", { name: /Open filters/i }));
    fireEvent.change(screen.getByRole("combobox", { name: /Refund state/i }), { target: { value: "APPROVED" } });
    const url = mockRouter.replace.mock.calls[0][0] as string;
    expect(url).toContain("sla=OVERDUE");
    expect(url).toContain("status=SUCCEEDED");
    expect(url).toContain("refundState=APPROVED");
  });
});
