import * as React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

/**
 * The balance dialogs drive real server actions through <form> submission,
 * so these tests assert on the actual FormData the action receives — the
 * controlled inputs must carry `name` or the form submits nothing.
 */

const {
  mockSearchParams,
  mockRouter,
  mockToast,
  mockTopUpBalanceAction,
  mockWithdrawBalanceAction,
} = vi.hoisted(() => ({
  mockSearchParams: { current: new URLSearchParams() },
  mockRouter: { replace: vi.fn(), push: vi.fn() },
  mockToast: { success: vi.fn(), error: vi.fn() },
  mockTopUpBalanceAction: vi.fn(),
  mockWithdrawBalanceAction: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => mockSearchParams.current,
}));

vi.mock("@/i18n/navigation", () => ({
  Link: (props: Record<string, unknown>) => React.createElement("a", props),
  usePathname: () => "/en/balance",
  useRouter: () => mockRouter,
}));

vi.mock("sonner", () => ({ toast: mockToast }));

vi.mock("@/server/actions/balance", () => ({
  topUpBalanceAction: mockTopUpBalanceAction,
  withdrawBalanceAction: mockWithdrawBalanceAction,
}));

import { TopUpDialog } from "./top-up-dialog";
import { WithdrawDialog } from "./withdraw-dialog";

const ACCOUNTS = [
  {
    id: "acct_bca_1234",
    bank: "Bank Central Asia",
    holder: "PT Kinetic Commerce",
    masked: "**** 1234",
    verified: true,
  },
  {
    id: "acct_bni_0000",
    bank: "Bank Negara Indonesia",
    holder: "PT Kinetic Commerce",
    masked: "**** 0000",
    verified: false,
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  mockSearchParams.current = new URLSearchParams();
});

describe("TopUpDialog", () => {
  it("stays closed without ?topup=1 and renders the trigger", () => {
    render(<TopUpDialog />);
    expect(screen.getByRole("button", { name: "Top Up" })).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("submits the amount and method as FormData and shows the new balance on success", async () => {
    mockSearchParams.current = new URLSearchParams("topup=1");
    mockTopUpBalanceAction.mockResolvedValue({
      status: "success",
      message: "Added Rp 25.000.000 via BCA Virtual Account.",
      data: { available: 2_500_000_000 },
    });

    render(<TopUpDialog />);
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("Top up your balance");

    // Every top-up rail from lib/balance-status is offered.
    const options = screen.getAllByRole("option");
    expect(options).toHaveLength(5);
    expect(options[0]).toHaveTextContent("BCA Virtual Account");

    // Nothing to submit yet.
    const submit = screen.getByRole("button", { name: "Add to balance" });
    expect(submit).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Amount"), { target: { value: "25,000,000" } });
    expect(submit).toBeEnabled();
    fireEvent.click(submit);

    // The action received the real values — no nameless inputs.
    expect(mockTopUpBalanceAction).toHaveBeenCalledTimes(1);
    const formData = mockTopUpBalanceAction.mock.calls[0][1] as FormData;
    expect(formData.get("amount")).toBe("25,000,000");
    expect(formData.get("method")).toBe("BCA Virtual Account");

    await screen.findByText("New available balance");
    expect(dialog).toHaveTextContent("Rp 2.500.000.000");
    expect(screen.getByRole("button", { name: "Done" })).toBeInTheDocument();
    expect(mockToast.success).toHaveBeenCalled();
  });
});

describe("WithdrawDialog", () => {
  it("defaults to the verified account, disables the unverified one, and submits the batch", async () => {
    mockSearchParams.current = new URLSearchParams("withdraw=1");
    mockWithdrawBalanceAction.mockResolvedValue({
      status: "success",
      message: "Withdrew Rp 1.000.000 — batch BATCH-2026-09-015 paid.",
      data: { batchId: "BATCH-2026-09-015" },
    });

    render(<WithdrawDialog accounts={ACCOUNTS} available={2_212_783_280} />);
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("Withdraw from your balance");

    // The verified BCA account is selected; BNI is still verifying.
    expect(screen.getByRole("combobox")).toHaveValue("acct_bca_1234");
    const options = screen.getAllByRole("option");
    expect(options[1]).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Amount"), { target: { value: "1,000,000" } });
    fireEvent.click(screen.getByRole("button", { name: "Withdraw" }));

    const formData = mockWithdrawBalanceAction.mock.calls[0][1] as FormData;
    expect(formData.get("amount")).toBe("1,000,000");
    expect(formData.get("accountId")).toBe("acct_bca_1234");

    await screen.findByText("New available balance");
    expect(dialog).toHaveTextContent("BATCH-2026-09-015");
    expect(screen.getByRole("link", { name: "View batch" })).toHaveAttribute(
      "href",
      "/payouts/BATCH-2026-09-015"
    );
    expect(mockToast.success).toHaveBeenCalled();
  });

  it("shows the rejection inline with a link to the rejected batch", async () => {
    mockSearchParams.current = new URLSearchParams("withdraw=1");
    mockWithdrawBalanceAction.mockResolvedValue({
      status: "error",
      message: "The transfer to the destination account was rejected — insufficient funds at the issuing bank. No funds left your balance.",
      data: { batchId: "BATCH-2026-09-016" },
    });

    render(<WithdrawDialog accounts={ACCOUNTS} available={2_212_783_280} />);
    await screen.findByRole("dialog");

    fireEvent.change(screen.getByLabelText("Amount"), { target: { value: "500,000" } });
    fireEvent.click(screen.getByRole("button", { name: "Withdraw" }));

    expect(
      await screen.findByText(/was rejected — insufficient funds/)
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /View the rejected batch/ })).toHaveAttribute(
      "href",
      "/payouts/BATCH-2026-09-016"
    );
    expect(mockToast.error).toHaveBeenCalled();
  });
});
