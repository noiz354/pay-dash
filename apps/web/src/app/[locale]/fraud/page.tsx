import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";

const blocklistRows = [
  { value: "192.168.1.105", reason: "Known Malicious", added: "2023-10-27 14:32:01" },
  { value: "10.0.0.24", reason: "High Frequency", added: "2023-10-26 09:15:44" },
  { value: "172.16.254.1", reason: "Manual Block", added: "2023-10-25 18:45:12" },
  { value: "45.33.22.110", reason: "Known Malicious", added: "2023-10-24 11:20:05" },
];

export default function FraudPage() {
  return (
    <main className="mx-auto max-w-container-max p-gutter space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="headline-xl">Fraud Prevention</h1>
          <p className="body-sm mt-1 text-[var(--on-surface-variant)]">Manage blocklists and monitor high-risk entities.</p>
        </div>
        <Button aria-label="Add to blocklist">
          <span className="material-symbols-outlined text-[18px]" aria-hidden="true">
            add
          </span>
          Add to Blocklist
        </Button>
      </div>

      {/* Metrics 14,209 */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        <Card>
          <CardContent className="p-5">
            <div className="label-caps mb-2 flex items-center gap-2 uppercase text-[var(--on-surface-variant)]">
              <span className="material-symbols-outlined text-[16px]" aria-hidden="true">
                shield_lock
              </span>
              Total Blocked Entities
            </div>
            <div className="headline-xl">14,209</div>
            <div className="body-sm mt-2 flex items-center gap-1 text-emerald-600">
              <span className="material-symbols-outlined text-[16px]" aria-hidden="true">
                trending_up
              </span>
              +12% this week
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="label-caps mb-2 flex items-center gap-2 uppercase text-[var(--on-surface-variant)]">
              <span className="material-symbols-outlined text-[16px]" aria-hidden="true">
                warning
              </span>
              High Risk IPs
            </div>
            <div className="headline-xl">8,432</div>
            <div className="body-sm mt-2 flex items-center gap-1 text-red-500">
              <span className="material-symbols-outlined text-[16px]" aria-hidden="true">
                trending_up
              </span>
              +5% this week
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="label-caps mb-2 flex items-center gap-2 uppercase text-[var(--on-surface-variant)]">
              <span className="material-symbols-outlined text-[16px]" aria-hidden="true">
                credit_card
              </span>
              Blocked Cards
            </div>
            <div className="headline-xl">3,194</div>
            <div className="body-sm mt-2 flex items-center gap-1 text-[var(--on-surface-variant)]">
              <span className="material-symbols-outlined text-[16px]" aria-hidden="true">
                trending_flat
              </span>
              No change
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main panel — Tabs IP/Cards/Email + Filter IPs + Export */}
      <div className="overflow-hidden rounded-xl border border-[var(--border-subtle)] bg-white shadow-sm">
        <Tabs defaultValue="ip">
          <div className="flex gap-6 border-b border-[var(--border-subtle)] bg-[var(--surface-container)]/30 px-4 pt-2">
            <TabsList variant="line">
              <TabsTrigger value="ip">
                <span className="material-symbols-outlined text-[16px]" aria-hidden="true">
                  router
                </span>
                IP Addresses
              </TabsTrigger>
              <TabsTrigger value="card">
                <span className="material-symbols-outlined text-[16px]" aria-hidden="true">
                  credit_card
                </span>
                Card Numbers
              </TabsTrigger>
              <TabsTrigger value="email">
                <span className="material-symbols-outlined text-[16px]" aria-hidden="true">
                  alternate_email
                </span>
                Email Domains
              </TabsTrigger>
            </TabsList>
          </div>

          {/* Filter bar */}
          <div className="flex items-center justify-between border-b border-[var(--border-subtle)] p-4">
            <div className="flex w-1/3 items-center gap-3">
              <div className="relative flex w-full items-center">
                <span
                  className="material-symbols-outlined pointer-events-none absolute left-3 text-[16px] text-[var(--on-surface-variant)]"
                  aria-hidden="true"
                >
                  filter_list
                </span>
                <Input placeholder="Filter IPs..." className="h-9 pl-9" aria-label="Filter IPs" />
              </div>
            </div>
            <Button variant="outline" size="sm" aria-label="Export blocklist">
              <span className="material-symbols-outlined text-[16px]" aria-hidden="true">
                download
              </span>
              Export
            </Button>
          </div>

          <TabsContent value="ip" className="mt-0">
            <div className="overflow-auto">
              <Table>
                <TableHeader className="label-caps sticky top-0 bg-[var(--surface-container-high)]/80 backdrop-blur-sm">
                  <TableRow>
                    <TableHead>Value</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead className="text-right">Added On</TableHead>
                    <TableHead className="w-[100px] text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {blocklistRows.map((r) => (
                    <TableRow key={r.value} className="group h-12">
                      <TableCell className="data-mono">{r.value}</TableCell>
                      <TableCell>
                        <span className="inline-flex items-center rounded-full bg-[var(--surface-container)] px-2 py-0.5 text-xs font-medium">
                          {r.reason}
                        </span>
                      </TableCell>
                      <TableCell className="data-mono text-right text-[var(--on-surface-variant)]">{r.added}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          className="opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100"
                          aria-label={`Actions for ${r.value}`}
                        >
                          <span className="material-symbols-outlined text-[18px]" aria-hidden="true">
                            more_vert
                          </span>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </TabsContent>
          <TabsContent value="card" className="p-6">
            <p className="body-sm text-[var(--on-surface-variant)]">No card blocklist entries.</p>
          </TabsContent>
          <TabsContent value="email" className="p-6">
            <p className="body-sm text-[var(--on-surface-variant)]">No email blocklist entries.</p>
          </TabsContent>
        </Tabs>
      </div>
    </main>
  );
}
