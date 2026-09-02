"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  DIGEST_OPTIONS,
  KEY_ENVIRONMENTS,
  KEY_SCOPES,
  NOTIFICATION_CHANNELS,
  isValidHexColor,
  isValidIpOrCidr,
} from "@/lib/settings-options";
import {
  addIpAllowEntry,
  createApiKey,
  removeIpAllowEntry,
  revokeApiKey,
  rollApiKey,
  setDeveloperToggle,
  setNotificationChannel,
  updateMerchantProfile,
  updateNotificationTopic,
} from "@/server/data/settings";

// Server Actions for the settings surface. Same serialisable `ActionState`
// contract as transactions / customers / invoices so every settings form can
// drive pending, success and error UI with the same hooks.

export type ActionState<T = undefined> = {
  status: "idle" | "success" | "error";
  message: string;
  fieldErrors?: Record<string, string[]>;
  data?: T;
};

function revalidateSettings(child?: string) {
  revalidatePath("/[locale]/settings", "page");
  revalidatePath("/settings");
  if (child) {
    revalidatePath(`/[locale]/settings/${child}`, "page");
    revalidatePath(`/settings/${child}`);
  }
}

function fieldErrorsOf(error: z.ZodError) {
  return z.flattenError(error).fieldErrors as Record<string, string[]>;
}

// --- merchant profile -------------------------------------------------------

const MerchantSchema = z.object({
  legalName: z.string().trim().min(2, "Legal name is required"),
  dba: z.string().trim().max(80, "Keep the trading name under 80 characters"),
  address: z.string().trim().min(4, "Street address is required"),
  city: z.string().trim().min(2, "City is required"),
  state: z.string().trim().min(2, "State is required"),
  postalCode: z.string().trim().min(3, "Postal code is required"),
  taxId: z.string().trim().min(4, "Tax ID is required"),
  supportEmail: z.email("Enter a valid support email"),
  statementDescriptor: z
    .string()
    .trim()
    .min(3, "Descriptor must be at least 3 characters")
    .max(22, "Card networks truncate descriptors after 22 characters"),
  brandColor: z.string().trim().refine(isValidHexColor, "Use a hex colour such as #1a56db"),
  logoUrl: z.string().trim().url("Logo must be a URL").or(z.literal("")),
  autoDebit: z.boolean(),
});

export async function updateMerchantProfileAction(
  _prev: ActionState | undefined,
  formData: FormData
): Promise<ActionState> {
  const parsed = MerchantSchema.safeParse({
    legalName: formData.get("legalName"),
    dba: formData.get("dba") ?? "",
    address: formData.get("address"),
    city: formData.get("city"),
    state: formData.get("state"),
    postalCode: formData.get("postalCode"),
    taxId: formData.get("taxId"),
    supportEmail: formData.get("supportEmail"),
    statementDescriptor: formData.get("statementDescriptor"),
    brandColor: formData.get("brandColor"),
    logoUrl: formData.get("logoUrl") ?? "",
    autoDebit: formData.get("autoDebit") === "on",
  });

  if (!parsed.success) {
    return {
      status: "error",
      message: "Please fix the highlighted fields.",
      fieldErrors: fieldErrorsOf(parsed.error),
    };
  }

  await updateMerchantProfile(parsed.data);
  revalidateSettings("merchant");
  return { status: "success", message: "Merchant profile saved." };
}

// --- notifications ----------------------------------------------------------

const ChannelSchema = z.object({
  channel: z.enum(NOTIFICATION_CHANNELS),
  enabled: z.boolean(),
});

export async function updateNotificationChannelAction(
  _prev: ActionState | undefined,
  formData: FormData
): Promise<ActionState> {
  const parsed = ChannelSchema.safeParse({
    channel: formData.get("channel"),
    enabled: formData.get("enabled") === "on",
  });
  if (!parsed.success) return { status: "error", message: "Unknown notification channel." };

  await setNotificationChannel(parsed.data.channel, parsed.data.enabled);
  revalidateSettings("notifications");
  return {
    status: "success",
    message: `${parsed.data.channel} notifications ${parsed.data.enabled ? "enabled" : "paused"}.`,
  };
}

const TopicSchema = z.object({
  topicId: z.string().trim().min(1),
  digest: z.enum(DIGEST_OPTIONS).optional(),
  dashboard: z.boolean().optional(),
  sms: z.boolean().optional(),
  email: z.boolean().optional(),
});

function optionalBool(value: FormDataEntryValue | null) {
  if (value === null) return undefined;
  return value === "on" || value === "true";
}

export async function updateNotificationPreferenceAction(
  _prev: ActionState | undefined,
  formData: FormData
): Promise<ActionState> {
  const parsed = TopicSchema.safeParse({
    topicId: formData.get("topicId"),
    digest: formData.get("digest") ?? undefined,
    dashboard: optionalBool(formData.get("dashboard")),
    sms: optionalBool(formData.get("sms")),
    email: optionalBool(formData.get("email")),
  });
  if (!parsed.success) {
    return { status: "error", message: "That preference could not be updated.", fieldErrors: fieldErrorsOf(parsed.error) };
  }

  try {
    const topic = await updateNotificationTopic(parsed.data);
    if (!topic) return { status: "error", message: "That notification topic no longer exists." };
    revalidateSettings("notifications");
    return { status: "success", message: `${topic.label} preferences updated.` };
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : "Update failed." };
  }
}

