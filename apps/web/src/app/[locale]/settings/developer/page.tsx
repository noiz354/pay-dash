import type { Metadata } from "next";
import { Link } from "@/i18n/navigation";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SettingsNav } from "@/components/settings/settings-nav";
import { DeveloperToggle } from "@/components/settings/developer-toggle";
import { IpAllowlistManager } from "@/components/settings/ip-allowlist-manager";
import { CreateApiKeyDialog } from "@/components/settings/create-api-key-dialog";
import { getDeveloperSettings, listApiKeys } from "@/server/data/settings";
import { formatRelative } from "@/lib/format";

export const metadata: Metadata = {
  title: "Developer · Settings",
  description: "Sandbox mode, webhook retries and the IP allowlist.",
};

const WEBHOOKS = [
  { url: "https://api.acme.com/webhooks/ledger", events: "payment.*", status: "Active" as const },
  { url: "https://staging.acme.com/hooks/sync", events: "customer.*", status: "Failing" as const },
];

export default async function DeveloperSettingsPage() {
  const [developer, keys] = await Promise.all([getDeveloperSettings(), listApiKeys()]);
  const activeKeys = keys.filter((k) => k.status === "ACTIVE");

  return (
    <main className="mx-auto w-full max-w-container-max p-gutter space-y-6">
      <nav aria-label="Breadcrumb" className="body-sm flex items-center gap-2 text-[var(--on-surface-variant)]">
        <Link href="/settings" className="transition-colors hover:text-[var(--primary)]">
          Settings
        </Link>
        <span className="material-symbols-outlined text-[14px]" aria-hidden="true">
          chevron_right
        </span>
        <span className="text-[var(--on-surface)]">Developer</span>
      </nav>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="headline-xl text-[var(--on-surface)]">Developer Settings</h1>
          <p className="body-sm text-[var(--on-surface-variant)] mt-1">
            Manage API keys, webhooks, and access controls.
          </p>
        </div>
      </div>

      <SettingsNav />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="space-y-6 lg:col-span-8">
          <Card className="overflow-hidden p-0">
            <div className="border-b border-[var(--border-subtle)] bg-[var(--surface)] px-6 py-4">
              <h2 className="headline-md text-[var(--on-surface)]">Environment</h2>
              <p className="body-sm text-[var(--on-surface-variant)]">
                Controls that change how the API behaves for every integration.
              </p>
            </div>
            <div className="divide-y divide-[var(--border-subtle)]">
              <DeveloperToggle
                field="sandboxMode"
                icon="science"
                label="Sandbox mode"
                description="Route dashboard requests to test data instead of live money."
                enabled={developer.sandboxMode}
              />
              <DeveloperToggle
                field="webhookRetries"
                icon="replay"
                label="Webhook retries"
                description="Retry failed deliveries with exponential backoff for 24 hours."
                enabled={developer.webhookRetries}
              />
            </div>
          </Card>

          <Card className="overflow-hidden p-0">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border-subtle)] bg-[var(--surface)] px-6 py-4">
              <div>
                <h2 className="headline-md text-[var(--on-surface)]">API Keys</h2>
                <p className="body-sm text-[var(--on-surface-variant)] mt-1">
                  {activeKeys.length} active credential{activeKeys.length === 1 ? "" : "s"} authenticate requests
                  to The Ledger API.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Link
                  href="/settings/api-keys"
                  className="label-md rounded-lg border border-[var(--border-subtle)] px-3 py-2 text-[var(--on-surface)] hover:bg-[var(--surface-container-low)]"
                >
                  Manage keys
                </Link>
                <CreateApiKeyDialog defaultEnvironment="TEST" triggerLabel="Generate Key" />
              </div>
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="label-caps bg-[var(--surface-container-low)]">
                  <TableRow>
                    <TableHead className="label-caps text-[var(--on-surface-variant)]">Name</TableHead>
                    <TableHead className="label-caps text-[var(--on-surface-variant)]">Token</TableHead>
                    <TableHead className="label-caps text-right text-[var(--on-surface-variant)]">
                      Last used
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {activeKeys.map((key) => (
                    <TableRow key={key.id} className="hover:bg-[var(--surface-container)]/50">
                      <TableCell className="body-sm text-[var(--on-surface)]">{key.name}</TableCell>
                      <TableCell className="data-mono text-[var(--on-surface-variant)]">
                        {key.maskedSecret}
                      </TableCell>
                      <TableCell className="body-sm text-right text-[var(--on-surface-variant)]">
                        {key.lastUsedAt ? formatRelative(key.lastUsedAt) : "Never used"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </Card>

          <Card className="overflow-hidden p-0">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border-subtle)] bg-[var(--surface)] px-6 py-4">
              <div>
                <h2 className="headline-md text-[var(--on-surface)]">Webhook Endpoints</h2>
                <p className="body-sm text-[var(--on-surface-variant)] mt-1">
                  Receive real-time event notifications.
                </p>
              </div>
              <Link
                href="/webhooks"
                className="label-md rounded-lg border border-[var(--border-subtle)] px-3 py-2 text-[var(--on-surface)] hover:bg-[var(--surface-container-low)]"
              >
                Open webhook console
              </Link>
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="label-caps bg-[var(--surface-container-low)]">
                  <TableRow>
                    <TableHead className="label-caps text-[var(--on-surface-variant)]">Status</TableHead>
                    <TableHead className="label-caps text-[var(--on-surface-variant)]">URL</TableHead>
                    <TableHead className="label-caps text-right text-[var(--on-surface-variant)]">Events</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {WEBHOOKS.map((hook) => (
                    <TableRow key={hook.url} className="hover:bg-[var(--surface-container)]/50">
                      <TableCell>
                        <span
                          className={
                            hook.status === "Active"
                              ? "label-caps inline-flex items-center gap-1.5 rounded-full border border-[var(--success-status)]/20 bg-[var(--status-success-bg)] px-2 py-0.5 text-[10px] text-[var(--success-status)]"
                              : "label-caps inline-flex items-center gap-1.5 rounded-full border border-[var(--failed-status)]/20 bg-[var(--status-error-bg)] px-2 py-0.5 text-[10px] text-[var(--failed-status)]"
                          }
                        >
                          <span
                            className={
                              hook.status === "Active"
                                ? "h-1.5 w-1.5 rounded-full bg-[var(--success-status)]"
                                : "h-1.5 w-1.5 rounded-full bg-[var(--failed-status)]"
                            }
                          />
                          {hook.status}
                        </span>
                      </TableCell>
                      <TableCell className="data-mono max-w-[240px] truncate text-[var(--on-surface)]">
                        {hook.url}
                      </TableCell>
                      <TableCell className="body-sm text-right text-[var(--on-surface-variant)]">
                        {hook.events}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </Card>
        </div>

        <div className="space-y-6 lg:col-span-4">
          <IpAllowlistManager entries={developer.ipAllowlist} />

          <Link
            href="/support"
            className="group relative block overflow-hidden rounded-xl bg-[var(--surface-tint)] p-6 text-[var(--on-primary)] shadow-sm transition-opacity hover:opacity-95"
          >
            <div className="absolute -right-4 -bottom-4 opacity-10 transition-transform duration-500 group-hover:scale-110">
              <span className="material-symbols-outlined text-9xl" aria-hidden="true">
                menu_book
              </span>
            </div>
            <div className="relative z-10">
              <span className="material-symbols-outlined mb-3 text-3xl" aria-hidden="true">
                api
              </span>
              <h3 className="headline-md mb-1 font-bold">API Documentation</h3>
              <p className="body-sm mb-4 text-[var(--on-primary-container)] opacity-90">
                Explore guides, SDKs and endpoint references, or open a ticket with the integrations team.
              </p>
              <span className="label-caps inline-flex items-center gap-1">
                View Docs
                <span className="material-symbols-outlined text-sm" aria-hidden="true">
                  arrow_forward
                </span>
              </span>
            </div>
          </Link>
        </div>
      </div>
    </main>
  );
}
