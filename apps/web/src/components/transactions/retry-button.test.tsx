import * as React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";

// CMP-020 on the retry path: a versioned retry that loses the race must open
// the ConflictDialog with the server's latest state, must not auto-apply, and
// the retry-after-review must be sent against the reviewed (latest) version.

const mockRouter = { push: vi.fn(), replace: vi.fn(), refresh: vi.fn() };
const mockRetryAction = vi.fn();
const mockToastSuccess = vi.fn();
const mockToastError = vi.fn();
const mockTrackEvent = vi.fn();

vi.mock("@/i18n/navigation", () => ({
  useRouter: () => mockRouter,
  usePathname: () => "/en/transactions",
}));
vi.mock("sonner", () => ({
  toast: { success: (...a: unknown[]) => mockToastSuccess(...(a as [])), error: (...a: unknown[]) => mockToastError(...(a as [])) },
}));
vi.mock("@/lib/analytics-events", () => ({
  trackEvent: (...args: unknown[]) => mockTrackEvent(...args),
}));
vi.mock("@/server/actions/transactions", () => ({
  retryTransactionAction: (...a: unknown[]) => mockRetryAction(...(a as [])),
}));

import { RetryButton } from "./retry-button";

function conflictResponse() {
  return {
    status: "error" as const,
    message: "This payment changed since you opened it — review the latest state before retrying.",
    conflict: {
      description: "The payment was modified by someone else while you were viewing it.",
      currentState: { status: "PROCESSING", "last updated": "2026-09-12T10:00:00.000Z", "refund state": "NONE" },
      detectedAt: new Date().toISOString(),
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("RetryButton — 409 conflict recovery (CMP-020)", () => {
  it("sends expectedUpdatedAt (the rendered version) with the first attempt", async () => {
    mockRetryAction.mockResolvedValue({ status: "success", message: "Payment re-submitted to the processor" });
    render(<RetryButton id="txn_1" expectedUpdatedAt="2026-09-12T08:00:00.000Z" />);
    fireEvent.click(screen.getByTestId("retry-payment-button"));
    await waitFor(() => expect(mockRetryAction).toHaveBeenCalledTimes(1));
    const fd = mockRetryAction.mock.calls[0][1] as FormData;
    expect(fd.get("id")).toBe("txn_1");
    expect(fd.get("expectedUpdatedAt")).toBe("2026-09-12T08:00:00.000Z");
    expect(mockToastSuccess).toHaveBeenCalled();
  });

  it("a CONFLICT opens the dialog with the latest state and does NOT auto-apply", async () => {
    mockRetryAction.mockResolvedValue(conflictResponse());
    render(<RetryButton id="txn_1" expectedUpdatedAt="2026-09-12T08:00:00.000Z" />);
    fireEvent.click(screen.getByTestId("retry-payment-button"));
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("Data Conflict Detected");
    expect(dialog).toHaveTextContent("The payment was modified by someone else while you were viewing it.");
    // The latest server state is visible for review…
    expect(dialog).toHaveTextContent("PROCESSING");
    expect(dialog).toHaveTextContent("2026-09-12T10:00:00.000Z");
    // …and exactly ONE action call happened — no silent re-submission.
    expect(mockRetryAction).toHaveBeenCalledTimes(1);
    expect(mockToastError).not.toHaveBeenCalled();
  });

  it("retry after review re-sends against the reviewed latest version and recovers", async () => {
    // Deferred first response so the test controls exactly when the conflict
    // lands relative to React's transition flushing (act).
    let resolveFirst!: (v: unknown) => void;
    mockRetryAction.mockImplementationOnce(() => new Promise((res) => { resolveFirst = res; }));
    mockRetryAction.mockResolvedValueOnce({ status: "success", message: "Payment re-submitted to the processor" });

    render(<RetryButton id="txn_1" expectedUpdatedAt="2026-09-12T08:00:00.000Z" />);
    fireEvent.click(screen.getByTestId("retry-payment-button"));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    resolveFirst(conflictResponse());
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    // The conflict is on screen, reviewed; the retry affordance is armed.
    const retryLatest = screen.getByRole("button", { name: /retry with latest/i });
    expect(retryLatest).toBeEnabled();
    fireEvent.click(retryLatest);
    await waitFor(() => expect(mockRetryAction).toHaveBeenCalledTimes(2));
    const fd = mockRetryAction.mock.calls[1][1] as FormData;
    // The reviewed version — the value the server reported as latest.
    expect(fd.get("expectedUpdatedAt")).toBe("2026-09-12T10:00:00.000Z");
    await waitFor(() => {
      expect(mockToastSuccess).toHaveBeenCalledWith("Payment re-submitted to the processor");
      expect(mockTrackEvent).toHaveBeenCalledWith("conflict_recovered", expect.objectContaining({ entity_type: "transaction", resolution: "retry_accepted" }));
    });
    expect(mockRouter.refresh).toHaveBeenCalled();
  });

  it("dismissing the dialog never retries — it just syncs the page to the latest state", async () => {
    mockRetryAction.mockResolvedValue(conflictResponse());
    render(<RetryButton id="txn_1" expectedUpdatedAt="2026-09-12T08:00:00.000Z" />);
    fireEvent.click(screen.getByTestId("retry-payment-button"));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(mockRetryAction).toHaveBeenCalledTimes(1); // unchanged — no auto-apply
    // The stale view behind the dialog is refreshed so it cannot persist.
    expect(mockRouter.refresh).toHaveBeenCalled();
  });

  it("a plain failure (no conflict) stays a toast — the dialog is conflict-only", async () => {
    mockRetryAction.mockResolvedValue({ status: "error", message: "Transaction not found." });
    render(<RetryButton id="txn_missing" />);
    fireEvent.click(screen.getByTestId("retry-payment-button"));
    await waitFor(() => expect(mockToastError).toHaveBeenCalledWith("Transaction not found."));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
