import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const blockedIp = [
  { id: "blk_001", value: "192.168.1.1", reason: "Known Malicious", added: "Oct 24, 2023, 14:32" },
  { id: "blk_002", value: "203.0.113.42", reason: "High Frequency", added: "Oct 22, 2023, 09:15" },
  { id: "blk_003", value: "198.51.100.7", reason: "Manual Entry", added: "Oct 15, 2023, 11:45" },
  { id: "blk_004", value: "45.22.19.102", reason: "Known Malicious", added: "Oct 10, 2023, 16:20" },
];

export default function BlocklistPage() {
  return (
    <main className="mx-auto max-w-container-max p-gutter space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="headline-xl">Blocklist</h1>
          <p className="body-sm mt-1 text-[var(--on-surface-variant)]">
            Prevent fraudulent transactions by blocking specific attributes.
          </p>
        </div>
        <Button aria-label="Add to blocklist">
          <span className="material-symbols-outlined text-[18px]" aria-hidden="true">
            add
          </span>
          Add to Blocklist
        </Button>
      </div>

      <div className="overflow-hidden rounded-xl border border-[var(--border-subtle)] bg-white">
        <Tabs defaultValue="ip">
          <div className="flex flex-col gap-4 border-b border-[var(--border-subtle)] px-gutter pt-gutter">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <TabsList variant="line">
                <TabsTrigger value="ip">IP Addresses</TabsTrigger>
                <TabsTrigger value="card">Card Numbers</TabsTrigger>
                <TabsTrigger value="email">Email Domains</TabsTrigger>
              </TabsList>
              <div className="relative w-full pb-3 md:w-64">
                <span
                  className="material-symbols-outlined pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[18px] text-[var(--on-surface-variant)] md:-mt-1.5"
                  aria-hidden="true"
                >
                  search
                </span>
                <Input placeholder="Search IP addresses..." className="pl-9" aria-label="Search IP addresses" />
              </div>
            </div>
          </div>

          <TabsContent value="ip" className="mt-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="label-caps sticky top-0 bg-[var(--surface-container-low)]">
                  <TableRow>
                    <TableHead>Value</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead>Added On</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {blockedIp.map((b) => (
                    <TableRow key={b.id} className="h-12">
                      <TableCell className="data-mono">
                        <span className="inline-flex items-center gap-2">
                          <span className="material-symbols-outlined text-[16px] text-[var(--on-surface-variant)]" aria-hidden="true">
                            language
                          </span>
                          {b.value}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="inline-flex items-center rounded-full bg-[var(--surface-container)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider">
                          {b.reason}
                        </span>
                      </TableCell>
                      <TableCell className="text-[var(--on-surface-variant)]">{b.added}</TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="icon-sm" aria-label={`Delete ${b.value}`}>
                          <span className="material-symbols-outlined text-[18px]" aria-hidden="true">
                            delete
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
            <p className="body-sm text-[var(--on-surface-variant)]">No card numbers blocklisted.</p>
          </TabsContent>
          <TabsContent value="email" className="p-6">
            <p className="body-sm text-[var(--on-surface-variant)]">No email domains blocklisted.</p>
          </TabsContent>
        </Tabs>

        {/* Pagination 1-4 of 124 */}
        <div className="flex items-center justify-between border-t border-[var(--border-subtle)] p-4 text-[var(--on-surface-variant)]">
          <span className="body-sm">Showing 1-4 of 124</span>
          <div className="flex gap-2">
            <Button variant="ghost" size="icon-sm" disabled aria-label="Previous page">
              <span className="material-symbols-outlined text-[20px]" aria-hidden="true">
                chevron_left
              </span>
            </Button>
            <Button variant="ghost" size="icon-sm" aria-label="Next page">
              <span className="material-symbols-outlined text-[20px]" aria-hidden="true">
                chevron_right
              </span>
            </Button>
          </div>
        </div>
      </div>
    </main>
  );
}
