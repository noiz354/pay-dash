import type { Metadata } from "next";
import { Link } from "@/i18n/navigation";
import { SettingsNav } from "@/components/settings/settings-nav";
import { ApiKeysTable } from "@/components/settings/api-keys-table";
import { CreateApiKeyDialog } from "@/components/settings/create-api-key-dialog";
import { listApiKeys } from "@/server/data/settings";

export const metadata: Metadata = {
  title: "API Keys · Settings",
  description: "Secret keys for the live and sandbox environments.",
};

export default async function ApiKeysPage() {
  const keys = await listApiKeys();
  const live = keys.filter((k) => k.environment === "LIVE");
  const test = keys.filter((k) => k.environment === "TEST");

  return (
    <main className="mx-auto w-full max-w-container-max p-gutter space-y-6">
      <nav aria-label="Breadcrumb" className="body-sm flex items-center gap-2 text-[var(--on-surface-variant)]">
        <Link href="/settings" className="transition-colors hover:text-[var(--primary)]">
          Settings
        </Link>
        <span className="material-symbols-outlined text-[14px]" aria-hidden="true">
          chevron_right
        </span>
        <span className="text-[var(--on-surface)]">API Keys</span>
      </nav>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="headline-xl text-[var(--on-surface)]">API Key Management</h1>
          <p className="body-sm text-[var(--on-surface-variant)] mt-1">
            Manage secret keys for Production and Sandbox environments. Secrets are shown once at creation.
          </p>
        </div>
        <CreateApiKeyDialog defaultEnvironment="LIVE" triggerLabel="Generate New Key" triggerClassName="shrink-0" />
      </div>

      <SettingsNav />

      <ApiKeysTable
        title="Live Keys"
        description="Production credentials — these move real money."
        environment="LIVE"
        keys={live}
      />

      <ApiKeysTable
        title="Test Keys"
        description="Sandbox credentials — safe for local development and CI."
        environment="TEST"
        keys={test}
      />

      <section className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-container-lowest)] p-6">
        <h2 className="headline-md text-[var(--on-surface)]">Key hygiene</h2>
        <ul className="body-sm mt-2 list-disc space-y-1 pl-5 text-[var(--on-surface-variant)]">
          <li>Roll a key instead of sharing it — rolling issues a replacement and revokes the old secret.</li>
          <li>Scope keys down: a checkout service rarely needs the <span className="data-mono">payouts</span> scope.</li>
          <li>
            Restrict where keys can be used from on the{" "}
            <Link href="/settings/developer" className="text-[var(--primary)] hover:underline">
              developer settings
            </Link>{" "}
            page.
          </li>
        </ul>
      </section>
    </main>
  );
}
