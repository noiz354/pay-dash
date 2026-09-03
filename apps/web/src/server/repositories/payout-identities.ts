import "server-only";

import { RepositoryError } from "@/domain/payments/errors";

export type PayoutAttemptIdentity = {
  recipientId: string;
  organizationId: string;
  connectionId: string;
  attemptNumber: number;
};

export function assertNextPayoutAttempt(previous: PayoutAttemptIdentity | null, next: PayoutAttemptIdentity): void {
  const expected = previous ? previous.attemptNumber + 1 : 1;
  if (next.attemptNumber !== expected || (previous && (previous.recipientId !== next.recipientId || previous.organizationId !== next.organizationId))) {
    throw new RepositoryError("CONFLICT", "Payout attempts must be consecutive for the same recipient and organization");
  }
}

export function currentPayoutAttempt<T extends Pick<PayoutAttemptIdentity, "attemptNumber">>(attempts: readonly T[]): T | null {
  return attempts.reduce<T | null>((current, attempt) => !current || attempt.attemptNumber > current.attemptNumber ? attempt : current, null);
}
