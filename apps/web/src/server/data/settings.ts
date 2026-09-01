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
  webhookRetries: boolean;
  ipAllowlist: IpAllowEntry[];
  updatedAt: string | null;
};

type Store = {
  merchant: MerchantProfile;
  notifications: NotificationSettings;
  keys: ApiKey[];
  developer: DeveloperSettings;
};

// --- defaults (the values the static screens displayed) ---------------------

function defaultStore(): Store {
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
      topics: [
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
      ],
      updatedAt: null,
    },
    keys: [
      {
        id: "key_live_main",
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
      webhookRetries: true,
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
  if (!globalStore.__kineticSettingsStore) globalStore.__kineticSettingsStore = defaultStore();
  return globalStore.__kineticSettingsStore;
}

// --- merchant profile -------------------------------------------------------

export async function getMerchantProfile(): Promise<MerchantProfile> {
  return { ...store().merchant };
}

export type MerchantProfileInput = Partial<Omit<MerchantProfile, "updatedAt">>;

export async function updateMerchantProfile(input: MerchantProfileInput): Promise<MerchantProfile> {
  const s = store();
  s.merchant = {
    ...s.merchant,
    ...Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined)),
    updatedAt: new Date().toISOString(),
  } as MerchantProfile;
  return { ...s.merchant };
}

// --- notifications ----------------------------------------------------------

export async function getNotificationSettings(): Promise<NotificationSettings> {
  const s = store().notifications;
  return { channels: { ...s.channels }, topics: s.topics.map((t) => ({ ...t })), updatedAt: s.updatedAt };
}

export async function setNotificationChannel(
  channel: NotificationChannel,
  enabled: boolean
): Promise<NotificationSettings> {
  const s = store();
  s.notifications.channels[channel] = enabled;
  s.notifications.updatedAt = new Date().toISOString();
  return getNotificationSettings();
}

export type TopicUpdate = {
  topicId: string;
  digest?: DigestFrequency;
  dashboard?: boolean;
  sms?: boolean;
  email?: boolean;
};

export async function updateNotificationTopic(update: TopicUpdate): Promise<NotificationTopic | null> {
  const s = store();
  const topic = s.notifications.topics.find((t) => t.id === update.topicId);
  if (!topic) return null;
  if (topic.critical && (update.digest === "off" || update.dashboard === false)) {
    throw new Error(`${topic.label} is a critical alert and cannot be silenced`);
  }
  if (update.digest !== undefined) topic.digest = update.digest;
  if (update.dashboard !== undefined) topic.dashboard = update.dashboard;
  if (update.sms !== undefined) topic.sms = update.sms;
  if (update.email !== undefined) topic.email = update.email;
  s.notifications.updatedAt = new Date().toISOString();
  return { ...topic };
}

// --- API keys ---------------------------------------------------------------

export async function listApiKeys(environment?: KeyEnvironment): Promise<ApiKey[]> {
  const keys = store().keys.map((k) => ({ ...k }));
  const filtered = environment ? keys.filter((k) => k.environment === environment) : keys;
  return filtered.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getApiKey(id: string): Promise<ApiKey | null> {
  return store().keys.find((k) => k.id === id) ?? null;
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
 */
export async function createApiKey(input: CreateApiKeyInput): Promise<{ key: ApiKey; secret: string }> {
  const secret = randomSecret(input.environment);
  const key: ApiKey = {
    id: `key_${Date.now().toString(36)}`,
    name: input.name.trim(),
    environment: input.environment,
    maskedSecret: `${secret.slice(0, 8)}${"•".repeat(12)}${secret.slice(-4)}`,
    createdAt: new Date().toISOString(),
    lastUsedAt: null,
    status: "ACTIVE",
    scopes: input.scopes.length ? input.scopes : ["read"],
  };
  store().keys.unshift(key);
  return { key, secret };
}

/** Revoke is a status change — the audit trail keeps the record. */
export async function revokeApiKey(id: string): Promise<ApiKey | null> {
  const key = store().keys.find((k) => k.id === id);
  if (!key) return null;
  if (key.status === "REVOKED") throw new Error(`${key.name} is already revoked`);
  key.status = "REVOKED";
  return { ...key };
}

/** Roll = create a replacement with the same name/scopes, revoke the old one. */
export async function rollApiKey(id: string): Promise<{ key: ApiKey; secret: string } | null> {
  const old = store().keys.find((k) => k.id === id);
  if (!old) return null;
  if (old.status === "REVOKED") throw new Error(`${old.name} is revoked — create a new key instead`);
  const created = await createApiKey({ name: old.name, environment: old.environment, scopes: old.scopes });
  created.key.rolledFrom = old.id;
  old.status = "REVOKED";
  return created;
}

// --- developer --------------------------------------------------------------

export async function getDeveloperSettings(): Promise<DeveloperSettings> {
  const d = store().developer;
  return { ...d, ipAllowlist: d.ipAllowlist.map((e) => ({ ...e })) };
}

export async function setDeveloperToggle(
  field: "sandboxMode" | "webhookRetries",
  enabled: boolean
): Promise<DeveloperSettings> {
  const s = store();
  s.developer[field] = enabled;
  s.developer.updatedAt = new Date().toISOString();
  return getDeveloperSettings();
}

export async function addIpAllowEntry(value: string, label: string): Promise<IpAllowEntry> {
  const s = store();
  const normalised = value.trim();
  if (s.developer.ipAllowlist.some((e) => e.value === normalised)) {
    throw new Error(`${normalised} is already on the allowlist`);
  }
  const entry: IpAllowEntry = {
    id: `ip_${Date.now().toString(36)}`,
    value: normalised,
    label: label.trim() || "Untitled",
    createdAt: new Date().toISOString(),
  };
  s.developer.ipAllowlist.push(entry);
  s.developer.updatedAt = new Date().toISOString();
  return entry;
}

export async function removeIpAllowEntry(id: string): Promise<boolean> {
  const s = store();
  const before = s.developer.ipAllowlist.length;
  s.developer.ipAllowlist = s.developer.ipAllowlist.filter((e) => e.id !== id);
  const removed = s.developer.ipAllowlist.length < before;
  if (removed) s.developer.updatedAt = new Date().toISOString();
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

export async function getSettingsOverview(): Promise<SettingsSectionSummary[]> {
  const merchant = await getMerchantProfile();
  const notifications = await getNotificationSettings();
  const keys = await listApiKeys();
  const developer = await getDeveloperSettings();

  const activeLive = keys.filter((k) => k.environment === "LIVE" && k.status === "ACTIVE").length;
  const mutedTopics = notifications.topics.filter((t) => t.digest === "off").length;

  return [
    {
      id: "merchant",
      href: "/settings/merchant",
      title: "Merchant Profile",
      description: "Business identity, contact details and platform branding.",
      icon: "store",
      status: merchant.updatedAt ? "Saved just now" : `${merchant.legalName}`,
      tone: "ok",
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
