import { TestModeBanner } from "./test-mode-banner";

// Reusable TopBar — h-14/16 border-b bg-surface sticky (billing:173, dashboard_home_desktop:192)
export function TopBar({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center justify-between border-b border-[var(--outline-variant)] bg-[var(--surface)] px-gutter">
      <h1 className="headline-lg text-[var(--primary)]">{title}</h1>
      <div className="flex items-center gap-4">
        {children}
        <TestModeBanner variant="pill" />
        <div className="hidden h-9 w-64 items-center gap-2 rounded border border-[var(--border-subtle)] bg-[var(--surface-container-low)] px-3 md:flex">
          <span className="material-symbols-outlined text-[18px] text-[var(--on-surface-variant)]">search</span>
          <span className="body-sm text-[var(--on-surface-variant)]">Search</span>
          <span className="ml-auto rounded bg-[var(--surface-container)] px-1.5 py-0.5 text-xs">⌘K</span>
        </div>
      </div>
    </header>
  );
}
