import "server-only";

import {
  DIGEST_OPTIONS,
  KEY_ENVIRONMENTS,
  KEY_SCOPES,
  type DigestFrequency,
  type KeyEnvironment,
  type KeyScope,
  type KeyStatus,
  type NotificationChannel,
} from "@/lib/settings-options";
import { DEFAULT_DEMO_ORG } from "@/domain/payments/runtime-defaults";
import { parseOrganizationContext, type OrganizationContext } from "@/domain/tenancy/organization-context";
import { TenantIsolationError } from "@/domain/security/tenant";
import { recordTenantDenial } from "@/server/services/tenant-denial";

export { DIGEST_OPTIONS, KEY_ENVIRONMENTS, KEY_SCOPES };
export type { DigestFrequency, KeyEnvironment, KeyScope, KeyStatus, NotificationChannel };

// ---------------------------------------------------------------------------
// Settings data source.
//
// Every settings screen shipped as a static form: inputs with `defaultValue`,
// switches with `defaultChecked`, keys printed as string literals, and a Save
// button that saved nothing. This module is the seam that makes them real —
// one in-memory store per concern, the same swap-for-Prisma shape as
// `transactions.ts`, `customers.ts` and `invoices.ts`.
// ---------------------------------------------------------------------------

export type MerchantProfile = {
  legalName: string;
  dba: string;
  address: string;
  city: string;
  state: string;
  postalCode: string;
  taxId: string;
  supportEmail: string;
  statementDescriptor: string;
  brandColor: string;
  logoUrl: string;
  autoDebit: boolean;
  updatedAt: string | null;
};

export type NotificationTopic = {
  id: string;
  label: string;
  description: string;
  /** Critical topics cannot be silenced — the UI shows them locked. */
  critical: boolean;
  digest: DigestFrequency;
  dashboard: boolean;
  sms: boolean;
  email: boolean;
};

export type NotificationSettings = {
  channels: Record<NotificationChannel, boolean>;
  topics: NotificationTopic[];
  updatedAt: string | null;
};

export type ApiKey = {
  id: string;
  /**
   * Wave 7F — the owning tenant. A key is a tenant-bound secret: listing
   * another tenant's keys is a secret leak, not a display bug (spec P-4), so the
   * row carries its owner and every read below is partition-bound.
   */
  organizationId: string;
  name: string;
  environment: KeyEnvironment;
  maskedSecret: string;
  createdAt: string;
  lastUsedAt: string | null;
  status: KeyStatus;
  scopes: KeyScope[];
  rolledFrom?: string;
};

export type IpAllowEntry = {
  id: string;
  value: string;
  label: string;
  createdAt: string;
};

export type DeveloperSettings = {
  sandboxMode: boolean;
  ipAllowlist: IpAllowEntry[];
  updatedAt: string | null;
};

type TenantSettingsState = {
  merchant: MerchantProfile;
  notifications: NotificationSettings;
  keys: ApiKey[];
  developer: DeveloperSettings;
};
type Store = { tenants: Map<string, TenantSettingsState> };

// --- defaults ---------------------------------------------------------------
//
// Two kinds of default, and the difference is the whole Wave 7F point:
//
//   demoState()  — the prototype persona the static screens displayed: Acme
//                  Corporation LLC, its tax id, its three API keys, its two
//                  allowlisted IPs. That is *one tenant's* data, so it is seeded
//                  into DEFAULT_DEMO_ORG only (the 7C/7D seed rule).
//   freshState() — what any other tenant starts with (below): a blank legal
//                  identity, the product's notification vocabulary (a catalog,
//                  not data), no keys and no IP rules. Inheriting the demo
//                  persona would hand every new merchant somebody else's legal
//                  name, tax id and live API keys — a leak dressed as a default.

/**
 * The notification catalog is product vocabulary, not tenant data: every
 * tenant starts with the same five topics and the same defaults. What differs
 * per tenant is the *preference* layered on top (digest, channels) — see
 * `updateNotificationTopic`, which is partition-bound.
 */
