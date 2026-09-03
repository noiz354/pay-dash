import "server-only";

import { RepositoryError } from "@/domain/payments/errors";

export type RecurringTopology = {
  organizationId: string;
  connectionId: string;
  canonicalCustomerId: string;
};

export function assertRecurringTopology(subscription: RecurringTopology, paymentMethod: RecurringTopology): void {
  if (
    subscription.organizationId !== paymentMethod.organizationId ||
    subscription.connectionId !== paymentMethod.connectionId ||
    subscription.canonicalCustomerId !== paymentMethod.canonicalCustomerId
  ) {
    throw new RepositoryError("INVALID_TOPOLOGY", "Recurring plan and payment method topology must match");
  }
}

export function assertProviderStatusDoesNotGrantEntitlement(providerStatus: string, entitlementStatus: string): void {
  if (providerStatus === "UNKNOWN" && entitlementStatus === "ACTIVE") {
    throw new RepositoryError("INVALID_TOPOLOGY", "Unknown provider state cannot grant an active entitlement");
  }
}
