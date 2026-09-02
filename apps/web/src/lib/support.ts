// Client-safe support helpers (ADR-0016). The support page is static by
// design (INTEGRATION.md: the screen has no API) — but the one contact
// action it offers is real: a mailto to the documented support address,
// optionally pre-filled with the reference the merchant reported from
// (transaction rows and the transaction detail deep-link here with ?ref=).

export const SUPPORT_EMAIL = "support@kinetic.test";

export const SUPPORT_SUBJECT_DEFAULT = "Kinetic Ledger — support request";

export function supportSubject(ref?: string): string {
  const value = ref?.trim();
  return value ? `Kinetic Ledger — issue with ${value}` : SUPPORT_SUBJECT_DEFAULT;
}

export function supportMailto(ref?: string): string {
  return `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(supportSubject(ref))}`;
}
