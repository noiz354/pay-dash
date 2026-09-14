"use server";

import { revalidatePath } from "next/cache";
import { OrgContextError } from "@/server/services/org-context";
import { requireStrictOrgContext } from "@/server/services/session-org-context";
import { recordInbound, getWebhookEvent } from "@/server/data/webhooks";
import { SIMULATABLE_WEBHOOK_EVENTS } from "@/lib/webhook-status";
import type { ActionState } from "./payouts";

export type { ActionState };

// Server Actions for the webhook log (ADR-0014). TEST MODE stands in for the
// provider: simulation and replay run the SAME recordInbound pipeline the
// route uses (dedupe by event id, unhandled detection) — only the
// x-callback-token auth step is skipped, the same relationship as
// simulate-payment skipping channel capture.

function revalidateWebhooks(id?: string) {
  revalidatePath("/[locale]/webhooks", "page");
  revalidatePath("/webhooks");
  if (id) {
    revalidatePath(`/[locale]/webhooks/${id}`, "page");
    revalidatePath(`/webhooks/${id}`);
  }
}

/**
 * Audit finding S-02 — the TEST-MODE webhook tools wrote to the operational log with no authorization.
 *
 * `simulateWebhookAction` injects a synthetic callback through the shared inbound pipeline, so any caller could add fabricated "successful payment" events to the log that `/webhooks` and `/system` present as operational data — the same harm as R-07, but caused rather than merely displayed. `replayWebhookAction` re-POSTs a previously received callback, re-running the pipeline against a real payload.
 *
 * `provider.connect.test` is the existing permission for exercising an integration without moving money (OWNER and DEVELOPER). Both actions are labelled TEST MODE in this file and neither is a merchant workflow, so a provider-test privilege matches rather than `settings.manage`.
 *
 * STILL OPEN (roadmap Phase 3): the log they write is process-global, and R-07's provenance marker distinguishes seeded rows from real ones but not injected rows from either. Marking `source: "simulate"` / `"replay"` rows in the UI is a follow-up.
 */
async function requireWebhookSimulation(): Promise<ActionState<never> | null> {
  try {
    await requireStrictOrgContext("provider.connect.test");
    return null;
  } catch (e) {
    if (e instanceof OrgContextError) {
      return {
        status: "error",
        message: e.message.includes("Authentication")
          ? "Sign in to simulate webhooks."
          : "You don't have permission to simulate or replay webhooks.",
      };
    }
    return { status: "error", message: e instanceof Error ? e.message : "Sign in to simulate webhooks." };
  }
}

function newEventId() {
  return `evt_${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`;
}

// TEST MODE: stand in for Xendit and POST a callback through the shared
// inbound pipeline. The event type is one of SIMULATABLE_WEBHOOK_EVENTS
// (including the deliberately-unknown "invoice.issued" demo); `reference`
// is an optional ledger reference to embed in the payload.
export async function simulateWebhookAction(
  _prev: ActionState<{ id: string; eventId: string; deduped: boolean }> | undefined,
  formData: FormData
): Promise<ActionState<{ id: string; eventId: string; deduped: boolean }>> {
  const denied = await requireWebhookSimulation();
  if (denied) return denied;

  const event = String(formData.get("event") ?? "");
  const reference = String(formData.get("reference") ?? "").trim();

  if (!(SIMULATABLE_WEBHOOK_EVENTS as readonly string[]).includes(event)) {
    return { status: "error", message: "Pick an event type to simulate." };
  }

  const eventId = newEventId();
  const created = new Date().toISOString();
  const payload = {
    id: eventId,
    event,
    created,
    data: {
      id: reference || `req_${Date.now().toString(36)}`,
      event,
      status: "succeeded",
      simulated: true,
    },
  };

  const { event: row, deduped } = recordInbound({ eventId, type: event, payload, source: "simulate" });
  revalidateWebhooks(row.id);
  return {
    status: "success",
    message: deduped
      ? `Event ${eventId} was already received — logged as a duplicate.`
      : `Callback ${event} recorded — ${eventId}.`,
    data: { id: row.id, eventId, deduped },
  };
}

// TEST MODE: re-POST a previously received callback with the same event id.
// The shared pipeline logs it as DUPLICATED — the idempotency guarantee made
// visible (QUEUES.md verification step).
export async function replayWebhookAction(
  _prev: ActionState<{ id: string; eventId: string }> | undefined,
  formData: FormData
): Promise<ActionState<{ id: string; eventId: string }>> {
  const denied = await requireWebhookSimulation();
  if (denied) return denied;

  const id = String(formData.get("id") ?? "").trim();
  const original = getWebhookEvent(id);
  if (!original) return { status: "error", message: "Webhook event not found." };
  if (original.status === "REJECTED") {
    return { status: "error", message: "Rejected callbacks have no usable payload to replay." };
  }

  const { event: row } = recordInbound({
    eventId: original.eventId,
    type: original.type,
    payload: original.payload,
    source: "replay",
  });
  revalidateWebhooks(row.id);
  return {
    status: "success",
    message: `Replayed ${original.eventId} — logged as a duplicate (idempotent no-op).`,
    data: { id: row.id, eventId: original.eventId },
  };
}
