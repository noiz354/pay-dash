import "server-only";

import { formatDateLong } from "@/lib/format";
import { KYC_DOC_TYPES } from "@/lib/kyc-options";
import { getKycSubmission, profileKycCompleteness } from "./kyc";
import { getDestinationAccount, listBankAccounts } from "./payouts";
import { getLedgerRows } from "./transactions";
import { getMerchantProfile, listApiKeys } from "./settings";
import { listWebhooks } from "./webhooks";

// ---------------------------------------------------------------------------
// Onboarding data source (ADR-0025).
//
// The prototype /onboarding was a pure mockup: hard-coded "3 of 4 sections
// completed · 75%", an invented "****4592" account, "Verified on Oct 24",
// "Verified by system" documents, and a Technical card whose completed items
// were struck through while the merchant's ledger already held 33 succeeded
// transactions. Every affordance was a dead button.
//
// This module owns no facts of its own — it DERIVES each checklist item from
// the store that actually holds it (the ADR-0011 balance pattern, applied to
// a checklist):
//
//   Business Profile  ← settings.merchant
//   Bank Setup        ← payouts bank accounts + destination
//   Technical Setup   ← settings API keys + the webhooks callback log
//                       + succeeded ledger transactions
//   Compliance        ← the KYC store (what the merchant submitted, when)
//
// The compliance section is shown but NEVER counted: the review outcome is
// the compliance team's side of the table — KYC is not in the v7 node SDK
// product list (INTEGRATION.md:93/:323), so no page in this app may claim an
// approved state (ADR-0019, extended). The progress bar therefore tracks the
// three app-owned sections only.
// ---------------------------------------------------------------------------

export type OnboardingCheck = {
  id: string;
  label: string;
  detail: string;
  done: boolean;
};

export type OnboardingSectionId = "profile" | "compliance" | "bank" | "technical";

export type OnboardingSection = {
  id: OnboardingSectionId;
  title: string;
  icon: string;
  badge: "COMPLETED" | "IN PROGRESS" | "REVIEW PENDING" | "ACTION REQUIRED";
  tone: "success" | "pending" | "warning";
  checks: OnboardingCheck[];
  /** The page that owns the facts behind this section. */
  href: string;
  actionLabel: string;
  /** App-owned sections count toward the progress bar; compliance never does. */
  counts: boolean;
};

export type OnboardingStatus = {
  merchantName: string;
  sections: OnboardingSection[];
  trackedTotal: number;
  trackedComplete: number;
  progress: number;
  allDone: boolean;
};

const profileChecks = (profile: {
  legalName: string;
  dba: string;
  address: string;
  city: string;
  state: string;
  postalCode: string;
  taxId: string;
}): OnboardingCheck[] => [
  {
    id: "profile-legal",
    label: "Legal name & DBA",
    detail: [profile.legalName, profile.dba].filter(Boolean).join(" · "),
    done: Boolean(profile.legalName.trim()),
  },
  {
    id: "profile-address",
    label: "Registered address",
    detail: [profile.address, profile.city, profile.state, profile.postalCode]
      .filter(Boolean)
      .join(", "),
    done: Boolean(profile.address.trim()),
  },
  {
    id: "profile-tax",
    label: "Tax ID",
    detail: profile.taxId.trim() || "Not on file",
    done: Boolean(profile.taxId.trim()),
  },
];

