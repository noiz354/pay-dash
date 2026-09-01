export function TestModeBanner({ variant = "banner" }: { variant?: "banner" | "pill" }) {
  if (variant === "pill") {
    // Inline pill for TopBar — desktop pattern dashboard_home_desktop:207
    return (
      <div className="hidden items-center gap-1 rounded-full border border-[var(--test-mode-amber)]/20 bg-[var(--test-mode-amber)]/10 px-2 py-1 sm:flex">
        <span className="h-2 w-2 rounded-full bg-[var(--test-mode-amber)]" />
        <span className="label-caps text-[var(--test-mode-amber)]">Test Mode</span>
      </div>
    );
  }
  // Fixed banner — mobile dashboard_home:123
  return (
    <div
      className="sticky top-0 z-50 flex h-7 items-center justify-center bg-[var(--test-mode-amber)] px-4 text-xs font-semibold tracking-wide text-white label-caps"
      role="banner"
      aria-label="Test mode"
    >
      TEST MODE — Data is not live
    </div>
  );
}