function defaultTopics(): NotificationTopic[] {
  return [
      {
        id: "successful_charges",
        label: "Successful Charges",
        description: "A payment was captured successfully.",
        critical: false,
        digest: "daily",
        dashboard: true,
        sms: false,
        email: true,
      },
      {
        id: "failed_charges",
        label: "Failed Charges",
        description: "A payment attempt was declined by the processor.",
        critical: false,
        digest: "instant",
        dashboard: true,
        sms: true,
        email: true,
      },
      {
        id: "disputes",
        label: "Disputes & Chargebacks",
        description: "A cardholder opened a dispute — response deadlines apply.",
        critical: true,
        digest: "instant",
        dashboard: true,
        sms: true,
        email: true,
      },
      {
        id: "payouts",
        label: "Payouts",
        description: "A payout was initiated, paid or returned.",
        critical: false,
        digest: "daily",
        dashboard: true,
        sms: false,
        email: true,
      },
      {
        id: "invoices",
        label: "Platform Invoices",
        description: "A statement was issued or a payment is overdue.",
        critical: false,
        digest: "weekly",
        dashboard: true,
        sms: false,
        email: true,
      },
  ];
}

function demoState(organizationId: string): TenantSettingsState {
  return {
    merchant: {
      legalName: "Acme Corporation LLC",
      dba: "Acme",
      address: "123 Financial Plaza, Suite 400",
      city: "New York",
      state: "NY",
      postalCode: "10004",
      taxId: "12-3456789",
      supportEmail: "support@acmecorp.com",
      statementDescriptor: "ACME",
      brandColor: "#1a56db",
      logoUrl:
        "https://lh3.googleusercontent.com/aida-public/AB6AXuBG2zIJTW2oZwBPQe4szZvIp0bP8_vupP04z_g7nxbcO-eybPITl8rgr_J4BTEauLXjGMVVnVGrMU1qFNS7iWEdXVv_trIvzfYkaxNeknMaW_7hG4kb2pL0nRLVOKtoOs7wD9BmXgGMYmrabvZotdohv87ZBO3oZUYY91EAGK33C9BkUbUFsFsRHry52K0j9oB7HLd4s4gIPKijfgLHUzYGOARytljBKp0DauwX_gQJ0NBZqt0VythY",
      autoDebit: true,
      updatedAt: null,
    },
    notifications: {
      channels: { email: true, sms: true, dashboard: true },
      topics: defaultTopics(),
      updatedAt: null,
    },
    keys: [
      {
        id: "key_live_main",
        organizationId,
        name: "Production Main",
        environment: "LIVE",
        maskedSecret: "sk_live_••••••••••••4a2b",
        createdAt: "2023-10-12T09:00:00.000Z",
        lastUsedAt: "2026-08-31T22:14:00.000Z",
        status: "ACTIVE",
        scopes: ["read", "write", "payouts", "webhooks"],
      },
      {
        id: "key_live_mobile",
        organizationId,
        name: "Mobile App Prod",
        environment: "LIVE",
        maskedSecret: "sk_live_••••••••••••9x1f",
        createdAt: "2023-11-05T09:00:00.000Z",
        lastUsedAt: "2026-08-29T11:02:00.000Z",
        status: "ACTIVE",
        scopes: ["read", "write"],
      },
      {
        id: "key_test_sandbox",
        organizationId,
        name: "Sandbox Default",
        environment: "TEST",
        maskedSecret: "sk_test_••••••••••••7c3d",
        createdAt: "2023-09-01T09:00:00.000Z",
        lastUsedAt: null,
        status: "ACTIVE",
        scopes: ["read", "write", "webhooks"],
      },
    ],
    developer: {
      sandboxMode: true,
      ipAllowlist: [
        { id: "ip_office", value: "203.0.113.24", label: "HQ office", createdAt: "2024-02-11T09:00:00.000Z" },
        { id: "ip_ci", value: "198.51.100.0/24", label: "CI runners", createdAt: "2024-05-02T09:00:00.000Z" },
      ],
      updatedAt: null,
    },
  };
}

const globalStore = globalThis as unknown as { __kineticSettingsStore?: Store };
function store(): Store {
  if (!globalStore.__kineticSettingsStore) {
    // The demo tenant is seeded eagerly so a first read renders the prototype
    // world; every other tenant materialises on its first *write* only, so a
    // read cannot invent a tenant (and cannot inflate the probe counts).
    globalStore.__kineticSettingsStore = {
      tenants: new Map<string, TenantSettingsState>([[DEFAULT_DEMO_ORG, demoState(DEFAULT_DEMO_ORG)]]),
    };
  }
  return globalStore.__kineticSettingsStore;
}

