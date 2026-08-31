export function TestModeBanner() {
  return (
    <div
      className="sticky top-0 z-50 flex h-7 items-center justify-center bg-[#d97706] px-4 text-xs font-semibold tracking-wide text-white"
      role="banner"
      aria-label="Test mode"
    >
      TEST MODE — data is static placeholder, not live
    </div>
  );
}
