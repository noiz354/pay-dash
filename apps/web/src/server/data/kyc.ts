import "server-only";
import { getMerchantProfile } from "./settings";
import { parseOrganizationContext, type OrganizationContext } from "@/domain/tenancy/organization-context";

// KYC submission store (ADR-0019). The app can own exactly one KYC fact:
// what the merchant submitted through it, and when. The review OUTCOME lives
// with the compliance team — KYC is not in the v7 node SDK product list
// (INTEGRATION.md:93/:323), so no page in this app may claim an
// approved/rejected state. The prototype's hard-coded progress rail and the
// invented "acme_corp_incorporation_2023.pdf" attachment are gone; step 1 is
// derived from the merchant profile instead.
//
// Deliberately unseeded: a compliance document is an unverified claim about
// the merchant — unlike ledger rows, the app should not fabricate one.
//
// Wave 7F — every entry point takes the caller's organization context first.
// These are the highest-confidentiality rows in the slice: a submission names a
// file, a jurisdiction and a time about a *legal entity*, so resolving another
// tenant's document is a PII disclosure, not a display bug (spec P-5). Because
// the store is unseeded, "nothing submitted" and "submitted by somebody else"
// are the same answer — `null` — which is the anti-enumeration contract (C-5)
// for free: there is no oracle here to probe.

export type KycDocumentType = "incorporation" | "articles" | "license" | "tax";

export type KycSubmission = {
  fileName: string;
  sizeBytes: number;
  docType: KycDocumentType;
  jurisdiction: string;
  submittedAt: string;
};

/**
 * One slot per tenant: presence in the map *is* "this merchant submitted
 * something". There is no shared `submission` field to leak through, and no id
 * to aim at another tenant's document (spec P-10: the context is the tenant
 * edge, so a caller can only ever address its own slot).
 */
type Store = { tenants: Map<string, KycSubmission> };
const g = globalThis as unknown as { __kineticKycStore?: Store };
function store(): Store {
  if (!g.__kineticKycStore) g.__kineticKycStore = { tenants: new Map<string, KycSubmission>() };
  return g.__kineticKycStore;
}

/** Validate the caller's context at the boundary (contract C-1/C-2). */
function scopeOf(ctx: OrganizationContext): OrganizationContext {
  return parseOrganizationContext(ctx);
}

export function getKycSubmission(ctx: OrganizationContext): KycSubmission | null {
  const { organizationId } = scopeOf(ctx);
  const s = store().tenants.get(organizationId);
  return s ? { ...s } : null;
}

/** Persist (or replace) the submitted document — the caller tenant's own fact. */
export function submitKycDocument(
  ctx: OrganizationContext,
  input: {
    fileName: string;
    sizeBytes: number;
    docType: KycDocumentType;
    jurisdiction: string;
    submittedAt?: string;
  },
): KycSubmission {
  const { organizationId } = scopeOf(ctx);
  const submission: KycSubmission = {
    fileName: input.fileName,
    sizeBytes: input.sizeBytes,
    docType: input.docType,
    jurisdiction: input.jurisdiction,
    submittedAt: input.submittedAt ?? new Date().toISOString(),
  };
  // Replacing is per tenant: A resubmitting its own document cannot touch B's.
  store().tenants.set(organizationId, submission);
  return { ...submission };
}

/**
 * Clear the submission (the merchant can start over).
 *
 * `false` means "your tenant had nothing to clear" — never "somebody else's
 * document is safe". A foreign clear is not expressible at all: the slot is
 * addressed by the context, not by an id, so there is nothing to aim.
 */
export function removeKycDocument(ctx: OrganizationContext): boolean {
  const { organizationId } = scopeOf(ctx);
  return store().tenants.delete(organizationId);
}

export type KycProfileField = {
  key: string;
  label: string;
  value: string | null;
  present: boolean;
};

export type KycProfileCompleteness = {
  complete: boolean;
  fields: KycProfileField[];
};

/**
 * How many tenants hold a document. Tenancy *probe*: answers a question about
 * the store, never a document — which is why it, and not a read, is what the
 * quarantine gate and the seam's demo-fallback refusal gate on. Unseeded by
 * design, so this starts at 0: there is no "the" KYC tenant to assume.
 */
export function countKycTenants(): number {
  return store().tenants.size;
}

/** The only submitting tenant, or `null` when there is not exactly one. */
export function soleKycOrganizationId(): string | null {
  const ids = [...store().tenants.keys()];
  return ids.length === 1 ? (ids[0] ?? null) : null;
}

// Step 1 — "Basic Info" — is real: the merchant profile the app persists at
// /settings/merchant. Missing fields are reported, not faked complete.
//
// Wave 7F: completeness is computed from the *caller's* profile. Deriving it
// from a neighbour's tax id would be a leak with a green tick on it — the
// checklist would say "complete" while displaying somebody else's identity.
export async function profileKycCompleteness(ctx: OrganizationContext): Promise<KycProfileCompleteness> {
  const scoped = scopeOf(ctx);
  const profile = await getMerchantProfile(scoped);
  const pick = (value: string | undefined, label: string, key: string): KycProfileField => ({
    key,
    label,
    value: value && value.trim() ? value.trim() : null,
    present: Boolean(value && value.trim()),
  });

  const fields: KycProfileField[] = [
    pick(profile.dba || profile.legalName, "Business name", "name"),
    pick(profile.address, "Registered address", "address"),
    pick(profile.taxId, "Tax ID", "taxId"),
  ];
  return { complete: fields.every((f) => f.present), fields };
}
