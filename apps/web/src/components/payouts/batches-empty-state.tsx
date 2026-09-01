"use client";

import * as React from "react";
import { useRouter } from "@/i18n/navigation";
import { EmptyState } from "@/components/common/empty-state";
import { Button } from "@/components/ui/button";

// Tables never render a blank rectangle: "no batches yet" offers the primary
// action, "no matches" offers a way back out of the filter.
export function BatchesEmptyState({ isFiltered }: { isFiltered: boolean }) {
  const router = useRouter();

  if (isFiltered) {
    return (
      <div className="p-6">
        <EmptyState
          icon="filter_alt_off"
          title="No batches match these filters"
          description="Try a wider date range or clear the status filter."
          action={
            <Button variant="outline" className="border-[var(--border-subtle)]" onClick={() => router.push("/payouts")}>
              Clear filters
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="p-6">
      <EmptyState
        icon="payments"
        title="No payout batches yet"
        description="Upload a recipient CSV or enter payees manually to make your first disbursement."
        action={
          <Button
            className="bg-[var(--primary)] text-[var(--on-primary)]"
            onClick={() => router.push("/payouts/bulk?new=1")}
          >
            Create a batch
          </Button>
        }
      />
    </div>
  );
}
