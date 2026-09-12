import "@testing-library/jest-dom";

// jsdom lacks the layout APIs some UI primitives (cmdk, Radix popovers) use.
// Stub them once here so component tests exercise logic, not layout.
if (typeof window !== "undefined") {
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  if (!window.ResizeObserver) (window as unknown as { ResizeObserver: unknown }).ResizeObserver = ResizeObserverStub;
  // `Element.prototype.scrollIntoView` is missing in jsdom.
  const proto = window.HTMLElement.prototype as unknown as { scrollIntoView?: () => void };
  if (!proto.scrollIntoView) proto.scrollIntoView = () => {};
}