// --- API keys ---------------------------------------------------------------

const CreateKeySchema = z.object({
  name: z.string().trim().min(3, "Give the key a recognisable name"),
  environment: z.enum(KEY_ENVIRONMENTS),
  scopes: z.array(z.enum(KEY_SCOPES)).min(1, "Select at least one scope"),
  confirm: z.literal("on", { message: "Confirm you will store the secret safely" }),
});

export async function createApiKeyAction(
  _prev: ActionState<{ id: string; secret: string; name: string }> | undefined,
  formData: FormData
): Promise<ActionState<{ id: string; secret: string; name: string }>> {
  const parsed = CreateKeySchema.safeParse({
    name: formData.get("name"),
    environment: formData.get("environment"),
    scopes: formData.getAll("scopes"),
    confirm: formData.get("confirm"),
  });

  if (!parsed.success) {
    return {
      status: "error",
      message: "Please fix the highlighted fields.",
      fieldErrors: fieldErrorsOf(parsed.error),
    };
  }

  const { key, secret } = await createApiKey({
    name: parsed.data.name,
    environment: parsed.data.environment,
    scopes: parsed.data.scopes,
  });
  revalidateSettings("api-keys");
  return {
    status: "success",
    message: `${key.name} created — copy the secret now, it will not be shown again.`,
    data: { id: key.id, secret, name: key.name },
  };
}

const KeyIdSchema = z.object({
  id: z.string().trim().min(1, "Key id is required"),
  confirm: z.literal("on", { message: "Type-confirm this destructive action" }),
});

export async function revokeApiKeyAction(
  _prev: ActionState | undefined,
  formData: FormData
): Promise<ActionState> {
  const parsed = KeyIdSchema.safeParse({ id: formData.get("id"), confirm: formData.get("confirm") });
  if (!parsed.success) {
    return { status: "error", message: "Confirm before revoking.", fieldErrors: fieldErrorsOf(parsed.error) };
  }
  try {
    const key = await revokeApiKey(parsed.data.id);
    if (!key) return { status: "error", message: "That key no longer exists." };
    revalidateSettings("api-keys");
    return { status: "success", message: `${key.name} revoked. Requests using it will now fail.` };
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : "Revoke failed." };
  }
}

export async function rollApiKeyAction(
  _prev: ActionState<{ id: string; secret: string; name: string }> | undefined,
  formData: FormData
): Promise<ActionState<{ id: string; secret: string; name: string }>> {
  const parsed = KeyIdSchema.safeParse({ id: formData.get("id"), confirm: formData.get("confirm") });
  if (!parsed.success) {
    return { status: "error", message: "Confirm before rolling.", fieldErrors: fieldErrorsOf(parsed.error) };
  }
  try {
    const result = await rollApiKey(parsed.data.id);
    if (!result) return { status: "error", message: "That key no longer exists." };
    revalidateSettings("api-keys");
    return {
      status: "success",
      message: `${result.key.name} rolled — the previous secret is revoked.`,
      data: { id: result.key.id, secret: result.secret, name: result.key.name },
    };
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : "Roll failed." };
  }
}

// --- developer --------------------------------------------------------------

const IpSchema = z.object({
  value: z.string().trim().refine(isValidIpOrCidr, "Enter an IPv4 address or CIDR block"),
  label: z.string().trim().max(40, "Keep the label short").optional(),
});

export async function addIpAllowAction(
  _prev: ActionState | undefined,
  formData: FormData
): Promise<ActionState> {
  const parsed = IpSchema.safeParse({ value: formData.get("value"), label: formData.get("label") ?? "" });
  if (!parsed.success) {
    return { status: "error", message: "Please fix the highlighted fields.", fieldErrors: fieldErrorsOf(parsed.error) };
  }
  try {
    const entry = await addIpAllowEntry(parsed.data.value, parsed.data.label ?? "");
    revalidateSettings("developer");
    return { status: "success", message: `${entry.value} added to the allowlist.` };
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : "Could not add that IP." };
  }
}

export async function removeIpAllowAction(
  _prev: ActionState | undefined,
  formData: FormData
): Promise<ActionState> {
  const id = String(formData.get("id") ?? "").trim();
  if (!id) return { status: "error", message: "Missing allowlist entry." };
  const removed = await removeIpAllowEntry(id);
  if (!removed) return { status: "error", message: "That entry was already removed." };
  revalidateSettings("developer");
  return { status: "success", message: "Allowlist entry removed." };
}

const DevToggleSchema = z.object({
  field: z.enum(["sandboxMode"]),
  enabled: z.boolean(),
});

export async function updateDeveloperToggleAction(
  _prev: ActionState | undefined,
  formData: FormData
): Promise<ActionState> {
  const parsed = DevToggleSchema.safeParse({
    field: formData.get("field"),
    enabled: formData.get("enabled") === "on",
  });
  if (!parsed.success) return { status: "error", message: "Unknown developer setting." };
  await setDeveloperToggle(parsed.data.field, parsed.data.enabled);
  revalidateSettings("developer");
  return {
    status: "success",
    message: `Sandbox mode ${parsed.data.enabled ? "on" : "off"}.`,
  };
}