export async function getOnboardingStatus(): Promise<OnboardingStatus> {
  const [profile, accounts, destination, keys, webhooks, completeness, submission] =
    await Promise.all([
      getMerchantProfile(),
      listBankAccounts(),
      getDestinationAccount(),
      listApiKeys(),
      listWebhooks({ pageSize: 1 }),
      profileKycCompleteness(),
      Promise.resolve(getKycSubmission()),
    ]);

  // --- Business Profile (settings.merchant) --------------------------------
  const profileChecksList = profileChecks(profile);
  const profileSection: OnboardingSection = {
    id: "profile",
    title: "Business Profile",
    icon: "domain",
    badge: profileChecksList.every((c) => c.done) ? "COMPLETED" : "IN PROGRESS",
    tone: profileChecksList.every((c) => c.done) ? "success" : "pending",
    checks: profileChecksList,
    href: "/settings/merchant",
    actionLabel: "Review Details",
    counts: true,
  };

  // --- Bank Setup (payouts bank accounts) ----------------------------------
  const verifiedCount = accounts.filter((a) => a.verified).length;
  const bankChecks: OnboardingCheck[] = [
    {
      id: "bank-account",
      label: "Operating account",
      detail: destination
        ? `${destination.bank} · ${destination.masked}${destination.isDefault ? " (default)" : ""}`
        : "No destination account on file",
      done: Boolean(destination),
    },
    {
      id: "bank-verified",
      label: "Account verified",
      detail: destination
        ? destination.verified
          ? `${verifiedCount} of ${accounts.length} accounts verified`
          : "Awaiting verification"
        : "Add an account to verify",
      done: Boolean(destination?.verified),
    },
  ];
  const bankSection: OnboardingSection = {
    id: "bank",
    title: "Bank Setup",
    icon: "account_balance_wallet",
    badge: bankChecks.every((c) => c.done) ? "COMPLETED" : "IN PROGRESS",
    tone: bankChecks.every((c) => c.done) ? "success" : "pending",
    checks: bankChecks,
    href: "/payouts/settings",
    actionLabel: "Manage Accounts",
    counts: true,
  };

  // --- Technical Setup (keys + callback log + ledger) ----------------------
  const liveKeys = keys.filter((k) => k.environment === "LIVE").length;
  const sandboxKeys = keys.filter((k) => k.environment === "TEST").length;
  const succeeded = getLedgerRows().filter((t) => t.status === "SUCCEEDED").length;
  const techChecks: OnboardingCheck[] = [
    {
      id: "tech-keys",
      label: "API keys generated",
      detail:
        keys.length > 0
          ? `${keys.length} keys on file · ${liveKeys} live, ${sandboxKeys} sandbox`
          : "No keys generated yet",
      done: keys.length > 0,
    },
    {
      id: "tech-webhooks",
      label: "Webhook endpoint live",
      detail:
        webhooks.total > 0
          ? `${webhooks.total} callback event${webhooks.total === 1 ? "" : "s"} received`
          : "No callback events received yet",
      done: webhooks.total > 0,
    },
    {
      id: "tech-first-txn",
      label: "First test transaction",
      detail:
        succeeded > 0
          ? `${succeeded} successful transaction${succeeded === 1 ? "" : "s"} settled`
          : "No successful transactions yet",
      done: succeeded > 0,
    },
  ];
  const techSection: OnboardingSection = {
    id: "technical",
    title: "Technical Setup",
    icon: "integration_instructions",
    badge: techChecks.every((c) => c.done) ? "COMPLETED" : "IN PROGRESS",
    tone: techChecks.every((c) => c.done) ? "success" : "pending",
    checks: techChecks,
    href: "/settings/developer",
    actionLabel: "Go to Developer Dashboard",
    counts: true,
  };

  // --- Compliance (KYC store — shown, never counted) -----------------------
  const infoDetail = completeness.complete
    ? completeness.fields.map((f) => f.value).join(" · ")
    : `Missing: ${completeness.fields.filter((f) => !f.present).map((f) => f.label).join(", ")}`;
  const docTypeLabel = submission
    ? KYC_DOC_TYPES.find((t) => t.value === submission.docType)?.label ?? submission.docType
    : null;
  const complianceChecks: OnboardingCheck[] = [
    {
      id: "compliance-info",
      label: "Business basic info",
      detail: infoDetail,
      done: completeness.complete,
    },
    {
      id: "compliance-doc",
      label: "Incorporation document",
      detail: submission
        ? `${submission.fileName} — ${docTypeLabel} · submitted ${formatDateLong(submission.submittedAt)}`
        : "Not yet submitted",
      done: Boolean(submission),
    },
  ];
  const complianceDone = complianceChecks.every((c) => c.done);
  const complianceSection: OnboardingSection = {
    id: "compliance",
    title: "Compliance",
    icon: "description",
    // The app can hold "submitted" but never "approved" — so this section is
    // never COMPLETED and never counts (ADR-0019 ruling, INTEGRATION.md §7).
    badge: complianceDone ? "REVIEW PENDING" : "ACTION REQUIRED",
    tone: complianceDone ? "pending" : "warning",
    checks: complianceChecks,
    href: "/kyc",
    actionLabel: "View Documents",
    counts: false,
  };

  const sections = [profileSection, complianceSection, bankSection, techSection];
  const tracked = sections.filter((s) => s.counts);
  const trackedComplete = tracked.filter((s) => s.badge === "COMPLETED").length;

  return {
    merchantName: profile.legalName,
    sections,
    trackedTotal: tracked.length,
    trackedComplete,
    progress: Math.round((trackedComplete / tracked.length) * 100),
    allDone: trackedComplete === tracked.length,
  };
}
