"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { usePathname, useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";

// URL-driven pagination — disabled edges, pending state, keeps active filters.
export function TablePagination({
  page,
  pageCount,
  total,
  pageSize,
}: {
  page: number;
  pageCount: number;
  total: number;
  pageSize: number;
}) {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const [isPending, startTransition] = React.useTransition();

  const goto = (next: number) => {
    const params = new URLSearchParams(searchParams.toString());
    if (next <= 1) params.delete("page");
    else params.set("page", String(next));
    const qs = params.toString();
    startTransition(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
  };

  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);

  return (
    <div className="flex justify-between items-center p-4 border-t border-[var(--border-subtle)] bg-[var(--surface)] body-sm text-[var(--on-surface-variant)]">
      <div>
        Showing <span className="data-mono">{from}</span> to <span className="data-mono">{to}</span> of{" "}
        <span className="data-mono">{total.toLocaleString("en-US")}</span> results
      </div>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={page <= 1 || isPending}
          onClick={() => goto(page - 1)}
          aria-label="Previous page"
          className="h-8 rounded border border-[var(--outline-variant)] bg-[var(--surface)] disabled:opacity-40"
        >
          <span className="material-symbols-outlined text-[18px]">chevron_left</span>
        </Button>
        <span className="px-2 data-mono text-xs" aria-live="polite">
          Page {page} of {pageCount}
        </span>
        <Button
          variant="outline"
          size="sm"
          disabled={page >= pageCount || isPending}
          onClick={() => goto(page + 1)}
          aria-label="Next page"
          className="h-8 rounded border border-[var(--outline-variant)] bg-[var(--surface)] disabled:opacity-40"
        >
          <span className="material-symbols-outlined text-[18px]">chevron_right</span>
        </Button>
      </div>
    </div>
  );
}
