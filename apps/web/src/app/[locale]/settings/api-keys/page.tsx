import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress, ProgressIndicator, ProgressTrack } from "@/components/ui/progress";

export default function ApiKeysPage() {
  return (
    <main className="mx-auto max-w-container-max p-gutter space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="headline-xl text-[var(--on-surface)]">API Key Management</h1>
          <p className="body-sm text-[var(--on-surface-variant)] mt-1">
            Manage secret keys for Production and Sandbox environments.
          </p>
        </div>
        <Button className="gap-2 shrink-0">
          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
            add
          </span>
          Generate New Key
        </Button>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-gutter">
        <div className="lg:col-span-2 space-y-6">
          <section>
            <div className="flex items-center gap-2 mb-3">
              <h2 className="headline-md text-[var(--on-surface)]">Live Keys</h2>
              <Badge className="rounded-full bg-[var(--surface-variant)] text-[var(--on-surface-variant)] hover:bg-[var(--surface-variant)] font-normal label-caps border-0 px-2 py-0.5">
                Production
              </Badge>
            </div>
            <Card className="overflow-hidden">
              <CardContent className="p-0">
                <div className="hidden sm:grid grid-cols-12 gap-4 px-4 py-3 bg-[var(--surface-bright)] border-b border-[var(--outline-variant)] label-caps text-[var(--on-surface-variant)] sticky top-0">
                  <div className="col-span-3">Name</div>
                  <div className="col-span-5">Secret Key</div>
                  <div className="col-span-3 text-right">Created</div>
                  <div className="col-span-1 text-right" />
                </div>
                <div className="divide-y divide-[var(--outline-variant)]">
                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-4 px-4 py-3 sm:h-12 items-center hover:bg-[var(--surface-container-low)] transition-colors group">
                    <div className="sm:col-span-3 flex items-center gap-2">
                      <span className="material-symbols-outlined text-[var(--primary)]" style={{ fontSize: 16 }}>
                        key
                      </span>
                      <span className="body-sm font-medium text-[var(--on-surface)]">Production Main</span>
                    </div>
                    <div className="sm:col-span-5 flex items-center justify-between sm:justify-start gap-2 bg-[var(--surface)] p-2 sm:p-0 sm:bg-transparent rounded">
                      <code className="data-mono text-[var(--on-surface-variant)] truncate">sk_live_••••••••••••4a2b</code>
                      <button className="text-[var(--on-surface-variant)] hover:text-[var(--primary)] transition-colors p-1" title="Copy Key" aria-label="Copy key">
                        <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                          content_copy
                        </span>
                      </button>
                    </div>
                    <div className="sm:col-span-3 data-mono text-[var(--on-surface-variant)] sm:text-right">
                      <span className="sm:hidden body-sm font-medium mr-2">Created:</span>
                      Oct 12, 2023
                    </div>
                    <div className="sm:col-span-1 flex justify-end">
                      <button className="text-[var(--on-surface-variant)] hover:text-[var(--on-surface)] p-1 rounded opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                        <span className="material-symbols-outlined">more_vert</span>
                      </button>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-4 px-4 py-3 sm:h-12 items-center hover:bg-[var(--surface-container-low)] transition-colors group">
                    <div className="sm:col-span-3 flex items-center gap-2">
                      <span className="material-symbols-outlined text-[var(--primary)]" style={{ fontSize: 16 }}>
                        key
                      </span>
                      <span className="body-sm font-medium text-[var(--on-surface)]">Mobile App Prod</span>
                    </div>
                    <div className="sm:col-span-5 flex items-center justify-between sm:justify-start gap-2 bg-[var(--surface)] p-2 sm:p-0 sm:bg-transparent rounded">
                      <code className="data-mono text-[var(--on-surface-variant)] truncate">sk_live_••••••••••••9x1f</code>
                      <button className="text-[var(--on-surface-variant)] hover:text-[var(--primary)] transition-colors p-1" title="Copy Key" aria-label="Copy key">
                        <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                          content_copy
                        </span>
                      </button>
                    </div>
                    <div className="sm:col-span-3 data-mono text-[var(--on-surface-variant)] sm:text-right">
                      <span className="sm:hidden body-sm font-medium mr-2">Created:</span>
                      Nov 05, 2023
                    </div>
                    <div className="sm:col-span-1 flex justify-end">
                      <button className="text-[var(--on-surface-variant)] hover:text-[var(--on-surface)] p-1 rounded opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                        <span className="material-symbols-outlined">more_vert</span>
                      </button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </section>
          <section>
            <div className="flex items-center gap-2 mb-3">
              <h2 className="headline-md text-[var(--on-surface)]">Test Keys</h2>
              <Badge className="rounded-full bg-amber-100 text-amber-800 hover:bg-amber-100 label-caps border-0 px-2 py-0.5">Sandbox</Badge>
            </div>
            <Card className="overflow-hidden">
              <CardContent className="p-0">
                <div className="hidden sm:grid grid-cols-12 gap-4 px-4 py-3 bg-[var(--surface-bright)] border-b border-[var(--outline-variant)] label-caps text-[var(--on-surface-variant)] sticky top-0">
                  <div className="col-span-3">Name</div>
                  <div className="col-span-5">Secret Key</div>
                  <div className="col-span-3 text-right">Created</div>
                  <div className="col-span-1 text-right" />
                </div>
                <div className="divide-y divide-[var(--outline-variant)]">
                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-4 px-4 py-3 sm:h-12 items-center hover:bg-[var(--surface-container-low)] transition-colors group">
                    <div className="sm:col-span-3 flex items-center gap-2">
                      <span className="material-symbols-outlined text-[var(--on-surface-variant)]" style={{ fontSize: 16 }}>
                        key
                      </span>
                      <span className="body-sm font-medium text-[var(--on-surface)]">Staging Environment</span>
                    </div>
                    <div className="sm:col-span-5 flex items-center justify-between sm:justify-start gap-2 bg-[var(--surface)] p-2 sm:p-0 sm:bg-transparent rounded">
                      <code className="data-mono text-[var(--on-surface-variant)] truncate">sk_test_••••••••••••b8c3</code>
                      <button className="text-[var(--on-surface-variant)] hover:text-[var(--primary)] transition-colors p-1" title="Copy Key" aria-label="Copy key">
                        <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                          content_copy
                        </span>
                      </button>
                    </div>
                    <div className="sm:col-span-3 data-mono text-[var(--on-surface-variant)] sm:text-right">
                      <span className="sm:hidden body-sm font-medium mr-2">Created:</span>
                      Jan 15, 2024
                    </div>
                    <div className="sm:col-span-1 flex justify-end">
                      <button className="text-[var(--on-surface-variant)] hover:text-[var(--on-surface)] p-1 rounded opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                        <span className="material-symbols-outlined">more_vert</span>
                      </button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </section>
        </div>
        <div className="space-y-6">
          <Card className="p-5">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-lg bg-green-50 flex items-center justify-center text-green-600">
                <span className="material-symbols-outlined">verified_user</span>
              </div>
              <div>
                <h3 className="headline-md text-[var(--on-surface)]">API Status</h3>
                <p className="body-sm text-green-600 font-medium">All Systems Operational</p>
              </div>
            </div>
            <div className="h-px w-full bg-[var(--outline-variant)] my-4" />
            <div className="flex justify-between items-center mb-2">
              <span className="body-sm text-[var(--on-surface-variant)]">Live Keys Used</span>
              <span className="data-mono font-bold text-[var(--on-surface)]">2 / 10</span>
            </div>
            <Progress value={20} className="gap-0">
              <ProgressTrack className="bg-[var(--surface-variant)] h-1.5">
                <ProgressIndicator className="bg-[var(--primary)]" style={{ width: "20%" } as React.CSSProperties} />
              </ProgressTrack>
            </Progress>
          </Card>
          <Card className="p-5 bg-[var(--surface-bright)]">
            <h3 className="headline-md text-[var(--on-surface)] mb-3 flex items-center gap-2">
              <span className="material-symbols-outlined text-amber-500" style={{ fontSize: 20 }}>
                security
              </span>
              Security Best Practices
            </h3>
            <ul className="space-y-3 body-sm text-[var(--on-surface-variant)]">
              <li className="flex items-start gap-2">
                <span className="material-symbols-outlined text-[var(--primary)] mt-0.5" style={{ fontSize: 16 }}>
                  check_circle
                </span>
                <span>Never embed secret keys directly in your client-side code.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="material-symbols-outlined text-[var(--primary)] mt-0.5" style={{ fontSize: 16 }}>
                  check_circle
                </span>
                <span>Rotate keys periodically or if you suspect they have been compromised.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="material-symbols-outlined text-[var(--primary)] mt-0.5" style={{ fontSize: 16 }}>
                  check_circle
                </span>
                <span>Use Test keys for development to avoid unintended live transactions.</span>
              </li>
            </ul>
            <a href="#" className="inline-flex items-center gap-1 mt-4 text-[var(--primary)] body-sm font-medium hover:underline">
              Read Documentation
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                arrow_forward
              </span>
            </a>
          </Card>
        </div>
      </div>
    </main>
  );
}