/** A non-demo tenant's starting state: no persona, no secrets, no IP rules. */
function freshState(): TenantSettingsState {
  return {
    merchant: {
      legalName: "",
      dba: "",
      address: "",
      city: "",
      state: "",
      postalCode: "",
      taxId: "",
      supportEmail: "",
      statementDescriptor: "",
      brandColor: "#1a56db",
      logoUrl: "",
      // Auto-debit is a mandate the merchant grants, not a default: a new
      // tenant has not granted one, and the billing card must not claim it.
      autoDebit: false,
      updatedAt: null,
    },
    notifications: {
      channels: { email: true, sms: true, dashboard: true },
      topics: defaultTopics(),
      updatedAt: null,
    },
    keys: [],
    developer: { sandboxMode: true, ipAllowlist: [], updatedAt: null },
  };
}

/* --------------------------- tenancy seam helpers -------------------------- */

/** Validate the caller's context at the boundary (contract C-1/C-2). */
function scopeOf(ctx: OrganizationContext): OrganizationContext {
  return parseOrganizationContext(ctx);
}

/** The caller's settings. Falls back to a *fresh* state, never to a neighbour's. */
function readState(organizationId: string): TenantSettingsState {
  return store().tenants.get(organizationId) ?? freshState();
}

/** The caller's settings, materialised for a write. */
function writeState(organizationId: string): TenantSettingsState {
  const s = store();
  let partition = s.tenants.get(organizationId);
  if (!partition) {
    partition = freshState();
    s.tenants.set(organizationId, partition);
  }
  return partition;
}

/**
 * How many tenants hold settings. Tenancy *probe*: answers a question about the
 * store, never a profile, a key or an IP rule — it is the quarantine gate and
 * the seam's demo-fallback refusal, so it cannot take a ctx (7C/7D precedent).
 */
export function countSettingsTenants(): number {
  return store().tenants.size;
}

/** The only settings-holding tenant, or `null` when there is not exactly one. */
export function soleSettingsOrganizationId(): string | null {
  const ids = [...store().tenants.keys()];
  return ids.length === 1 ? (ids[0] ?? null) : null;
}

/**
 * Which other tenant (if any) holds an API key with this id. The settings store
 * is this module's own, so attribution is exact rather than bounded (contrast
 * 7D's ledger-derived invoices, where naming an owner would have needed a 7A
 * enumerator that does not exist). Returns an org id only — never a key name,
 * mask or scope — and is consulted *after* the caller's partition answered
 * `null`, so it cannot widen a read.
 */
function keyOwnedByAnotherTenant(organizationId: string, id: string): string | null {
  for (const [tenantId, state] of store().tenants.entries()) {
    if (tenantId === organizationId) continue;
    if (state.keys.some((k) => k.id === id)) return tenantId;
  }
  return null;
}

/** As above for an IP allowlist entry. */
function ipEntryOwnedByAnotherTenant(organizationId: string, id: string): string | null {
  for (const [tenantId, state] of store().tenants.entries()) {
    if (tenantId === organizationId) continue;
    if (state.developer.ipAllowlist.some((e) => e.id === id)) return tenantId;
  }
  return null;
}

/**
 * Refuse a write on another tenant's record: audited, then thrown. The wire
 * answer is the caller's uniform not-found string, so "not yours" and "does not
 * exist" stay indistinguishable while the denial sink keeps the asymmetry for
 * operators (contract C-4/C-5). A `null` owner means nobody holds the id, which
 * the caller answers as not-found.
 */
function refuseForeign(surface: string, organizationId: string, id: string, owner: string | null): void {
  if (!owner) return;
  recordTenantDenial({
    surface,
    actorOrganizationId: organizationId,
    requestedOrganizationId: owner,
    actorId: null,
    resourceId: typeof id === "string" ? id : null,
  });
  throw new TenantIsolationError(
    "CROSS_TENANT_WRITE",
    { surface, actorOrg: organizationId, requestedOrg: owner },
    `Refusing a cross-tenant write on ${surface}: the record belongs to another organization.`,
  );
}

// --- merchant profile -------------------------------------------------------

export async function getMerchantProfile(ctx: OrganizationContext): Promise<MerchantProfile> {
  const { organizationId } = scopeOf(ctx);
  // A tenant that has never saved a profile reads its own *blank* defaults —
  // never a neighbour's legal name and tax id (spec P-3). Copy on the way out,
  // so a caller cannot mutate the store through the answer.
  return { ...readState(organizationId).merchant };
}

export type MerchantProfileInput = Partial<Omit<MerchantProfile, "updatedAt">>;

