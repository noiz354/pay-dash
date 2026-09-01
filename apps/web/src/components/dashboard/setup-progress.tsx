import { Link } from "@/i18n/navigation";
import { Card } from "@/components/ui/card";
import { getCompletedSteps, toggleSetupStepAction } from "@/server/actions/setup";
import { SETUP_STEPS } from "@/lib/setup-steps";
import { SetupStepToggle } from "./setup-step-toggle";

// Setup Progress checklist — each row is now actionable: the checkbox posts a
// Server Action (optimistic on the client), and the label deep-links to the
// screen where the step is actually completed.
export async function SetupProgress() {
  const done = await getCompletedSteps();
  const completed = SETUP_STEPS.filter((s) => done.includes(s.id)).length;
  const pct = Math.round((completed / SETUP_STEPS.length) * 100);
  const nextStep = SETUP_STEPS.find((s) => !done.includes(s.id));

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
        {SETUP_STEPS.map((step) => {
          const isDone = done.includes(step.id);
          const isNext = nextStep?.id === step.id;
          return (
            <li key={step.id}>
              <SetupStepToggle
                stepId={step.id}
                title={step.title}
                description={step.description}
                href={step.href}
                done={isDone}
                highlighted={isNext}
                action={toggleSetupStepAction}
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
