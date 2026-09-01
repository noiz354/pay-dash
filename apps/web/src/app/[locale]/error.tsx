"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/common/empty-state";

// Route-level error boundary for every authenticated screen — recoverable via
// reset() instead of a dead white page.
export default function LocaleError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  React.useEffect(() => {
    console.error("[route-error]", error);
  }, [error]);

  return (
    <main className="mx-auto w-full max-w-container-max p-gutter">
      <EmptyState
        icon="error"
        title="Something went wrong loading this page"
        description={
          error.digest
            ? `We've logged the issue (ref ${error.digest}). You can retry without losing your place.`
            : "We've logged the issue. You can retry without losing your place."
        }
        action={
          <Button onClick={reset} className="bg-[var(--primary)] text-[var(--on-primary)]">
            Try again
          </Button>
        }
      />
    </main>
  );
}