/**
 * Persist merchant profile edits.
 *
 * Wave 7F pins the order (spec F-13b): resolve the tenant, then write — and the
 * write can only ever land in the caller's own partition. The input carries no
 * tenant field, so there is no way to *address* another merchant's legal
 * identity; before this wave one process-wide record meant any caller's edit
 * rewrote everyone's.
 */
export async function updateMerchantProfile(
  ctx: OrganizationContext,
  input: MerchantProfileInput,
): Promise<MerchantProfile> {
  const { organizationId } = scopeOf(ctx);
  const state = writeState(organizationId);
  state.merchant = {
    ...state.merchant,
    ...Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined)),
    updatedAt: new Date().toISOString(),
  } as MerchantProfile;
  return { ...state.merchant };
}

// --- notifications ----------------------------------------------------------

export async function getNotificationSettings(ctx: OrganizationContext): Promise<NotificationSettings> {
  const { organizationId } = scopeOf(ctx);
  const s = readState(organizationId).notifications;
  return { channels: { ...s.channels }, topics: s.topics.map((t) => ({ ...t })), updatedAt: s.updatedAt };
}

/**
 * Delivery preferences are per tenant. The topic *catalog* is product vocabulary
 * (every tenant starts with the same five topics), but a toggle is that
 * tenant's own choice: muting payouts for one merchant must not mute them for
 * another.
 */
export async function setNotificationChannel(
  ctx: OrganizationContext,
  channel: NotificationChannel,
  enabled: boolean,
): Promise<NotificationSettings> {
  const { organizationId } = scopeOf(ctx);
  const state = writeState(organizationId);
  state.notifications.channels[channel] = enabled;
  state.notifications.updatedAt = new Date().toISOString();
  return getNotificationSettings(ctx);
}

export type TopicUpdate = {
  topicId: string;
  digest?: DigestFrequency;
  dashboard?: boolean;
  sms?: boolean;
  email?: boolean;
};

/**
 * Mute/retune one topic. The topic id is the same string in every tenant, so it
 * is only unique as the composite `(organizationId, topicId)` — the lookup runs
 * inside the caller's partition, exactly like 7D's colliding invoice month.
 */
export async function updateNotificationTopic(
  ctx: OrganizationContext,
  update: TopicUpdate,
): Promise<NotificationTopic | null> {
  const { organizationId } = scopeOf(ctx);
  const state = writeState(organizationId);
  const topic = state.notifications.topics.find((t) => t.id === update.topicId);
  if (!topic) return null;
  if (topic.critical && (update.digest === "off" || update.dashboard === false)) {
    throw new Error(`${topic.label} is a critical alert and cannot be silenced`);
  }
  if (update.digest !== undefined) topic.digest = update.digest;
  if (update.dashboard !== undefined) topic.dashboard = update.dashboard;
  if (update.sms !== undefined) topic.sms = update.sms;
  if (update.email !== undefined) topic.email = update.email;
  state.notifications.updatedAt = new Date().toISOString();
  return { ...topic };
}

// --- API keys ---------------------------------------------------------------

/**
 * List the caller's keys.
 *
 * This is a **secret surface**: names, environments, scopes and masked secrets
 * of another tenant's keys are a leak, not a display bug (spec P-4). The
 * partition is applied before the environment filter, so no filter can widen the
 * answer, and a plaintext secret — revealed exactly once at creation — never
 * resurfaces here for anybody.
 */
