"use server";

import { revalidatePath } from "next/cache";
import { recordInbound, getWebhookEvent } from "@/server/data/webhooks";
import { SIMULATABLE_WEBHOOK_EVENTS } from "@/lib/webhook-status";
import {
  ingestAccessDeniedState,
  requireIngestOrganizationContext,
} from "@/server/services/ingest-organization-context";
import type { ActionState } from "./payouts";

export type { ActionState };

function denied<T>(e: unknown): ActionState<T> {
  return ingestAccessDeniedState(e) as ActionState<T>;
}

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
  const event = String(formData.get("event") ?? "");
  const reference = String(formData.get("reference") ?? "").trim();

  // Validation runs before authorization: a bad event type is a field error,
  // not an auth error (7F precedent). Nothing is written by a rejected attempt.
  if (!(SIMULATABLE_WEBHOOK_EVENTS as readonly string[]).includes(event)) {
    return { status: "error", message: "Pick an event type to simulate." };
  }

  // A session-driven simulation is *attributable*: it lands in the caller's own
  // partition via recordInbound(ctx, …), never in the unattributed door
  // partition reserved for ingress events whose organization could not be
  // resolved. The permission is provider.connect.test — the closest catalog
  // entry for "may exercise this provider integration" (Wave 8 debt: no
  // dedicated webhooks.replay permission exists).
  let access;
  try {
    access = await requireIngestOrganizationContext("provider.connect.test");
  } catch (e) {
    return denied<{ id: string; eventId: string; deduped: boolean }>(e);
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

  const { event: row, deduped } = recordInbound(access.context, { eventId, type: event, payload, source: "simulate" });
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
  const id = String(formData.get("id") ?? "").trim();

  let access;
  try {
    access = await requireIngestOrganizationContext("provider.connect.test");
  } catch (e) {
    return denied<{ id: string; eventId: string }>(e);
  }

  // "Not yours" and "does not exist" are the same null from the scoped read —
  // no enumeration oracle over another tenant's callback log. The replay writes
  // into the caller's own partition, so B's event can never be replayed into
  // A's log.
  const original = getWebhookEvent(access.context, id);
  if (!original) return { status: "error", message: "Webhook event not found." };
  if (original.status === "REJECTED") {
    return { status: "error", message: "Rejected callbacks have no usable payload to replay." };
  }

  const { event: row } = recordInbound(access.context, {
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
