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
import { TenantIsolationError } from "@/domain/security/tenant";
import {
  identityAccessDeniedState,
  requireIdentityOrganizationContext,
  type ResolvedIdentityAccess,
} from "@/server/services/identity-organization-context";

// Server Actions for the settings surface. Same serialisable `ActionState`
// contract as transactions / customers / invoices so every settings form can
// drive pending, success and error UI with the same hooks.
//
// Wave 7F — these actions are the settings slice's authorization boundary, and
// before this wave they had none: any caller who could POST the form could
// rewrite the merchant's legal identity, mint and roll API keys (the secret
// lifecycle) and edit the IP allowlist. Every action below now resolves the
// session tenant and asserts `settings.manage` *after* validating the payload
// (a malformed field is a field error, not an auth error) and *before* touching
// a store. Ids that belong to another tenant are refused by the DAL, audited
// there, and mapped here to the same message an unknown id gets — no
// enumeration oracle on the wire.

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

/** The one-time reveal payload a key action returns on success. */
type KeyReveal = { id: string; secret: string; name: string };

type Resolved<T = undefined> = { access: ResolvedIdentityAccess } | { error: ActionState<T> };

/** Resolve the tenant and assert `settings.manage` in one fail-closed step. */
async function settingsAccess<T = undefined>(): Promise<Resolved<T>> {
  try {
    return { access: await requireIdentityOrganizationContext("settings.manage") };
  } catch (e) {
    return { error: denied<T>(e) };
  }
}

function isCrossTenant(e: unknown): boolean {
  return e instanceof TenantIsolationError;
}

