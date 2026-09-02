import type { Metadata } from "next";
import { headers } from "next/headers";
import { Link } from "@/i18n/navigation";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CopyButton } from "@/components/common/copy-button";
import { SettingsNav } from "@/components/settings/settings-nav";
import { DeveloperToggle } from "@/components/settings/developer-toggle";
import { IpAllowlistManager } from "@/components/settings/ip-allowlist-manager";
import { CreateApiKeyDialog } from "@/components/settings/create-api-key-dialog";
import { getDeveloperSettings, listApiKeys } from "@/server/data/settings";
import { KNOWN_WEBHOOK_EVENTS } from "@/lib/webhook-status";
import { env } from "@/lib/env";
import { formatRelative } from "@/lib/format";

export const metadata: Metadata = {
  title: "Developer · Settings",
  description: "Sandbox mode, the webhook endpoint and the IP allowlist.",
};

// Developer settings. The webhook section states the receive-side truth
// (ADR-0015): this app RECEIVES callbacks (INTEGRATION.md §7) — the card
// shows the real endpoint, whether its token is configured (presence only,
// never the value, same rule as the /webhooks config card) and how retries
// actually work. The prototype's two hard-coded delivery endpoints
// (api.acme.com "Active" / staging.acme.com "Failing") are gone: there is
// nothing in this app that delivers webhooks.
export default async function DeveloperSettingsPage() {
  const [developer, keys] = await Promise.all([getDeveloperSettings(), listApiKeys()]);
  const activeKeys = keys.filter((k) => k.status === "ACTIVE");
  const host = (await headers()).get("host") ?? "localhost:3000";
  const endpointUrl = `https://${host}/api/webhooks/xendit`;
  const tokenConfigured = !!env.XENDIT_WEBHOOK_TOKEN;

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
            Manage API keys, the webhook endpoint, and access controls.
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
            </div>
          </Card>

          <Card className="overflow-hidden p-0">
            <div className="flex-wrap items-center justify-between gap-3 border-b border-[var(--border-subtle)] bg-[var(--surface)] px-6 py-4 flex">
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
            <div className="flex-wrap items-center justify-between gap-3 border-b border-[var(--border-subtle)] bg-[var(--surface)] px-6 py-4 flex">
              <div>
                <h2 className="headline-md text-[var(--on-surface)]">Webhook Endpoint</h2>
                <p className="body-sm text-[var(--on-surface-variant)] mt-1">
                  Where the provider sends callbacks to, and how this app verifies them.
                </p>
              </div>
              <Link
                href="/webhooks"
                className="label-md rounded-lg border border-[var(--border-subtle)] px-3 py-2 text-[var(--on-surface)] hover:bg-[var(--surface-container-low)]"
              >
                Open webhook log
              </Link>
            </div>
            <div className="divide-y divide-[var(--border-subtle)]">
              <div className="px-6 py-4">
                <p className="label-caps text-[11px] text-[var(--on-surface-variant)]">Endpoint</p>
                <div className="mt-1 flex items-center gap-2 flex-wrap">
                  <span className="data-mono text-sm text-[var(--on-surface)] break-all">{endpointUrl}</span>
                  <CopyButton value={endpointUrl} label="Copy URL" />
                </div>
              </div>

              <div className="px-6 py-4">
                <p className="label-caps text-[11px] text-[var(--on-surface-variant)]">Callback token</p>
                <div className="mt-1.5 flex items-start gap-3">
                  <span
                    className={
                      "label-caps inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] " +
                      (tokenConfigured
                        ? "border-[var(--success-status)]/20 bg-[var(--status-success-bg)] text-[var(--success-status)]"
                        : "border-[var(--pending-status)]/20 bg-[var(--pending-status)]/10 text-[var(--pending-status)]")
                    }
                  >
                    <span className="material-symbols-outlined text-[14px]" aria-hidden="true">
                      {tokenConfigured ? "verified_user" : "warning"}
                    </span>
                    {tokenConfigured ? "Token configured (value hidden)" : "No token set — dev accepts without verification"}
                  </span>
                  <p className="body-sm text-[var(--on-surface-variant)]">
                    {tokenConfigured
                      ? "Every callback must carry the matching x-callback-token; others are rejected with 401 and logged."
                      : "Set XENDIT_WEBHOOK_TOKEN in the environment — the endpoint then rejects any callback that doesn't carry it (401, logged). In production an unset token is a hard failure (500)."}
                  </p>
                </div>
              </div>

              <div className="px-6 py-4">
                <p className="label-caps text-[11px] text-[var(--on-surface-variant)]">Handled event types</p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {KNOWN_WEBHOOK_EVENTS.map((t) => (
                    <span
                      key={t}
                      className="data-mono text-[11px] rounded bg-[var(--surface-container-high)] px-1.5 py-0.5 text-[var(--on-surface-variant)]"
                    >
                      {t}
                    </span>
                  ))}
                  <span className="data-mono text-[11px] rounded bg-[var(--surface-container-high)] px-1.5 py-0.5 text-[var(--on-surface-variant)] italic">
                    …stored as unhandled
                  </span>
                </div>
              </div>

              <div className="px-6 py-4">
                <p className="label-caps text-[11px] text-[var(--on-surface-variant)]">Retries</p>
                <p className="body-sm text-[var(--on-surface-variant)] mt-1">
                  The provider re-delivers on non-2xx responses (INTEGRATION.md §7). This endpoint answers 200
                  fast and dedupes by event id, so a re-delivery is logged as{" "}
                  <span className="text-[var(--pending-status)] font-medium">Duplicated</span> — never processed
                  twice (ADR-0014).
                </p>
              </div>
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
