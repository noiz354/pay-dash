import type { Metadata } from "next";
import { Link } from "@/i18n/navigation";
import { SettingsNav } from "@/components/settings/settings-nav";
import { getSettingsOverview } from "@/server/data/settings";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = {
  title: "Settings",
  description: "Merchant profile, notifications, API keys and developer controls.",
};

/**
 * Settings hub.
 * `/settings` used to 404 even though the sidebar, the billing summary and the
 * invoice row menu all pointed people at this cluster. It is now a real index:
 * every section with its live status, so the page answers "what is configured?"
 * before you click into anything.
 */
export default async function SettingsPage() {
  const sections = await getSettingsOverview();

  return (
    <main className="mx-auto w-full max-w-container-max space-y-6 p-gutter">
      <div>
        <h1 className="headline-xl text-[var(--on-surface)]">Settings</h1>
        <p className="body-md mt-2 max-w-2xl text-[var(--on-surface-variant)]">
          Everything that shapes how the platform behaves for your business — identity, alerts, credentials
          and access controls.
        </p>
      </div>

      <SettingsNav />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {sections.map((section) => (
          <Link
            key={section.id}
            href={section.href}
            className="group flex items-start gap-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-container-lowest)] p-6 transition-colors hover:border-[var(--primary)] hover:bg-[var(--surface-container-low)]"
          >
            <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-[var(--surface-container-high)] text-[var(--on-surface)]">
              <span className="material-symbols-outlined text-[20px]" aria-hidden="true">
                {section.icon}
              </span>
            </span>
            <span className="flex-1">
              <span className="headline-md flex items-center gap-2 text-[var(--on-surface)]">
                {section.title}
                <span className="material-symbols-outlined text-[18px] text-[var(--on-surface-variant)] transition-transform group-hover:translate-x-0.5" aria-hidden="true">
                  chevron_right
                </span>
              </span>
              <span className="body-sm mt-1 block text-[var(--on-surface-variant)]">{section.description}</span>
              <Badge
                className={
                  section.tone === "attention"
                    ? "mt-3 bg-[var(--status-warning-bg,var(--surface-container-high))] text-[var(--on-surface)]"
                    : "mt-3 bg-[var(--surface-container-high)] text-[var(--on-surface-variant)]"
                }
              >
                {section.status}
              </Badge>
            </span>
          </Link>
        ))}
      </div>

      <section className="rounded-xl border border-dashed border-[var(--border-subtle)] p-6">
        <h2 className="headline-md text-[var(--on-surface)]">Related settings</h2>
        <p className="body-sm text-[var(--on-surface-variant)]">
          Some controls live with the feature they govern.
        </p>
        <div className="mt-3 flex flex-wrap gap-3">
          <Link
            href="/payouts/settings"
            className="label-md rounded-lg border border-[var(--border-subtle)] px-3 py-2 text-[var(--on-surface)] hover:bg-[var(--surface-container-low)]"
          >
            Payout schedule &amp; bank accounts
          </Link>
          <Link
            href="/webhooks"
            className="label-md rounded-lg border border-[var(--border-subtle)] px-3 py-2 text-[var(--on-surface)] hover:bg-[var(--surface-container-low)]"
          >
            Webhook endpoints
          </Link>
          <Link
            href="/billing"
            className="label-md rounded-lg border border-[var(--border-subtle)] px-3 py-2 text-[var(--on-surface)] hover:bg-[var(--surface-container-low)]"
          >
            Platform invoices
          </Link>
        </div>
      </section>
    </main>
  );
}
