// Wave1: Shared state views — loading skeleton (CLS-safe), empty, error, forbidden with next-best-action
import Link from "next/link";

export function TableSkeleton({ rows = 5 }: { rows?: number }) {
  // FE-016: 5 rows same dims to avoid CLS
  return (
    <div className="space-y-2" aria-busy="true" aria-label="Loading">
      <div className="h-10 w-full rounded bg-[var(--surface-container-high)] animate-pulse" />
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-14 w-full rounded bg-[var(--surface-container)] animate-pulse" />
      ))}
    </div>
  );
}

export function EmptyState({ title, description, action, icon = "inbox" }: { title: string; description?: string; action?: React.ReactNode; icon?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <span className="material-symbols-outlined text-[48px] text-[var(--on-surface-variant)] opacity-50" aria-hidden>{icon}</span>
      <h3 className="mt-4 text-base font-semibold text-[var(--on-surface)]">{title}</h3>
      {description ? <p className="mt-1 text-sm text-[var(--on-surface-variant)] max-w-[40ch]">{description}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function ErrorState({ title = "Something went wrong", description, retryAction }: { title?: string; description?: string; retryAction?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <span className="material-symbols-outlined text-[48px] text-[var(--error)]" aria-hidden>error</span>
      <h3 className="mt-4 text-base font-semibold text-[var(--on-surface)]">{title}</h3>
      {description ? <p className="mt-1 text-sm text-[var(--on-surface-variant)] max-w-[40ch]">{description}</p> : null}
      {retryAction ? <div className="mt-4">{retryAction}</div> : null}
    </div>
  );
}

export function ForbiddenState({ permission, nextBestActionHref = "/dashboard" }: { permission?: string; nextBestActionHref?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <span className="material-symbols-outlined text-[48px] text-[var(--on-surface-variant)]" aria-hidden>lock</span>
      <h3 className="mt-4 text-base font-semibold text-[var(--on-surface)]">You don&apos;t have access</h3>
      <p className="mt-1 text-sm text-[var(--on-surface-variant)] max-w-[45ch]">
        {permission ? `Requires permission: ${permission}.` : "You don't have permission to view this page."} Contact your organization owner if you need access.
      </p>
      <div className="mt-6 flex gap-3">
        <Link href={nextBestActionHref} className="inline-flex items-center rounded-full bg-[var(--primary)] px-6 py-2 text-sm font-medium text-[var(--on-primary)] hover:opacity-90">
          Go to dashboard
        </Link>
        <Link href="/support" className="inline-flex items-center rounded-full border border-[var(--outline)] px-6 py-2 text-sm font-medium text-[var(--on-surface)] hover:bg-[var(--surface-container-high)]">
          Contact support
        </Link>
      </div>
    </div>
  );
}
