/**
 * jsdom does not implement `window.matchMedia`. Components that honour
 * `prefers-reduced-motion` (StaleBanner, motion-gated animations) need it in
 * unit tests. Install per test file; `matches` decides which branch renders.
 */
export function installMatchMedia(matches = false): void {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches,
      media: query,
      onchange: null,
      addListener: () => {}, // deprecated API — some libs still call it
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}
