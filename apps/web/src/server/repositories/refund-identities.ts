import "server-only";

import { RepositoryError } from "@/domain/payments/errors";

export type RefundOrigin = { organizationId: string; connectionId: string; providerPaymentId: string };

export interface RefundIdentityRepository {
  findForOrganization(organizationId: string, refundId: string): Promise<RefundOrigin | null>;
}

export function assertRefundOrigin(payment: RefundOrigin, refund: RefundOrigin): void {
  if (
    payment.organizationId !== refund.organizationId ||
    payment.connectionId !== refund.connectionId ||
    payment.providerPaymentId !== refund.providerPaymentId
  ) {
    throw new RepositoryError("INVALID_TOPOLOGY", "Refund must use the payment's originating provider mapping");
  }
}
