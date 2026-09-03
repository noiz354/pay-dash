import { z } from "zod";

export const ProviderKeySchema = z
  .string()
  .min(1)
  .max(50)
  .regex(/^[a-z][a-z0-9-]*$/, "Provider keys must be lowercase kebab-case");

export const ProviderModeSchema = z.enum(["TEST", "LIVE"]);
export const DataSourceSchema = z.enum(["MOCK", "APP", "PROVIDER"]);

export const ProviderResourceRefSchema = z.object({
  connectionId: z.string().min(1),
  provider: ProviderKeySchema,
  mode: ProviderModeSchema,
  resourceType: z.string().min(1).max(100),
  resourceId: z.string().min(1).max(255),
});

export type ProviderKey = z.infer<typeof ProviderKeySchema>;
export type ProviderMode = z.infer<typeof ProviderModeSchema>;
export type DataSource = z.infer<typeof DataSourceSchema>;
export type ProviderResourceRef = z.infer<typeof ProviderResourceRefSchema>;

export function parseProviderResourceRef(value: unknown): ProviderResourceRef {
  return ProviderResourceRefSchema.parse(value);
}

export function providerResourceKey(ref: ProviderResourceRef): string {
  return [ref.connectionId, ref.resourceType, ref.resourceId].map(encodeURIComponent).join(":");
}
