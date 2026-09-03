import "server-only";

import { z } from "zod";
import { RepositoryError } from "@/domain/payments/errors";

const OrganizationScopeSchema = z.object({
  organizationId: z.string().min(1),
}).strict();

export type OrganizationScope = z.infer<typeof OrganizationScopeSchema>;

export function parseOrganizationScope(value: unknown): OrganizationScope {
  return OrganizationScopeSchema.parse(value);
}

export function assertExpectedVersion(actualVersion: number, expectedVersion: number): void {
  if (!Number.isSafeInteger(actualVersion) || !Number.isSafeInteger(expectedVersion) || actualVersion < 1 || expectedVersion < 1) {
    throw new RepositoryError("CONFLICT", "Repository versions must be positive safe integers");
  }
  if (actualVersion !== expectedVersion) {
    throw new RepositoryError("STALE_VERSION", `Expected version ${expectedVersion}, found ${actualVersion}`);
  }
}

export function requiredIdentity<T>(value: T | null, resourceName: string): T {
  if (value === null) {
    throw new RepositoryError("NOT_FOUND", `${resourceName} was not found in the organization scope`);
  }
  return value;
}
