// Client-safe payment-link vocabulary. `server/data/links.ts` imports
// "server-only", so anything a client component needs at runtime lives here
// — the same split as lib/balance-status.ts (ADR-0011) and lib/payout-status.ts.

export const LINK_STATUSES = ["OPEN", "PAID", "EXPIRED", "CANCELLED"] as const;
export type LinkStatus = (typeof LINK_STATUSES)[number];

export const LINK_STATUS_LABELS: Record<LinkStatus, string> = {
  OPEN: "Open",
  PAID: "Paid",
  EXPIRED: "Expired",
  CANCELLED: "Cancelled",
};

export const LINK_STATUS_ICONS: Record<LinkStatus, string> = {
  OPEN: "link",
  PAID: "check_circle",
  EXPIRED: "hourglass_bottom",
  CANCELLED: "cancel",
};

export const LINK_KINDS = ["single", "multiple"] as const;
export type LinkKind = (typeof LINK_KINDS)[number];

// The checkout URL a link resolves to (this prototype has no real payer site —
// the URL is what a customer would be sent).
export function shareUrlOf(id: string) {
  return `https://pay.kinetic.test/${id}`;
}

/**
 * F-01: `shareUrlOf` returns a `.test` host with nothing behind it, and the UI
 * renders it next to a "Copy URL" button — which reads as "send this to your
 * customer". Render this alongside the URL wherever it is offered for copying, so
 * the placeholder is not mistaken for a working payer site.
 */
export const SHARE_URL_NOTICE =
  "Placeholder URL — this deployment has no hosted payer site, so it will not resolve for a customer.";

export const LINK_KIND_LABELS: Record<LinkKind, string> = {
  single: "Single item",
  multiple: "Multiple items",
};
