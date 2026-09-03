import "server-only";

import { RepositoryError } from "@/domain/payments/errors";

export type CustomerIdentity = { id: string; organizationId: string };
export type ProviderCustomerIdentity = {
  id: string;
  organizationId: string;
  canonicalCustomerId: string;
  connectionId: string;
  providerCustomerId: string;
};

export interface CustomerIdentityRepository {
  findForOrganization(organizationId: string, customerId: string): Promise<CustomerIdentity | null>;
  findByProviderId(organizationId: string, connectionId: string, providerCustomerId: string): Promise<ProviderCustomerIdentity | null>;
}

export function assertCustomerOrganization(organizationId: string, customer: CustomerIdentity): void {
  if (organizationId !== customer.organizationId) {
    throw new RepositoryError("INVALID_TOPOLOGY", "Customer must belong to the same organization");
  }
}
