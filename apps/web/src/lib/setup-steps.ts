// Onboarding checklist definition — shared by the Server Action module and the
// dashboard UI. Kept out of the "use server" file, which may only export
// async functions.
export const SETUP_STEPS = [
  {
    id: "business",
    title: "Verify Business Details",
    description: "Confirm the legal entity and tax IDs used on settlements.",
    href: "/settings/merchant",
  },
  {
    id: "bank",
    title: "Connect Bank Account",
    description: "Add the disbursement account that receives your payouts.",
    href: "/payouts/settings",
  },
  {
    id: "routing",
    title: "Configure Routing Rules",
    description: "Set up intelligent payment routing to optimize costs.",
    href: "/payments/links",
  },
  {
    id: "webhooks",
    title: "Enable Webhooks",
    description: "Receive payment events on your endpoint in real time.",
    href: "/webhooks",
  },
] as const;

export type SetupStepId = (typeof SETUP_STEPS)[number]["id"];
