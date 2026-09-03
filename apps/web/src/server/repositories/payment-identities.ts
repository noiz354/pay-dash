import "server-only";

import { RepositoryError } from "@/domain/payments/errors";

export type PaymentIdentity = { id: string; organizationId: string };
export type ProviderPaymentIdentity = {
  id: string;
  organizationId: string;
  canonicalPaymentId: string;
  connectionId: string;
  providerPaymentId: string;
};

export interface PaymentIdentityRepository {
  findForOrganization(organizationId: string, paymentId: string): Promise<PaymentIdentity | null>;
  findByProviderId(organizationId: string, connectionId: string, providerPaymentId: string): Promise<ProviderPaymentIdentity | null>;
}

export function assertPaymentCustomerOrganization(paymentOrganizationId: string, customerOrganizationId: string): void {
  if (paymentOrganizationId !== customerOrganizationId) {
    throw new RepositoryError("INVALID_TOPOLOGY", "Payment and customer must belong to the same organization");
  }
}
