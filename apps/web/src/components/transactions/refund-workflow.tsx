"use client";

import * as React from "react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { toast } from "sonner";
import { useRouter } from "@/i18n/navigation";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";
import { Card } from "@/components/ui/card";
import {
  requestRefundAction,
  approveRefundAction,
  rejectRefundAction,
  type ActionState,
} from "@/server/actions/transactions";
import { trackEvent } from "@/lib/analytics-events";
import { formatDateTime, formatMoney } from "@/lib/format";
import type { RefundRequest, RefundState } from "@/server/data/transactions";

// Wave 4 §4 — two-phase refund UI (JRN-003, spec §9 dual control).
//
// The server owns the business logic: `requestRefund` moves no money and
// records the requester; `approveRefund` refuses the initiator before
// anything settles; `rejectRefund` moves nothing. This component only makes
// that state machine visible and drivable:
//
//   refundState NONE     -> "Request refund" (Role A) — opens the request dialog
//   AWAITING_APPROVAL    -> decision panel (Role B): Approve / Reject, or an
//                           honest explanation when the viewer cannot decide
//   APPROVED / REJECTED  -> the recorded decision, and a new request when
//                           refundable amount remains
//
// Permissions are computed server-side from the session and passed in as
// flags — the client never widens its own authority, and every action goes
// through the existing server actions (no duplicated logic here).

const initialState: ActionState = { status: "idle", message: "" };
const initialRequestState: ActionState<{ awaitingApproval: boolean }> = { status: "idle", message: "" };

const REFUND_STATE_LABELS: Record<RefundState, string> = {
  NONE: "No refund",
  AWAITING_APPROVAL: "Awaiting second approval",
  APPROVED: "Refund approved",
  REJECTED: "Refund rejected",
};

const REFUND_STATE_TONES: Record<RefundState, string> = {
  NONE: "text-[var(--on-surface-variant)] border-[var(--outline-variant)]",
  AWAITING_APPROVAL: "text-[var(--pending-status)] border-[var(--pending-status)]/40 bg-[var(--pending-status)]/8",
  APPROVED: "text-[var(--success-status)] border-[var(--success-status)]/40 bg-[var(--success-status)]/8",
  REJECTED: "text-[var(--failed-status)] border-[var(--failed-status)]/40 bg-[var(--failed-status)]/8",
};

