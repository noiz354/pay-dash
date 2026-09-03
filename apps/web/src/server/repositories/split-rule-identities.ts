import "server-only";

import { RepositoryError } from "@/domain/payments/errors";
import { parseMoney, type Money } from "@/domain/payments/money";

export type SplitAllocation =
  | { type: "FLAT"; money: Money }
  | { type: "PERCENT"; percent: string };

export type SplitRouteTopology = {
  organizationId: string;
  connectionId: string;
  destinationProviderAccountId: string;
};

export function assertSplitRouteTopology(
  materialization: Pick<SplitRouteTopology, "organizationId" | "connectionId">,
  route: SplitRouteTopology,
): void {
  if (
    materialization.organizationId !== route.organizationId ||
    materialization.connectionId !== route.connectionId
  ) {
    throw new RepositoryError(
      "INVALID_TOPOLOGY",
      "Split route and provider materialization must share organization and connection",
    );
  }
}

export function assertSplitAllocation(allocation: SplitAllocation): void {
  if (allocation.type === "FLAT") {
    parseMoney(allocation.money);
    return;
  }

  const percent = Number(allocation.percent);
  if (!Number.isFinite(percent) || percent <= 0 || percent > 100) {
    throw new RepositoryError("CONFLICT", "Percent split allocation must be greater than 0 and at most 100");
  }
}

export function assertSplitVersionMutable(approvalStatus: string): void {
  if (approvalStatus === "APPROVED" || approvalStatus === "ACTIVE" || approvalStatus === "RETIRED") {
    throw new RepositoryError("CONFLICT", "Approved split-rule versions are immutable");
  }
}
