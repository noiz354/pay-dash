import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Kbd } from "@/components/ui/kbd";

export default function SupportPage() {
  return (
    <main className="mx-auto max-w-5xl p-gutter space-y-8">
      {/* Header & Search — screens/desktop/support_documentation_hub_desktop:122-131 */}
      <header className="space-y-4">
        <div className="flex items-center space-x-2 text-[var(--primary)]">
          <span className="material-symbols-outlined" aria-hidden="true" style={{ fontVariationSettings: "'FILL' 1" }}>
            help
          </span>
          <h1 className="headline-xl text-[var(--on-surface)]">Support &amp; Documentation</h1>
        </div>
        <p className="body-lg max-w-2xl text-[var(--on-surface-variant)]">
          Search the knowledge base, view API references, or contact our support team for specialized assistance.
        </p>
        <div className="relative w-full max-w-2xl pt-4">
          <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 pt-4 text-[var(--on-surface-variant)]" aria-hidden="true">
            <span className="material-symbols-outlined">search</span>
          </span>
          <Input
            placeholder="Search for 'Settlement limits'..."
            aria-label="Search knowledge base"
            className="block h-12 w-full border-[var(--border-subtle)] bg-[var(--surface-container-lowest)] py-3 pl-10 pr-12 shadow-sm body-md focus-visible:ring-[var(--primary)] focus-visible:border-[var(--primary)]"
          />
          <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3 pt-4">
            <Kbd className="hidden sm:inline-flex border border-[var(--outline-variant)] bg-[var(--surface-container)] px-2 py-0.5 data-mono text-[var(--on-surface-variant)]">Cmd+K</Kbd>
          </div>
        </div>
      </header>

      {/* Content Grid — 127-247 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Column: Popular Topics */}
        <div className="lg:col-span-2 space-y-6">
          <h2 className="label-caps uppercase tracking-wider text-[var(--on-surface-variant)]">Popular Topics</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <a
              href="#"
              className="block rounded border border-[var(--border-subtle)] bg-[var(--surface-container-lowest)] p-4 transition-colors hover:bg-[var(--surface-container-low)] group"
            >
              <div className="flex items-start space-x-3">
                <div className="rounded bg-[var(--secondary-container)] p-2 text-[var(--primary)]">
                  <span className="material-symbols-outlined" aria-hidden="true">
                    api
                  </span>
                </div>
                <div>
                  <h3 className="headline-md text-[var(--on-surface)] group-hover:text-[var(--primary)] transition-colors">API Reference</h3>
                  <p className="body-sm mt-1 text-[var(--on-surface-variant)]">Endpoints, authentication, and webhooks for developers.</p>
                </div>
              </div>
            </a>
            <a
              href="#"
              className="block rounded border border-[var(--border-subtle)] bg-[var(--surface-container-lowest)] p-4 transition-colors hover:bg-[var(--surface-container-low)] group"
            >
              <div className="flex items-start space-x-3">
                <div className="rounded bg-[var(--secondary-container)] p-2 text-[var(--primary)]">
                  <span className="material-symbols-outlined" aria-hidden="true">
                    account_balance
                  </span>
                </div>
                <div>
                  <h3 className="headline-md text-[var(--on-surface)] group-hover:text-[var(--primary)] transition-colors">Settlement Guide</h3>
                  <p className="body-sm mt-1 text-[var(--on-surface-variant)]">Timelines, batch processes, and resolving failures.</p>
                </div>
              </div>
            </a>
            <a
              href="#"
              className="block rounded border border-[var(--border-subtle)] bg-[var(--surface-container-lowest)] p-4 transition-colors hover:bg-[var(--surface-container-low)] group"
            >
              <div className="flex items-start space-x-3">
                <div className="rounded bg-[var(--secondary-container)] p-2 text-[var(--primary)]">
                  <span className="material-symbols-outlined" aria-hidden="true">
                    verified_user
                  </span>
                </div>
                <div>
                  <h3 className="headline-md text-[var(--on-surface)] group-hover:text-[var(--primary)] transition-colors">KYC Requirements</h3>
                  <p className="body-sm mt-1 text-[var(--on-surface-variant)]">Documentation, verification flows, and compliance.</p>
                </div>
              </div>
            </a>
            <a
              href="#"
              className="block rounded border border-[var(--border-subtle)] bg-[var(--surface-container-lowest)] p-4 transition-colors hover:bg-[var(--surface-container-low)] group"
            >
              <div className="flex items-start space-x-3">
                <div className="rounded bg-[var(--secondary-container)] p-2 text-[var(--primary)]">
                  <span className="material-symbols-outlined" aria-hidden="true">
                    receipt_long
                  </span>
                </div>
                <div>
                  <h3 className="headline-md text-[var(--on-surface)] group-hover:text-[var(--primary)] transition-colors">Reporting &amp; Export</h3>
                  <p className="body-sm mt-1 text-[var(--on-surface-variant)]">Generating statements and custom data extracts.</p>
                </div>
              </div>
            </a>
          </div>
        </div>

        {/* Side Column: Status & Contact */}
        <div className="space-y-6">
          {/* System Status Widget */}
          <Card className="rounded border border-[var(--border-subtle)] bg-[var(--surface-container-lowest)] p-4 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="label-caps uppercase tracking-wider text-[var(--on-surface-variant)]">System Status</h2>
              <span className="relative flex h-3 w-3" aria-hidden="true">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--success-status)] opacity-75" />
                <span className="relative inline-flex h-3 w-3 rounded-full bg-[var(--success-status)]" />
              </span>
              <span className="sr-only">Operational</span>
            </div>
            <div className="space-y-3">
              <div className="flex items-center justify-between border-b border-[var(--border-subtle)] py-2">
                <span className="body-sm text-[var(--on-surface)]">API Gateway</span>
                <span className="body-sm text-[var(--success-status)]">Operational</span>
              </div>
              <div className="flex items-center justify-between border-b border-[var(--border-subtle)] py-2">
                <span className="body-sm text-[var(--on-surface)]">Settlement Engine</span>
                <span className="body-sm text-[var(--success-status)]">Operational</span>
              </div>
              <div className="flex items-center justify-between py-2">
                <span className="body-sm text-[var(--on-surface)]">Webhooks</span>
                <span className="body-sm text-[var(--success-status)]">Operational</span>
              </div>
            </div>
            <a href="#" className="body-sm mt-4 block text-center text-[var(--primary)] hover:underline">
              View detailed status
            </a>
          </Card>

          {/* Contact Support Widget */}
          <Card className="rounded border border-[var(--border-subtle)] bg-[var(--surface-container-lowest)] p-4 shadow-sm">
            <h2 className="label-caps mb-4 uppercase tracking-wider text-[var(--on-surface-variant)]">Contact Support</h2>
            <div className="space-y-2">
              <Button className="flex w-full items-center justify-between rounded bg-[var(--primary)] p-3 text-[var(--on-primary)] hover:bg-[var(--surface-tint)]">
                <span className="flex items-center space-x-2">
                  <span className="material-symbols-outlined text-sm" aria-hidden="true">
                    chat
                  </span>
                  <span className="body-sm font-medium">Live Chat</span>
                </span>
                <span className="label-caps opacity-80">Available</span>
              </Button>
              <Button
                variant="outline"
                className="flex w-full items-center justify-between rounded border border-[var(--border-subtle)] bg-[var(--surface-container)] p-3 text-[var(--on-surface)] hover:bg-[var(--surface-variant)]"
              >
                <span className="flex items-center space-x-2">
                  <span className="material-symbols-outlined text-sm" aria-hidden="true">
                    mail
                  </span>
                  <span className="body-sm font-medium">Email Support</span>
                </span>
              </Button>
              <Button
                variant="outline"
                className="flex w-full items-center justify-between rounded border border-[var(--border-subtle)] bg-[var(--surface-container)] p-3 text-[var(--on-surface)] hover:bg-[var(--surface-variant)]"
              >
                <span className="flex items-center space-x-2">
                  <span className="material-symbols-outlined text-sm" aria-hidden="true">
                    history
                  </span>
                  <span className="body-sm font-medium">Ticket History</span>
                </span>
              </Button>
            </div>
          </Card>
        </div>
      </div>
    </main>
  );
}
