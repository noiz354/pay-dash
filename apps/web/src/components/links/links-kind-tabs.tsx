"use client";

import * as React from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { LINK_KIND_LABELS } from "@/lib/link-status";
import type { PaymentLink } from "@/server/data/links";

// Single vs. multiple is a URL concern (`?kind=multiple`; single is the
// default, parameter-free). Active state is computed client-side; the href
// preserves any active q/status filters while swapping the kind.
export function LinksKindTabs({ kind }: { kind: PaymentLink["kind"] }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const hrefFor = (k: PaymentLink["kind"]) => {
    const params = new URLSearchParams(searchParams.toString());
    if (k === "multiple") params.set("kind", "multiple");
    else params.delete("kind");
    params.delete("page");
    params.delete("new");
    const qs = params.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  };

  return (
    <div
      className="inline-flex items-center gap-1 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface)] p-1"
      role="tablist"
      aria-label="Link type"
    >
      {(["single", "multiple"] as const).map((k) => (
        <Link
          key={k}
          href={hrefFor(k)}
          aria-current={kind === k ? "page" : undefined}
          className={cn(
            "px-3 py-1.5 rounded-md body-sm font-medium transition-colors",
            kind === k
              ? "bg-[var(--primary-container)]/20 text-[var(--primary)]"
              : "text-[var(--on-surface-variant)] hover:bg-[var(--surface-container-low)]"
          )}
        >
          {LINK_KIND_LABELS[k]}
        </Link>
      ))}
    </div>
  );
}
