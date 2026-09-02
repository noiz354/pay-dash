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

/**
 * Resolve each onboarding step's effective done-state.
 *
 * Most steps are self-attested (a checkbox the operator ticks). The "bank"
 * step, however, has *real* ground truth behind it: a verified destination
 * payout account (ADR-0010). When one exists the step is treated as done
 * regardless of the cookie, and `derived` flags it so the UI can show a
 * "linked" badge and lock the checkbox instead of pretending the operator
 * self-attested it.
 */
export function resolveSetupSteps(
  completed: readonly string[],
  bankLinked: boolean
): { id: SetupStepId; done: boolean; derived: boolean }[] {
  return SETUP_STEPS.map((s) => {
    const done =
      s.id === "bank" ? bankLinked || completed.includes(s.id) : completed.includes(s.id);
    return { id: s.id, done, derived: s.id === "bank" && bankLinked };
  });
}

/** First step that is not (yet) done — the "Continue: …" CTA target. */
export function nextSetupStep(
  completed: readonly string[],
  bankLinked: boolean
): (typeof SETUP_STEPS)[number] | undefined {
  const resolved = resolveSetupSteps(completed, bankLinked);
  const firstOpen = resolved.find((r) => !r.done);
  return SETUP_STEPS.find((s) => s.id === firstOpen?.id);
}
