import * as React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import type { RefundRequest, RefundState } from "@/server/data/transactions";

// Wave 4 §4 — the dual-control refund UI (JRN-003). These tests pin the
// interaction contract the Playwright journey will drive end-to-end:
// initiate (Role A) → decide (Role B), permission-aware, with the same-actor
// refusal surfaced as copy before the server has to refuse.

const mockRouter = { push: vi.fn(), replace: vi.fn(), refresh: vi.fn() };
const mockRequestAction = vi.fn();
const mockApproveAction = vi.fn();
const mockRejectAction = vi.fn();
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
  requestRefundAction: (...a: unknown[]) => mockRequestAction(...(a as [])),
  approveRefundAction: (...a: unknown[]) => mockApproveAction(...(a as [])),
  rejectRefundAction: (...a: unknown[]) => mockRejectAction(...(a as [])),
}));

import { RefundWorkflow, RefundDecisionPanel } from "./refund-workflow";

function refundRequest(partial: Partial<RefundRequest> = {}): RefundRequest {
  return {
    id: "txn_1_refund_0",
    amount: 500_000,
    reason: "Duplicate charge",
    requestedBy: "persona_agus",
    requestedAt: "2026-09-12T08:00:00.000Z",
    decidedBy: null,
    decidedAt: null,
    ...partial,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("RefundWorkflow — initiation (Role A)", () => {
  it("NONE renders the request button; the dialog submits id/amount/reason to the existing action", async () => {
    mockRequestAction.mockResolvedValue({ status: "success", message: "Refund requested", data: { awaitingApproval: true } });
    const { container } = render(
      <RefundWorkflow transactionId="txn_1" refundState="NONE" refundable={500_000} currency="IDR" canRequest />,
    );
    fireEvent.click(screen.getByTestId("refund-request-button"));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(screen.getByLabelText("Amount"), { target: { value: "500000" } });
    fireEvent.change(screen.getByLabelText("Reason"), { target: { value: "Duplicate charge" } });
    fireEvent.click(screen.getByRole("button", { name: "Request refund" }));
    await waitFor(() => expect(mockRequestAction).toHaveBeenCalledTimes(1));
    const fd = mockRequestAction.mock.calls[0][1] as FormData;
    expect(fd.get("id")).toBe("txn_1");
    expect(fd.get("amount")).toBe("500000");
    expect(fd.get("reason")).toBe("Duplicate charge");
    // Success feedback + ledger refresh
    await waitFor(() => expect(mockToastSuccess).toHaveBeenCalled());
    expect(mockRouter.refresh).toHaveBeenCalled();
    // ANA-003 with journey/screen traceability
    expect(mockTrackEvent).toHaveBeenCalledWith(
      "refund_requested",
      expect.objectContaining({ amount: 500000, currency: "IDR", jrn: "JRN-003", scr: "SCR-006" }),
    );
    void container;
  });

  it("AWAITING_APPROVAL replaces the initiation button with the state pill", () => {
    render(<RefundWorkflow transactionId="txn_1" refundState="AWAITING_APPROVAL" refundable={0} currency="IDR" canRequest />);
    expect(screen.getByTestId("refund-state-awaiting_approval")).toHaveTextContent("Awaiting second approval");
    expect(screen.queryByTestId("refund-request-button")).not.toBeInTheDocument();
  });

  it("a viewer without refund permission sees a disabled, explained button", async () => {
    render(
      <RefundWorkflow transactionId="txn_1" refundState="NONE" refundable={500_000} currency="IDR" canRequest={false} />,
    );
    const button = screen.getByTestId("refund-request-button");
    // The trigger carries aria-disabled + the reason (render-prop buttons
    // expose disabled state through ARIA, which is what AT announces too).
    expect(button).toHaveAttribute("aria-disabled", "true");
    expect(button).toHaveAttribute("title", "Requires refund permission");
    // And it must not open the dialog.
    fireEvent.click(button);
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});

describe("RefundDecisionPanel — decision (Role B)", () => {
  const base = {
    transactionId: "txn_1",
    currency: "IDR",
    refundRequest: refundRequest(),
  };

  it("different actor with refund.execute can approve — through the existing action", async () => {
    mockApproveAction.mockResolvedValue({ status: "success", message: "Refund approved and issued." });
    render(<RefundDecisionPanel {...base} refundState={"AWAITING_APPROVAL" as RefundState} viewerActorId="persona_hendri" canApprove />);
    expect(screen.getByTestId("refund-decision-panel")).toBeInTheDocument();
    expect(screen.getByText("Duplicate charge")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("refund-approve"));
    await waitFor(() => expect(mockApproveAction).toHaveBeenCalledTimes(1));
    const fd = mockApproveAction.mock.calls[0][1] as FormData;
    expect(fd.get("id")).toBe("txn_1");
    // The actor is NEVER in the form — it comes from the session server-side.
    expect(fd.has("approvedBy")).toBe(false);
    await waitFor(() => expect(mockToastSuccess).toHaveBeenCalled());
    expect(mockRouter.refresh).toHaveBeenCalled();
    expect(mockTrackEvent).toHaveBeenCalledWith(
      "refund_executed",
      expect.objectContaining({ actor_diff: true, jrn: "JRN-003", scr: "SCR-006" }),
    );
  });

  it("the requester is blocked from approving with an explanation — before the server has to refuse", () => {
    render(<RefundDecisionPanel {...base} refundState={"AWAITING_APPROVAL" as RefundState} viewerActorId="persona_agus" canApprove />);
    // agus requested it AND (hypothetically) holds refund.execute — the UI must
    // still refuse the self-approval (BE-002 mirrored as copy).
    expect(screen.getByTestId("refund-self-block")).toHaveTextContent(/a different approver/i);
    expect(screen.queryByTestId("refund-approve")).not.toBeInTheDocument();
    expect(screen.queryByTestId("refund-reject")).not.toBeInTheDocument();
  });

  it("a viewer without refund.execute sees who is blocking — journey visible, no dead end", () => {
    render(<RefundDecisionPanel {...base} refundState={"AWAITING_APPROVAL" as RefundState} viewerActorId="persona_nadia" canApprove={false} />);
    expect(screen.getByTestId("refund-waiting")).toHaveTextContent(/Waiting on Finance Admin or Owner/i);
    expect(screen.queryByTestId("refund-approve")).not.toBeInTheDocument();
  });

  it("reject routes through rejectRefundAction and reports no money moved", async () => {
    mockRejectAction.mockResolvedValue({ status: "success", message: "Refund rejected — no money moved." });
    render(<RefundDecisionPanel {...base} refundState={"AWAITING_APPROVAL" as RefundState} viewerActorId="persona_hendri" canApprove />);
    fireEvent.click(screen.getByTestId("refund-reject"));
    await waitFor(() => expect(mockRejectAction).toHaveBeenCalledTimes(1));
    const fd = mockRejectAction.mock.calls[0][1] as FormData;
    expect(fd.get("id")).toBe("txn_1");
    await waitFor(() => expect(mockToastSuccess).toHaveBeenCalledWith("Refund rejected — no money moved."));
  });

  it("a server-side same-actor refusal surfaces as an error toast, not a crash", async () => {
    mockApproveAction.mockResolvedValue({
      status: "error",
      message: "Requester cannot be the approver — a different user must approve this refund.",
    });
    render(<RefundDecisionPanel {...base} refundState={"AWAITING_APPROVAL" as RefundState} viewerActorId="persona_hendri" canApprove />);
    fireEvent.click(screen.getByTestId("refund-approve"));
    await waitFor(() => expect(mockToastError).toHaveBeenCalledWith(expect.stringContaining("Requester cannot be the approver")));
    // The panel stays mounted — the requester record is untouched.
    expect(screen.getByTestId("refund-decision-panel")).toBeInTheDocument();
  });

  it("terminal states render the recorded decision, not decision controls", () => {
    const decided = refundRequest({ decidedBy: "persona_hendri", decidedAt: "2026-09-12T09:30:00.000Z" });
    render(
      <RefundDecisionPanel
        transactionId="txn_1"
        refundState="APPROVED"
        refundRequest={decided}
        currency="IDR"
        viewerActorId="persona_hendri"
        canApprove
      />,
    );
    expect(screen.getByTestId("refund-state-approved")).toBeInTheDocument();
    expect(screen.getByText("persona_hendri")).toBeInTheDocument();
    expect(screen.queryByTestId("refund-approve")).not.toBeInTheDocument();
  });

  it("renders nothing when no refund request exists (the header button covers initiation)", () => {
    const { container } = render(
      <RefundDecisionPanel
        transactionId="txn_1"
        refundState="NONE"
        refundRequest={null}
        currency="IDR"
        viewerActorId="persona_hendri"
        canApprove
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