export async function listApiKeys(ctx: OrganizationContext, environment?: KeyEnvironment): Promise<ApiKey[]> {
  const { organizationId } = scopeOf(ctx);
  const keys = readState(organizationId).keys.map((k) => ({ ...k }));
  const filtered = environment ? keys.filter((k) => k.environment === environment) : keys;
  return filtered.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** Read one key. A foreign id and an unknown id answer identically: `null` (C-5). */
export async function getApiKey(ctx: OrganizationContext, id: string): Promise<ApiKey | null> {
  const { organizationId } = scopeOf(ctx);
  const key = readState(organizationId).keys.find((k) => k.id === id);
  return key ? { ...key } : null;
}

/**
 * Ids are unique **per mint**, not per millisecond.
 *
 * `Date.now().toString(36)` on its own collides for two mints inside the same
 * tick, and both flavours of that collision are defects rather than cosmetics:
 * inside one partition, two rows answer the same `find` (a roll would leave the
 * *new* key answering for the old id, so the revoked key looks active); across
 * partitions, two tenants hold the same id and every log line, denial record and
 * audit event that names one becomes ambiguous. A monotonic sequence plus a
 * little entropy removes both.
 */
let mintSeq = 0;
function mintId(prefix: string): string {
  mintSeq += 1;
  return `${prefix}${Date.now().toString(36)}${mintSeq.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

function randomSecret(environment: KeyEnvironment) {
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  let body = "";
  for (let i = 0; i < 24; i++) body += alphabet[Math.floor(Math.random() * alphabet.length)];
  return `sk_${environment.toLowerCase()}_${body}`;
}

export type CreateApiKeyInput = {
  name: string;
  environment: KeyEnvironment;
  scopes: KeyScope[];
};

/**
 * Returns the plaintext secret **once**. The store only ever keeps the mask,
 * which is why the create dialog has a reveal-once step.
 *
 * The new key is bound to the caller's tenant: `organizationId` comes from the
 * context, never from the input (spec P-10 — membership/context is the tenant
 * edge, so a caller cannot mint a key into somebody else's partition).
 */
export async function createApiKey(
  ctx: OrganizationContext,
  input: CreateApiKeyInput,
): Promise<{ key: ApiKey; secret: string }> {
  const { organizationId } = scopeOf(ctx);
  const secret = randomSecret(input.environment);
  const key: ApiKey = {
    id: mintId("key_"),
    organizationId,
    name: input.name.trim(),
    environment: input.environment,
    maskedSecret: `${secret.slice(0, 8)}${"•".repeat(12)}${secret.slice(-4)}`,
    createdAt: new Date().toISOString(),
    lastUsedAt: null,
    status: "ACTIVE",
    scopes: input.scopes.length ? input.scopes : ["read"],
  };
  writeState(organizationId).keys.unshift(key);
  return { key: { ...key }, secret };
}

/**
 * Revoke is a status change — the audit trail keeps the record.
 *
 * Revoking another tenant's key is a denial-of-service on their live
 * integration, so a foreign id is refused loudly (audited, `TenantIsolationError`)
 * rather than answered `null`: `null` means "no such key of yours", never
 * "someone else's key is safe" (C-4).
 */
export async function revokeApiKey(ctx: OrganizationContext, id: string): Promise<ApiKey | null> {
  const { organizationId } = scopeOf(ctx);
  const state = writeState(organizationId);
  const key = state.keys.find((k) => k.id === id);
  if (!key) {
    refuseForeign("server/data/settings.revokeApiKey", organizationId, id, keyOwnedByAnotherTenant(organizationId, id));
    return null;
  }
  if (key.status === "REVOKED") throw new Error(`${key.name} is already revoked`);
  key.status = "REVOKED";
  return { ...key };
}

/** Roll = create a replacement with the same name/scopes, revoke the old one. */
export async function rollApiKey(
  ctx: OrganizationContext,
  id: string,
): Promise<{ key: ApiKey; secret: string } | null> {
  const { organizationId } = scopeOf(ctx);
  const state = writeState(organizationId);
  const old = state.keys.find((k) => k.id === id);
  if (!old) {
    // Refuse *before* minting anything: a foreign roll must not create a
    // replacement key in the attacker's partition either (that would be a
    // same-name clone of a secret they do not own).
    refuseForeign("server/data/settings.rollApiKey", organizationId, id, keyOwnedByAnotherTenant(organizationId, id));
    return null;
  }
  if (old.status === "REVOKED") throw new Error(`${old.name} is revoked — create a new key instead`);
  const created = await createApiKey(ctx, { name: old.name, environment: old.environment, scopes: old.scopes });
  const stored = writeState(organizationId).keys.find((k) => k.id === created.key.id);
  if (stored) stored.rolledFrom = old.id;
  old.status = "REVOKED";
  return { key: { ...created.key, rolledFrom: old.id }, secret: created.secret };
}

// --- developer --------------------------------------------------------------

export async function getDeveloperSettings(ctx: OrganizationContext): Promise<DeveloperSettings> {
  const { organizationId } = scopeOf(ctx);
  const d = readState(organizationId).developer;
  return { ...d, ipAllowlist: d.ipAllowlist.map((e) => ({ ...e })) };
}

export async function setDeveloperToggle(
  ctx: OrganizationContext,
  field: "sandboxMode",
  enabled: boolean,
): Promise<DeveloperSettings> {
  const { organizationId } = scopeOf(ctx);
  const state = writeState(organizationId);
  state.developer[field] = enabled;
  state.developer.updatedAt = new Date().toISOString();
  return getDeveloperSettings(ctx);
}

/**
 * Allowlist an IP. Uniqueness is *per tenant*: two merchants may both allowlist
 * the same office IP, and one tenant's rule must not block another's.
 */
export async function addIpAllowEntry(
  ctx: OrganizationContext,
  value: string,
  label: string,
): Promise<IpAllowEntry> {
  const { organizationId } = scopeOf(ctx);
  const state = writeState(organizationId);
  const normalised = value.trim();
  if (state.developer.ipAllowlist.some((e) => e.value === normalised)) {
    throw new Error(`${normalised} is already on the allowlist`);
  }
  const entry: IpAllowEntry = {
    id: mintId("ip_"),
    value: normalised,
    label: label.trim() || "Untitled",
    createdAt: new Date().toISOString(),
  };
  state.developer.ipAllowlist.push(entry);
  state.developer.updatedAt = new Date().toISOString();
  return { ...entry };
}

/** Removing a foreign rule is refused (audited), not answered `false`. */
export async function removeIpAllowEntry(ctx: OrganizationContext, id: string): Promise<boolean> {
  const { organizationId } = scopeOf(ctx);
  const state = writeState(organizationId);
  const before = state.developer.ipAllowlist.length;
  if (!state.developer.ipAllowlist.some((e) => e.id === id)) {
    refuseForeign(
      "server/data/settings.removeIpAllowEntry",
      organizationId,
      id,
      ipEntryOwnedByAnotherTenant(organizationId, id),
    );
    return false;
  }
  state.developer.ipAllowlist = state.developer.ipAllowlist.filter((e) => e.id !== id);
  const removed = state.developer.ipAllowlist.length < before;
  if (removed) state.developer.updatedAt = new Date().toISOString();
  return removed;
}

// --- overview (the settings hub) --------------------------------------------

export type SettingsSectionSummary = {
  id: string;
  href: string;
  title: string;
  description: string;
  icon: string;
  status: string;
  tone: "ok" | "attention";
};

/**
 * The hub cards. An aggregate is a leak vector too: "2 live keys active" or
 * "Acme Corporation LLC" on a tenant that has neither would disclose another
 * merchant's posture, so every input below is the caller's own partition.
 */
export async function getSettingsOverview(ctx: OrganizationContext): Promise<SettingsSectionSummary[]> {
  scopeOf(ctx);
  const merchant = await getMerchantProfile(ctx);
  const notifications = await getNotificationSettings(ctx);
  const keys = await listApiKeys(ctx);
  const developer = await getDeveloperSettings(ctx);

  const activeLive = keys.filter((k) => k.environment === "LIVE" && k.status === "ACTIVE").length;
  const mutedTopics = notifications.topics.filter((t) => t.digest === "off").length;

  return [
    {
      id: "merchant",
      href: "/settings/merchant",
      title: "Merchant Profile",
      description: "Business identity, contact details and platform branding.",
      icon: "store",
      // Lead with the legal name: an aggregate that said only "Saved just now"
      // would hide *whose* profile the card summarises — and for a tenant that
      // has saved nothing, "Incomplete" is the honest answer rather than a
      // neighbour's persona.
      status: merchant.legalName
        ? merchant.updatedAt
          ? `${merchant.legalName} · Saved just now`
          : merchant.legalName
        : "Incomplete",
      tone: merchant.legalName ? "ok" : "attention",
    },
    {
      id: "notifications",
      href: "/settings/notifications",
      title: "Notification Preferences",
      description: "Who gets told what, and how quickly.",
      icon: "notifications",
      status: mutedTopics
        ? `${mutedTopics} topic${mutedTopics === 1 ? "" : "s"} muted`
        : "All topics active",
      tone: mutedTopics ? "attention" : "ok",
    },
    {
      id: "api-keys",
      href: "/settings/api-keys",
      title: "API Keys",
      description: "Secret keys for the live and sandbox environments.",
      icon: "key",
      status: `${activeLive} live key${activeLive === 1 ? "" : "s"} active`,
      tone: activeLive === 0 ? "attention" : "ok",
    },
    {
      id: "developer",
      href: "/settings/developer",
      title: "Developer",
      description: "Sandbox mode, webhook retries and the IP allowlist.",
      icon: "code",
      status: `${developer.ipAllowlist.length} IP rule${developer.ipAllowlist.length === 1 ? "" : "s"}`,
      tone: "ok",
    },
  ];
}
