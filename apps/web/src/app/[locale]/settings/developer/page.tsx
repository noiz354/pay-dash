import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";

export default function DeveloperSettingsPage() {
  return (
    <main className="mx-auto max-w-container-max p-gutter space-y-6">
      {/* Header with LIVE MODE pill from mobile 160-163 */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="headline-xl text-[var(--on-surface)]">Developer Settings</h1>
          <p className="body-sm text-[var(--on-surface-variant)] mt-1">Manage API keys, webhooks, and access controls.</p>
        </div>
        <div className="flex items-center bg-[var(--surface-container)] rounded-full p-1 border border-[var(--outline-variant)] w-fit">
          <button className="px-4 py-1.5 rounded-full label-caps text-[var(--on-surface-variant)] hover:text-[var(--on-surface)] transition-colors">
            TEST DATA
          </button>
          <button className="px-4 py-1.5 rounded-full bg-white shadow-sm label-caps text-[var(--primary)] border border-[var(--outline-variant)]">
            LIVE MODE
          </button>
        </div>
      </div>

      {/* Bento Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Main column */}
        <div className="lg:col-span-8 space-y-6">
          {/* API Keys Card */}
          <Card className="overflow-hidden">
            <div className="p-6 border-b border-[var(--border-subtle)] flex justify-between items-center bg-[var(--surface)]">
              <div>
                <h3 className="headline-md text-[var(--on-surface)]">API Keys</h3>
                <p className="body-sm text-[var(--on-surface-variant)] mt-1">Authenticate requests to The Ledger API.</p>
              </div>
              <Button className="gap-2">
                <span className="material-symbols-outlined text-sm">add</span>
                Generate Key
              </Button>
            </div>
            <CardContent className="p-0">
              <Table>
                <TableHeader className="bg-[var(--surface-container-low)] label-caps sticky top-0">
                  <TableRow>
                    <TableHead className="label-caps text-[var(--on-surface-variant)]">Name</TableHead>
                    <TableHead className="label-caps text-[var(--on-surface-variant)]">Token</TableHead>
                    <TableHead className="label-caps text-[var(--on-surface-variant)] text-right">Created</TableHead>
                    <TableHead className="label-caps text-[var(--on-surface-variant)] text-right" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow className="hover:bg-[var(--surface-container)]/50">
                    <TableCell className="body-sm text-[var(--on-surface)]">Production Master Key</TableCell>
                    <TableCell className="data-mono text-[var(--on-surface-variant)]">sk_live_••••••••••••8f92</TableCell>
                    <TableCell className="body-sm text-[var(--on-surface-variant)] text-right">Oct 12, 2023</TableCell>
                    <TableCell className="text-right">
                      <button className="text-[var(--outline)] hover:text-[var(--on-surface)] transition-colors">
                        <span className="material-symbols-outlined text-sm">more_vert</span>
                      </button>
                    </TableCell>
                  </TableRow>
                  <TableRow className="hover:bg-[var(--surface-container)]/50">
                    <TableCell className="body-sm text-[var(--on-surface)]">Staging Integration</TableCell>
                    <TableCell className="data-mono text-[var(--on-surface-variant)]">sk_test_••••••••••••3a1b</TableCell>
                    <TableCell className="body-sm text-[var(--on-surface-variant)] text-right">Nov 04, 2023</TableCell>
                    <TableCell className="text-right">
                      <button className="text-[var(--outline)] hover:text-[var(--on-surface)] transition-colors">
                        <span className="material-symbols-outlined text-sm">more_vert</span>
                      </button>
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Webhook Endpoints Card */}
          <Card className="overflow-hidden">
            <div className="p-6 border-b border-[var(--border-subtle)] flex justify-between items-center bg-[var(--surface)]">
              <div>
                <h3 className="headline-md text-[var(--on-surface)]">Webhook Endpoints</h3>
                <p className="body-sm text-[var(--on-surface-variant)] mt-1">Receive real-time event notifications.</p>
              </div>
              <Button variant="outline" className="gap-2">
                <span className="material-symbols-outlined text-sm">add_link</span>
                Add Endpoint
              </Button>
            </div>
            <CardContent className="p-0">
              <Table>
                <TableHeader className="bg-[var(--surface-container-low)] label-caps sticky top-0">
                  <TableRow>
                    <TableHead className="label-caps text-[var(--on-surface-variant)]">Status</TableHead>
                    <TableHead className="label-caps text-[var(--on-surface-variant)]">URL</TableHead>
                    <TableHead className="label-caps text-[var(--on-surface-variant)] text-right">Events</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow className="hover:bg-[var(--surface-container)]/50">
                    <TableCell>
                      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-[var(--status-success-bg)] text-[var(--success-status)] label-caps text-[10px] border border-[var(--success-status)]/20">
                        <span className="w-1.5 h-1.5 rounded-full bg-[var(--success-status)]" /> Active
                      </span>
                    </TableCell>
                    <TableCell className="data-mono text-[var(--on-surface)] truncate max-w-[200px]">https://api.acme.com/webhooks/ledger</TableCell>
                    <TableCell className="body-sm text-[var(--on-surface-variant)] text-right">payment.*</TableCell>
                  </TableRow>
                  <TableRow className="hover:bg-[var(--surface-container)]/50">
                    <TableCell>
                      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-[var(--status-error-bg)] text-[var(--failed-status)] label-caps text-[10px] border border-[var(--failed-status)]/20">
                        <span className="w-1.5 h-1.5 rounded-full bg-[var(--failed-status)]" /> Failing
                      </span>
                    </TableCell>
                    <TableCell className="data-mono text-[var(--on-surface)] truncate max-w-[200px]">https://staging.acme.com/hooks/sync</TableCell>
                    <TableCell className="body-sm text-[var(--on-surface-variant)] text-right">customer.*</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>

        {/* Side Column */}
        <div className="lg:col-span-4 space-y-6">
          {/* IP Whitelist Card */}
          <Card className="p-6">
            <h3 className="headline-md text-[var(--on-surface)] mb-1">IP Whitelist</h3>
            <p className="body-sm text-[var(--on-surface-variant)] mb-4">Restrict API access to specific IP addresses.</p>
            <div className="flex gap-2 mb-4">
              <Input placeholder="e.g. 192.168.1.1" className="flex-1 h-9 data-mono bg-[var(--surface)]" />
              <Button variant="outline" className="shrink-0">Add</Button>
            </div>
            <ul className="space-y-2 border-t border-[var(--border-subtle)] pt-4">
              <li className="flex justify-between items-center py-1">
                <span className="data-mono text-[var(--on-surface)]">203.0.113.45</span>
                <button className="text-[var(--outline)] hover:text-[var(--failed-status)] transition-colors">
                  <span className="material-symbols-outlined text-sm">close</span>
                </button>
              </li>
              <li className="flex justify-between items-center py-1">
                <span className="data-mono text-[var(--on-surface)]">198.51.100.2</span>
                <button className="text-[var(--outline)] hover:text-[var(--failed-status)] transition-colors">
                  <span className="material-symbols-outlined text-sm">close</span>
                </button>
              </li>
            </ul>
          </Card>

          {/* Documentation Card surface-tint */}
          <a href="#" className="block bg-[var(--surface-tint)] text-[var(--on-primary)] rounded-xl p-6 shadow-sm hover:opacity-95 transition-opacity relative overflow-hidden group">
            <div className="absolute -right-4 -bottom-4 opacity-10 group-hover:scale-110 transition-transform duration-500">
              <span className="material-symbols-outlined text-9xl">menu_book</span>
            </div>
            <div className="relative z-10">
              <span className="material-symbols-outlined mb-3 text-3xl">api</span>
              <h3 className="headline-md font-bold mb-1">API Documentation</h3>
              <p className="body-sm text-[var(--on-primary-container)] opacity-90 mb-4">Explore comprehensive guides, SDKs, and endpoint references.</p>
              <span className="inline-flex items-center gap-1 label-caps">
                View Docs <span className="material-symbols-outlined text-sm">arrow_forward</span>
              </span>
            </div>
          </a>
        </div>
      </div>
    </main>
  );
}
