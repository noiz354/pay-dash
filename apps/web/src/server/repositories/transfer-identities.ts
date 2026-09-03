import "server-only";

import { RepositoryError } from "@/domain/payments/errors";

export type TransferAccountTopology = {
  id: string;
  organizationId: string;
  connectionId: string;
};

export function assertTransferTopology(source: TransferAccountTopology, destination: TransferAccountTopology): void {
  if (source.id === destination.id) {
    throw new RepositoryError("INVALID_TOPOLOGY", "Transfer source and destination must differ");
  }
  if (source.organizationId !== destination.organizationId || source.connectionId !== destination.connectionId) {
    throw new RepositoryError("INVALID_TOPOLOGY", "Transfer accounts must share organization and provider connection");
  }
}
