import "server-only";

import type { ProviderMode } from "@/domain/payments/provider";
import { RepositoryError } from "@/domain/payments/errors";

export type ProviderConnectionIdentity = {
  id: string;
  organizationId: string;
  provider: string;
  mode: ProviderMode;
};

export type ProviderAccountIdentity = {
  id: string;
  organizationId: string;
  connectionId: string;
  providerAccountId: string;
};

export interface ProviderConnectionRepository {
  findForOrganization(
    organizationId: string,
    connectionId: string,
  ): Promise<ProviderConnectionIdentity | null>;
}

export function assertAccountConnectionTopology(
  connection: ProviderConnectionIdentity,
  account: Pick<ProviderAccountIdentity, "organizationId" | "connectionId">,
): void {
  if (
    connection.organizationId !== account.organizationId ||
    connection.id !== account.connectionId
  ) {
    throw new RepositoryError(
      "INVALID_TOPOLOGY",
      "Provider account must belong to the same organization and connection",
    );
  }
}
