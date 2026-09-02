import { Link } from "@/i18n/navigation";
import { Card } from "@/components/ui/card";
import { getCompletedSteps, toggleSetupStepAction } from "@/server/actions/setup";
import { nextSetupStep, resolveSetupSteps, SETUP_STEPS } from "@/lib/setup-steps";
import { getDestinationAccount } from "@/server/data/payouts";
import { SetupStepToggle } from "./setup-step-toggle";

// Setup Progress checklist — each row is actionable: the checkbox posts a
// Server Action (optimistic on the client), and the label deep-links to the
// screen where the step is actually completed. The "Connect Bank Account"
// step additionally derives from real state (ADR-0012): a verified
// destination payout account marks it done and locks the tick, so the ring
// can no longer be inflated by a self-attested check.
export async function SetupProgress() {
  const [done, destination] = await Promise.all([getCompletedSteps(), getDestinationAccount()]);
  const bankLinked = destination?.verified ?? false;
  const states = resolveSetupSteps(done, bankLinked);
  const completed = states.filter((s) => s.done).length;
  const pct = Math.round((completed / SETUP_STEPS.length) * 100);
  const nextStep = nextSetupStep(done, bankLinked);

  return (
    <Card className="lg:col-span-4 bg-[var(--surface)] border-[var(--border-subtle)] p-5 flex flex-col shadow-sm min-w-0 overflow-hidden">
      <div className="flex justify-between items-center mb-4">
        <h3 className="headline-md text-[var(--on-surface)]">Setup Progress</h3>
        <span className="label-caps text-[var(--primary)] bg-[var(--primary-container)]/10 px-2 py-0.5 rounded data-mono">
          {pct}%
        </span>
      </div>

      <div
        className="w-full bg-[var(--surface-container-high)] rounded-full h-1.5 mb-6"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`Setup ${pct}% complete`}
      >
        <div className="bg-[var(--primary)] h-1.5 rounded-full transition-all" style={{ width: `${pct}%` }} />
      </div>

      <ul className="space-y-2 flex-1 min-w-0">
        {states.map((state) => {
          const step = SETUP_STEPS.find((s) => s.id === state.id)!;
          const isNext = nextStep?.id === step.id;
          return (
            <li key={step.id}>
              <SetupStepToggle
                stepId={step.id}
                title={step.title}
                description={step.description}
                href={step.href}
                done={state.done}
                highlighted={isNext}
                action={toggleSetupStepAction}
                locked={state.derived}
                lockNote={state.derived && destination ? `Linked · ${destination.masked}` : undefined}
              />
            </li>
          );
        })}
      </ul>

      <div className="mt-5 pt-4 border-t border-[var(--border-subtle)]">
        {nextStep ? (
          <Link
            href={nextStep.href}
            className="flex items-center justify-between gap-2 body-sm font-medium text-[var(--primary)] hover:underline"
          >
            <span className="truncate">Continue: {nextStep.title}</span>
            <span className="material-symbols-outlined text-[18px] shrink-0" aria-hidden="true">
              arrow_forward
            </span>
          </Link>
        ) : (
          <p className="body-sm text-[var(--success-status)] flex items-center gap-2">
            <span className="material-symbols-outlined text-[18px]" aria-hidden="true">
              task_alt
            </span>
            Account setup complete — you&apos;re ready to go live.
          </p>
        )}
      </div>
    </Card>
  );
}
