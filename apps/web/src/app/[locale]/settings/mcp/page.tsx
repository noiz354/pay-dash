import type { Metadata } from "next";
import { Link } from "@/i18n/navigation";
import { Card } from "@/components/ui/card";
import { SettingsNav } from "@/components/settings/settings-nav";
import { McpDataSourceControl } from "@/components/settings/mcp-data-source-control";
import { McpServerControl } from "@/components/settings/mcp-server-control";
import { McpXenditControl } from "@/components/settings/mcp-xendit-control";
import { getRuntimeSettingsAction } from "@/server/actions/runtime";
import { env } from "@/lib/env";

export const metadata: Metadata = {
  title: "MCP & Data · Settings",
  description: "The MCP server, its data source, and live Xendit calls.",
};

export default async function McpSettingsPage() {
  const result = await getRuntimeSettingsAction();
  if (result.status !== "success" || !result.data) {
    return (
      <main className="mx-auto w-full max-w-container-max space-y-6 p-gutter">
        <nav aria-label="Breadcrumb" className="body-sm flex items-center gap-2 text-[var(--on-surface-variant)]">
          <Link href="/settings" className="transition-colors hover:text-[var(--primary)]">
            Settings
          </Link>
          <span className="material-symbols-outlined text-[14px]" aria-hidden="true">
            chevron_right
          </span>
          <span className="text-[var(--on-surface)]">MCP &amp; Data</span>
        </nav>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="headline-xl text-[var(--on-surface)]">MCP &amp; Data</h1>
            <p className="body-sm text-[var(--on-surface-variant)] mt-1">
              Runtime controls for the MCP server and its data source.
            </p>
          </div>
        </div>
        <SettingsNav />
        <p className="body-sm text-[var(--failed-status)]">{result.message}</p>
      </main>
    );
  }

  const { settings, hasCustomToken } = result.data;
  const baseUrl = env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "";
  const endpointUrl = `${baseUrl}/api/mcp`;
  const xenditKeyConfigured = Boolean(env.XENDIT_SECRET_KEY);

  return (
    <main className="mx-auto w-full max-w-container-max p-gutter space-y-6">
      <nav aria-label="Breadcrumb" className="body-sm flex items-center gap-2 text-[var(--on-surface-variant)]">
        <Link href="/settings" className="transition-colors hover:text-[var(--primary)]">
          Settings
        </Link>
        <span className="material-symbols-outlined text-[14px]" aria-hidden="true">
          chevron_right
        </span>
        <span className="text-[var(--on-surface)]">MCP &amp; Data</span>
      </nav>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="headline-xl text-[var(--on-surface)]">MCP &amp; Data</h1>
          <p className="body-sm text-[var(--on-surface-variant)] mt-1">
            Runtime controls for the MCP server, its data source, and live Xendit calls.
          </p>
        </div>
      </div>

      <SettingsNav />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="space-y-6 lg:col-span-8">
          <Card className="overflow-hidden p-0">
            <div className="border-b border-[var(--border-subtle)] bg-[var(--surface)] px-6 py-4">
              <h2 className="headline-md text-[var(--on-surface)]">MCP Server</h2>
              <p className="body-sm text-[var(--on-surface-variant)]">
                Control the tool server, its endpoint and its access token.
              </p>
            </div>
            <McpServerControl
              enabled={settings.mcpEnabled}
              hasCustomToken={hasCustomToken}
              endpointUrl={endpointUrl}
            />
          </Card>

          <Card className="overflow-hidden p-0">
            <div className="border-b border-[var(--border-subtle)] bg-[var(--surface)] px-6 py-4">
              <h2 className="headline-md text-[var(--on-surface)]">Data Source</h2>
              <p className="body-sm text-[var(--on-surface-variant)]">
                Where the MCP server reads and writes its working data.
              </p>
            </div>
            <McpDataSourceControl value={settings.dataSource} />
          </Card>

          <Card className="overflow-hidden p-0">
            <div className="border-b border-[var(--border-subtle)] bg-[var(--surface)] px-6 py-4">
              <h2 className="headline-md text-[var(--on-surface)]">Xendit</h2>
              <p className="body-sm text-[var(--on-surface-variant)]">
                Live payment calls made by the MCP server.
              </p>
            </div>
            <McpXenditControl enabled={settings.xenditEnabled} keyConfigured={xenditKeyConfigured} />
          </Card>
        </div>

        <div className="space-y-6 lg:col-span-4">
          <section className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-container-lowest)] p-6">
            <span className="material-symbols-outlined mb-3 text-3xl text-[var(--primary)]" aria-hidden="true">
              hub
            </span>
            <h3 className="headline-md mb-1 text-[var(--on-surface)]">Runtime settings</h3>
            <p className="body-sm text-[var(--on-surface-variant)]">
              These controls apply immediately to the running MCP server — no redeploy required. Changes are
              persisted and take effect on the next request.
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}