function denied<T = undefined>(e: unknown): ActionState<T> {
  return identityAccessDeniedState(e);
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

  const resolved = await settingsAccess();
  if ("error" in resolved) return resolved.error;

  try {
    // The tenant comes from the session, so this write can only land on the
    // caller's own legal identity — the form has no organization field to aim.
    await updateMerchantProfile(resolved.access.context, parsed.data);
    revalidateSettings("merchant");
    return { status: "success", message: "Merchant profile saved." };
  } catch (e) {
    return denied(e);
  }
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

  const resolved = await settingsAccess();
  if ("error" in resolved) return resolved.error;

  try {
    await setNotificationChannel(resolved.access.context, parsed.data.channel, parsed.data.enabled);
    revalidateSettings("notifications");
    return {
      status: "success",
      message: `${parsed.data.channel} notifications ${parsed.data.enabled ? "enabled" : "paused"}.`,
    };
  } catch (e) {
    return denied(e);
  }
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

  const resolved = await settingsAccess();
  if ("error" in resolved) return resolved.error;

  try {
    // The topic id is the same string in every tenant, so it is only unique as
    // (organizationId, topicId): the DAL looks it up inside the caller's own
    // partition, which is what keeps muting a topic here from muting it
    // everywhere.
    const topic = await updateNotificationTopic(resolved.access.context, parsed.data);
    if (!topic) return { status: "error", message: "That notification topic no longer exists." };
    revalidateSettings("notifications");
    return { status: "success", message: `${topic.label} preferences updated.` };
  } catch (error) {
    if (isCrossTenant(error)) return { status: "error", message: "That notification topic no longer exists." };
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

  const resolved = await settingsAccess<KeyReveal>();
  if ("error" in resolved) return resolved.error;

  try {
    const { key, secret } = await createApiKey(resolved.access.context, {
      name: parsed.data.name,
      environment: parsed.data.environment,
      scopes: parsed.data.scopes,
    });
    revalidateSettings("api-keys");
    // The plaintext secret travels in this one response and is never stored:
    // the key ring keeps the mask, so a later listing cannot resurface it.
    return {
      status: "success",
      message: `${key.name} created — copy the secret now, it will not be shown again.`,
      data: { id: key.id, secret, name: key.name },
    };
  } catch (e) {
    return denied<KeyReveal>(e);
  }
}

const KeyIdSchema = z.object({
  id: z.string().trim().min(1, "Key id is required"),
  confirm: z.literal("on", { message: "Type-confirm this destructive action" }),
});

/** Uniform wire answer for a key that is not the caller's — or does not exist. */
const KEY_NOT_FOUND_MESSAGE = "That key no longer exists.";

export async function revokeApiKeyAction(
  _prev: ActionState | undefined,
  formData: FormData
): Promise<ActionState> {
  const parsed = KeyIdSchema.safeParse({ id: formData.get("id"), confirm: formData.get("confirm") });
  if (!parsed.success) return { status: "error", message: "Confirm before revoking.", fieldErrors: fieldErrorsOf(parsed.error) };

  const resolved = await settingsAccess();
  if ("error" in resolved) return resolved.error;

  try {
    const key = await revokeApiKey(resolved.access.context, parsed.data.id);
    if (!key) return { status: "error", message: KEY_NOT_FOUND_MESSAGE };
    revalidateSettings("api-keys");
    return { status: "success", message: `${key.name} revoked. Requests using it will now fail.` };
  } catch (error) {
    // Another tenant's key: same answer as an unknown id (C-5). The refusal was
    // already audited by the DAL, which keeps the asymmetry operators need.
    if (isCrossTenant(error)) return { status: "error", message: KEY_NOT_FOUND_MESSAGE };
    return { status: "error", message: error instanceof Error ? error.message : "Revoke failed." };
  }
}

export async function rollApiKeyAction(
  _prev: ActionState<{ id: string; secret: string; name: string }> | undefined,
  formData: FormData
): Promise<ActionState<{ id: string; secret: string; name: string }>> {
  const parsed = KeyIdSchema.safeParse({ id: formData.get("id"), confirm: formData.get("confirm") });
  if (!parsed.success) return { status: "error", message: "Confirm before rolling.", fieldErrors: fieldErrorsOf(parsed.error) };

  const resolved = await settingsAccess<KeyReveal>();
  if ("error" in resolved) return resolved.error;

  try {
    const result = await rollApiKey(resolved.access.context, parsed.data.id);
    if (!result) return { status: "error", message: KEY_NOT_FOUND_MESSAGE };
    revalidateSettings("api-keys");
    return {
      status: "success",
      message: `${result.key.name} rolled — the previous secret is revoked.`,
      data: { id: result.key.id, secret: result.secret, name: result.key.name },
    };
  } catch (error) {
    if (isCrossTenant(error)) return { status: "error", message: KEY_NOT_FOUND_MESSAGE };
    return {
      status: "error",
      message: error instanceof Error ? error.message : "Roll failed.",
    };
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

  const resolved = await settingsAccess();
  if ("error" in resolved) return resolved.error;

  try {
    const entry = await addIpAllowEntry(resolved.access.context, parsed.data.value, parsed.data.label ?? "");
    revalidateSettings("developer");
    return { status: "success", message: `${entry.value} added to the allowlist.` };
  } catch (error) {
    if (isCrossTenant(error)) return { status: "error", message: "Could not add that IP." };
    return { status: "error", message: error instanceof Error ? error.message : "Could not add that IP." };
  }
}

export async function removeIpAllowAction(
  _prev: ActionState | undefined,
  formData: FormData
): Promise<ActionState> {
  const id = String(formData.get("id") ?? "").trim();
  if (!id) return { status: "error", message: "Missing allowlist entry." };

  const resolved = await settingsAccess();
  if ("error" in resolved) return resolved.error;

  try {
    const removed = await removeIpAllowEntry(resolved.access.context, id);
    if (!removed) return { status: "error", message: "That entry was already removed." };
    revalidateSettings("developer");
    return { status: "success", message: "Allowlist entry removed." };
  } catch (error) {
    // Removing another tenant's IP rule would be a denial-of-service on their
    // integration, so the DAL refuses it; on the wire it is indistinguishable
    // from an entry that is simply gone.
    if (isCrossTenant(error)) return { status: "error", message: "That entry was already removed." };
    return denied(error);
  }
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

  const resolved = await settingsAccess();
  if ("error" in resolved) return resolved.error;

  try {
    await setDeveloperToggle(resolved.access.context, parsed.data.field, parsed.data.enabled);
    revalidateSettings("developer");
    return {
      status: "success",
      message: `Sandbox mode ${parsed.data.enabled ? "on" : "off"}.`,
    };
  } catch (e) {
    return denied(e);
  }
}
