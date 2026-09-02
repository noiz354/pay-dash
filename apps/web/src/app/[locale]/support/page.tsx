import type { Metadata } from "next";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { supportMailto } from "@/lib/support";

// Support & Documentation (ADR-0016). Static by design (INTEGRATION.md:
// "Static content; no API") — so every affordance on the page is either a
// real link into the app or a real mailto. The prototype's four href="#"
// topic cards, the invented "all subsystems Operational" rows, the dead
// Cmd+K search and the no-op Live Chat / Ticket History buttons are gone.
// ?ref is honoured: transaction rows and the transaction detail page
// deep-link here ("Report issue"), and the reference lands in the email
// subject so the report arrives with its context.
export const metadata: Metadata = {
  title: "Support — Kinetic Ledger",
  description: "Where to go: topic pages, platform status and a support email that carries the context of what you're reporting.",
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const TOPICS = [
  {
    href: "/settings/api-keys",
    icon: "api",
    title: "API Reference",
    description: "Credentials, scopes, and the webhook endpoint for your integrations.",
  },
  {
    href: "/payouts",
    icon: "account_balance",
    title: "Settlement Guide",
    description: "Payout batches, settlement failures and per-recipient retry.",
  },
  {
    href: "/kyc",
    icon: "verified_user",
    title: "KYC Requirements",
    description: "Identity verification status, documents and compliance.",
  },
  {
    href: "/reports/builder",
    icon: "receipt_long",
    title: "Reporting & Export",
    description: "Statements and custom data exports from the ledger.",
  },
];

export default async function SupportPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const rawRef = Array.isArray(sp.ref) ? sp.ref[0] : sp.ref;
  const ref = rawRef?.trim() ? rawRef.trim() : undefined;

  return (
    <main className="mx-auto max-w-container-max p-gutter space-y-8">
      <header className="space-y-3">
        <h1 className="headline-xl text-[var(--on-surface)]">Support &amp; Documentation</h1>
        <p className="body-lg max-w-2xl text-[var(--on-surface-variant)]">
          Go directly to the page that answers your question, check platform status, or email support —
          with the thing you’re reporting on already in the subject line.
        </p>
      </header>

      {ref ? (
        <Card className="border-[var(--border-subtle)] bg-[var(--surface-container-low)]/40 p-5 shadow-sm">
          <div className="flex flex-wrap items-center gap-3">
            <span className="material-symbols-outlined text-[22px] text-[var(--on-surface-variant)]" aria-hidden="true">
              flag
            </span>
            <div>
              <h2 className="label-caps text-[11px] text-[var(--on-surface-variant)]">You’re reporting on</h2>
              <div className="data-mono text-sm text-[var(--on-surface)] break-all">{ref}</div>
            </div>
            <p className="body-sm text-[var(--on-surface-variant)] sm:ml-auto">
              The email below is pre-filled with it — send it and the context travels with the report.
            </p>
          </div>
        </Card>
      ) : null}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <h2 className="label-caps text-[var(--on-surface-variant)]">Popular Topics</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {TOPICS.map((topic) => (
              <Link
                key={topic.href}
                href={topic.href}
                className="block rounded border border-[var(--border-subtle)] bg-[var(--surface-container-lowest)] p-4 transition-colors hover:bg-[var(--surface-container-low)] group"
              >
                <div className="flex items-start space-x-3">
                  <div className="rounded bg-[var(--secondary-container)] p-2 text-[var(--primary)]">
                    <span className="material-symbols-outlined" aria-hidden="true">
                      {topic.icon}
                    </span>
                  </div>
                  <div>
                    <h3 className="headline-md text-[var(--on-surface)] group-hover:text-[var(--primary)] transition-colors flex items-center gap-1.5">
                      {topic.title}
                      <span
                        className="material-symbols-outlined text-[16px] opacity-0 transition-opacity group-hover:opacity-100"
                        aria-hidden="true"
                      >
                        arrow_forward
                      </span>
                    </h3>
                    <p className="body-sm mt-1 text-[var(--on-surface-variant)]">{topic.description}</p>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>

        <div className="space-y-6">
          <Card className="rounded border border-[var(--border-subtle)] bg-[var(--surface-container-lowest)] p-4 shadow-sm">
            <h2 className="label-caps text-[var(--on-surface-variant)] mb-3">System Status</h2>
            <p className="body-sm text-[var(--on-surface-variant)]">
              Platform health is monitored on the System Status page — live from the app, not a static banner.
            </p>
            <Link
              href="/system"
              className="body-sm mt-4 block text-center text-[var(--primary)] hover:underline"
            >
              View detailed status
            </Link>
          </Card>

          <Card className="rounded border border-[var(--border-subtle)] bg-[var(--surface-container-lowest)] p-4 shadow-sm">
            <h2 className="label-caps text-[var(--on-surface-variant)] mb-4">Contact Support</h2>
            <Button
              render={<a href={supportMailto(ref)} />}
              className="flex w-full items-center justify-between rounded bg-[var(--primary)] p-3 text-[var(--on-primary)] hover:bg-[var(--on-primary-fixed-variant)]"
            >
              <span className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[18px]" aria-hidden="true">
                  mail
                </span>
                <span className="body-sm font-medium">Email support</span>
              </span>
              <span className="material-symbols-outlined text-[16px] opacity-80" aria-hidden="true">
                open_in_new
              </span>
            </Button>
            <p className="body-sm text-[var(--on-surface-variant)] text-xs mt-3">
              support@kinetic.test — {ref ? "subject pre-filled with your reference" : "tell us what you were doing when it happened"}.
            </p>
          </Card>
        </div>
      </div>
    </main>
  );
}
