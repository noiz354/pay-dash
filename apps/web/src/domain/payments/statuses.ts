import { z } from "zod";

export const CanonicalStatusSchema = z.enum([
  "PENDING",
  "REQUIRES_ACTION",
  "PROCESSING",
  "SUCCEEDED",
  "FAILED",
  "CANCELLED",
  "REVERSED",
  "UNKNOWN",
]);

export type CanonicalStatus = z.infer<typeof CanonicalStatusSchema>;

export type StatusMap = Readonly<Record<string, CanonicalStatus>>;

export function mapProviderStatus(providerStatus: string, mapping: StatusMap): CanonicalStatus {
  return mapping[providerStatus] ?? "UNKNOWN";
}

export function isTerminalSuccess(status: CanonicalStatus): boolean {
  return status === "SUCCEEDED";
}
