import "server-only";

import { MaskedPaymentMethodDetailsSchema, type MaskedPaymentMethodDetails } from "@/domain/payments/payment-method";
import { RepositoryError } from "@/domain/payments/errors";

export type PaymentMethodTopology = {
  organizationId: string;
  connectionId: string;
  canonicalCustomerId: string;
};

export interface PaymentMethodIdentityRepository {
  findForOrganization(organizationId: string, paymentMethodId: string): Promise<PaymentMethodTopology | null>;
}

export function assertPaymentMethodTopology(method: PaymentMethodTopology, providerCustomer: PaymentMethodTopology): void {
  if (
    method.organizationId !== providerCustomer.organizationId ||
    method.connectionId !== providerCustomer.connectionId ||
    method.canonicalCustomerId !== providerCustomer.canonicalCustomerId
  ) {
    throw new RepositoryError("INVALID_TOPOLOGY", "Payment method and provider customer topology must match");
  }
}

export function parseMaskedPaymentMethodDetails(value: unknown): MaskedPaymentMethodDetails {
  return MaskedPaymentMethodDetailsSchema.parse(value);
}