function RefundStatePill({ state }: { state: RefundState }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold whitespace-nowrap ${REFUND_STATE_TONES[state]}`}
      data-testid={`refund-state-${state.toLowerCase()}`}
      data-refund-state={state}
    >
      <span className="material-symbols-outlined text-[13px]" aria-hidden="true">
        {state === "AWAITING_APPROVAL" ? "hourglass_top" : state === "APPROVED" ? "check_circle" : state === "REJECTED" ? "cancel" : "payments"}
      </span>
      {REFUND_STATE_LABELS[state]}
    </span>
  );
}

function RequestSubmit({ disabled }: { disabled?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      disabled={pending || disabled}
      className="bg-[var(--failed-status)] text-white hover:opacity-90 disabled:opacity-60 min-w-[9rem]"
    >
      {pending ? (
        <span className="flex items-center gap-2">
          <Spinner className="size-4" /> Requesting…
        </span>
      ) : (
        "Request refund"
      )}
    </Button>
  );
}

/**
 * Header control: the Role-A entry point. Renders the state when a request is
 * in flight or decided, and the request dialog when a new request is possible.
 */
export function RefundWorkflow({
  transactionId,
  refundState,
  refundable,
  currency,
  disabled = false,
  canRequest,
  autoOpen = false,
}: {
  transactionId: string;
  refundState: RefundState;
  refundable: number;
  currency: string;
  disabled?: boolean;
  /** Viewer holds refund.prepare or refund.execute (server-derived). */
  canRequest: boolean;
  /** `?refund=1` deep link from the ledger row menu opens the dialog directly. */
  autoOpen?: boolean;
}) {
  const [open, setOpen] = React.useState(autoOpen && !disabled && refundState === "NONE");
  const [amount, setAmount] = React.useState(refundable > 0 ? String(refundable) : "");
  const [state, formAction] = useActionState(requestRefundAction, initialRequestState);
  const router = useRouter();
  const handled = React.useRef<ActionState<{ awaitingApproval: boolean }> | null>(null);

  React.useEffect(() => {
    if (state === handled.current || state.status === "idle") return;
    handled.current = state;
    if (state.status === "success") {
      setOpen(false);
      toast.success(state.message);
      trackEvent("refund_requested", {
        amount: Number(amount.replace(/[^0-9.]/g, "")) || undefined,
        currency,
        jrn: "JRN-003",
        scr: "SCR-006",
      });
      router.refresh();
    } else {
      toast.error(state.message);
    }
  }, [state, router, currency, amount]);

  const showRequestButton = refundState === "NONE" || ((refundState === "APPROVED" || refundState === "REJECTED") && refundable > 0);

  if (!showRequestButton) {
    // A request is awaiting (or the refund fully consumed) — the state lives in
    // the decision panel; the header shows the pill so it is visible at a glance.
    return <RefundStatePill state={refundState} />;
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button
            variant="outline"
            disabled={disabled}
            aria-disabled={disabled}
            title={disabled ? "This payment cannot be refunded" : !canRequest ? "Requires refund permission" : undefined}
            data-testid="refund-request-button"
            className="border-[var(--failed-status)]/40 text-[var(--failed-status)] hover:bg-[var(--failed-status)]/5 disabled:opacity-60"
          >
            Request refund
          </Button>
        }
      />
      <DialogContent className="sm:max-w-md bg-[var(--surface)]">
        <DialogHeader>
          <DialogTitle className="headline-md text-[var(--on-surface)]">Request a refund</DialogTitle>
          <DialogDescription className="body-sm text-[var(--on-surface-variant)]">
            No money moves yet. The request goes to a second approver (Finance Admin or Owner) — up to{" "}
            <span className="data-mono">{formatMoney(refundable, currency)}</span> can be returned.
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="id" value={transactionId} />
          <div className="space-y-2">
            <Label htmlFor="refund-request-amount">Amount</Label>
            <Input
              id="refund-request-amount"
              name="amount"
              inputMode="numeric"
              required
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              aria-describedby="refund-request-amount-hint"
            />
            <p id="refund-request-amount-hint" className="text-xs text-[var(--on-surface-variant)]">
              Maximum {formatMoney(refundable, currency)}.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="refund-request-reason">Reason</Label>
            <Textarea id="refund-request-reason" name="reason" rows={3} maxLength={200} placeholder="Give the approver a reason (required)" required />
          </div>
          <DialogFooter className="gap-2">
            <DialogClose render={<Button type="button" variant="outline" className="border-[var(--border-subtle)]" />}>Cancel</DialogClose>
            <RequestSubmit />
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DecisionSubmit({ kind }: { kind: "approve" | "reject" }) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      disabled={pending}
      data-testid={kind === "approve" ? "refund-approve" : "refund-reject"}
      className={
        kind === "approve"
          ? "bg-[var(--success-status)] text-white hover:opacity-90 disabled:opacity-60 min-w-[8.5rem]"
          : "border-[var(--failed-status)]/40 text-[var(--failed-status)] hover:bg-[var(--failed-status)]/5 disabled:opacity-60"
      }
    >
      {pending ? (
        <span className="flex items-center gap-2">
          <Spinner className="size-4" /> {kind === "approve" ? "Approving…" : "Rejecting…"}
        </span>
      ) : kind === "approve" ? (
        "Approve refund"
      ) : (
        "Reject"
      )}
    </Button>
  );
}

/**
 * The Role-B surface. Rendered in the detail column whenever a request exists:
 * the recorded decision for terminal states, the Approve/Reject controls for
 * the awaiting state — with an honest explanation (never a dead button) when
 * the viewer is the requester or lacks the permission.
 */
export function RefundDecisionPanel({
  transactionId,
  refundState,
  refundRequest,
  currency,
  viewerActorId,
  canApprove,
}: {
  transactionId: string;
  refundState: RefundState;
  refundRequest: RefundRequest | null;
  currency: string;
  /** Session actor id (persona-aware in dev/E2E). Null when unauthenticated. */
  viewerActorId: string | null;
  /** Viewer holds refund.execute (server-derived). */
  canApprove: boolean;
}) {
  const [approveState, approveAction] = useActionState(approveRefundAction, initialState);
  const [rejectState, rejectAction] = useActionState(rejectRefundAction, initialState);
  const router = useRouter();
  const handled = React.useRef<{ approve: ActionState | null; reject: ActionState | null }>({ approve: null, reject: null });

  React.useEffect(() => {
    if (approveState !== handled.current.approve && approveState.status !== "idle") {
      handled.current.approve = approveState;
      if (approveState.status === "success") {
        toast.success(approveState.message);
        trackEvent("refund_executed", { amount: refundRequest?.amount, currency, actor_diff: true, jrn: "JRN-003", scr: "SCR-006" });
        router.refresh();
      } else {
        toast.error(approveState.message);
      }
    }
    if (rejectState !== handled.current.reject && rejectState.status !== "idle") {
      handled.current.reject = rejectState;
      if (rejectState.status === "success") {
        toast.success(rejectState.message);
        router.refresh();
      } else {
        toast.error(rejectState.message);
      }
    }
  }, [approveState, rejectState, router, currency, refundRequest?.amount]);

  if (refundState === "NONE" || !refundRequest) return null;

  const isRequester = viewerActorId !== null && refundRequest.requestedBy === viewerActorId;
  const canDecide = canApprove && !isRequester && refundState === "AWAITING_APPROVAL";

  return (
    <Card className="bg-[var(--surface)] border-[var(--border-subtle)] p-5 shadow-sm" data-testid="refund-decision-panel">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="headline-md text-[var(--on-surface)]">Dual-control refund</h2>
        <RefundStatePill state={refundState} />
      </div>

      <div className="mt-4 divide-y divide-[var(--border-subtle)]">
        <div className="flex items-start justify-between gap-4 py-2.5">
          <span className="label-caps text-[var(--on-surface-variant)] shrink-0">Amount</span>
          <span className="data-mono text-[var(--on-surface)]">{formatMoney(refundRequest.amount, currency)}</span>
        </div>
        <div className="flex items-start justify-between gap-4 py-2.5">
          <span className="label-caps text-[var(--on-surface-variant)] shrink-0">Requested by</span>
          <span className="text-right break-words body-sm text-[var(--on-surface)]">
            <span className="data-mono">{refundRequest.requestedBy}</span>
            <span className="block text-xs text-[var(--on-surface-variant)]">{formatDateTime(refundRequest.requestedAt)}</span>
          </span>
        </div>
        {refundRequest.reason ? (
          <div className="flex items-start justify-between gap-4 py-2.5">
            <span className="label-caps text-[var(--on-surface-variant)] shrink-0">Reason</span>
            <span className="text-right break-words body-sm text-[var(--on-surface)]">{refundRequest.reason}</span>
          </div>
        ) : null}
        {refundRequest.decidedBy ? (
          <div className="flex items-start justify-between gap-4 py-2.5">
            <span className="label-caps text-[var(--on-surface-variant)] shrink-0">{refundState === "APPROVED" ? "Approved by" : "Rejected by"}</span>
            <span className="text-right break-words body-sm text-[var(--on-surface)]">
              <span className="data-mono">{refundRequest.decidedBy}</span>
              <span className="block text-xs text-[var(--on-surface-variant)]">
                {refundRequest.decidedAt ? formatDateTime(refundRequest.decidedAt) : null}
              </span>
            </span>
          </div>
        ) : null}
      </div>

      {refundState === "AWAITING_APPROVAL" ? (
        <div className="mt-4">
          {canDecide ? (
            <div className="flex flex-wrap items-center gap-2" data-testid="refund-decision-actions">
              <form action={approveAction}>
                <input type="hidden" name="id" value={transactionId} />
                <DecisionSubmit kind="approve" />
              </form>
              <form action={rejectAction}>
                <input type="hidden" name="id" value={transactionId} />
                <DecisionSubmit kind="reject" />
              </form>
            </div>
          ) : isRequester ? (
            // BE-002 mirrored as copy: the server refuses same-actor approval;
            // the UI says so before the user tries.
            <p className="body-sm text-[var(--on-surface-variant)]" data-testid="refund-self-block">
              <span className="material-symbols-outlined text-[16px] align-[-3px] mr-1" aria-hidden="true">
                lock
              </span>
              You requested this refund — a different approver (Finance Admin or Owner) must decide it.
            </p>
          ) : (
            <p className="body-sm text-[var(--on-surface-variant)]" data-testid="refund-waiting">
              <span className="material-symbols-outlined text-[16px] align-[-3px] mr-1" aria-hidden="true">
                hourglass_top
              </span>
              Waiting on Finance Admin or Owner to approve or reject this refund.
            </p>
          )}
        </div>
      ) : null}
    </Card>
  );
}
