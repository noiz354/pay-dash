"use client";

import * as React from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

// Per-widget error isolation. Without it a single failing read takes out the
// whole route via error.tsx; with it the failing card degrades into a retry
// tile and its neighbours keep rendering.
type Props = { children: React.ReactNode; title: string; className?: string };
type State = { hasError: boolean; nonce: number };

export class SectionBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, nonce: 0 };
  }

  static getDerivedStateFromError(): Partial<State> {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    console.error("[section-boundary]", this.props.title, error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <Card
          className={
            "flex flex-col items-center justify-center gap-2 border-dashed border-[var(--border-subtle)] p-6 text-center " +
            (this.props.className ?? "")
          }
          role="alert"
        >
          <span className="material-symbols-outlined text-[24px] text-[var(--on-surface-variant)]" aria-hidden="true">
            error
          </span>
          <p className="body-sm text-[var(--on-surface)]">{this.props.title} couldn&apos;t load</p>
          <Button
            variant="outline"
            size="sm"
            className="border-[var(--border-subtle)]"
            onClick={() => this.setState((s) => ({ hasError: false, nonce: s.nonce + 1 }))}
          >
            Retry
          </Button>
        </Card>
      );
    }

    return <React.Fragment key={this.state.nonce}>{this.props.children}</React.Fragment>;
  }
}
