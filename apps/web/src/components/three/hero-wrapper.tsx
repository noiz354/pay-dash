"use client";

import * as React from "react";
import dynamic from "next/dynamic";

const Hero3D = dynamic(() => import("./hero").then((m) => m.Hero3D), {
  ssr: false,
  loading: () => <div className="h-[200px] w-full rounded-lg border bg-white animate-pulse" aria-label="Loading 3D hero" />,
});

class HeroErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(error: Error) {
    console.warn("Hero3D failed to render:", error);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="h-[200px] w-full rounded-lg border bg-white flex items-center justify-center" role="img" aria-label="3D hero unavailable">
          <div className="flex flex-col items-center gap-2 text-[var(--on-surface-variant)]">
            <span className="material-symbols-outlined text-[32px]" aria-hidden="true">
              view_in_ar
            </span>
            <span className="body-sm">3D Preview unavailable</span>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export function Hero3DWrapper() {
  return (
    <HeroErrorBoundary>
      <React.Suspense fallback={<div className="h-[200px] w-full rounded-lg border bg-white animate-pulse" aria-label="Loading 3D hero" />}>
        <Hero3D />
      </React.Suspense>
    </HeroErrorBoundary>
  );
}
