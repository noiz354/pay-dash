import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const rows = [
  {
    status: "200",
    statusVariant: "success" as const,
    event: "payment.succeeded",
    id: "evt_3NzQ4gL...",
    url: "https://api.merchant.com/webhooks/stripe",
    date: "Oct 24, 14:32:01",
    latency: "24ms",
    latencyVariant: "default" as const,
  },
  {
    status: "200",
    statusVariant: "success" as const,
    event: "subscription.updated",
    id: "evt_3NzQ8fK...",
    url: "https://api.merchant.com/webhooks/stripe",
    date: "Oct 24, 14:28:45",
    latency: "18ms",
    latencyVariant: "default" as const,
  },
  {
    status: "500",
    statusVariant: "error" as const,
    event: "charge.failed",
    id: "evt_3NzP9aA...",
    url: "https://api.merchant.com/webhooks/stripe",
    date: "Oct 24, 13:15:22",
    latency: "Timeout (5000ms)",
    latencyVariant: "error" as const,
  },
  {
    status: "200",
    statusVariant: "success" as const,
    event: "customer.created",
    id: "evt_3NzO1bB...",
    url: "https://api.merchant.com/webhooks/stripe",
    date: "Oct 24, 11:05:10",
    latency: "42ms",
    latencyVariant: "default" as const,
  },
];

export default function WebhooksPage() {
  return (
    <main className="mx-auto w-full max-w-container-max p-gutter space-y-6 bg-[var(--surface-canvas)]">
      {/* Header — screens/mobile/webhook_logs:172 */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="headline-xl text-[var(--on-surface)]">Webhook Logs</h1>
          <p className="body-sm text-[var(--on-surface-variant)] mt-1">
            Monitor recent webhook events and delivery statuses.
          </p>
        </div>
        <Button
          variant="outline"
          className="h-9 gap-2 border border-[var(--outline-variant)] bg-[var(--surface)] text-[var(--on-surface)] hover:bg-[var(--surface-container-low)]"
          aria-label="Refresh webhook logs"
        >
          <span className="material-symbols-outlined text-[18px]" aria-hidden="true">
            refresh
          </span>
          Refresh
        </Button>
      </div>

      {/* Controls — Search events + 2 selects All Statuses/Events */}
      <div className="flex flex-col md:flex-row gap-4 items-end md:items-center justify-between bg-[var(--surface)] border border-[var(--outline-variant)] rounded-lg p-4">
        <div className="relative w-full md:w-96">
          <span
            className="material-symbols-outlined pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--on-surface-variant)]"
            style={{ fontSize: 18 }}
            aria-hidden="true"
          >
            search
          </span>
          <Input
            placeholder="Search events..."
            aria-label="Search events"
            className="h-9 w-full pl-9 bg-white border-[var(--outline-variant)] text-[var(--on-surface)] placeholder:text-[var(--on-surface-variant)]"
          />
        </div>
        <div className="flex gap-3 w-full md:w-auto">
          <Select defaultValue="all-statuses">
            <SelectTrigger
              aria-label="Filter by status"
              className="h-9 flex-1 md:w-[160px] bg-white border-[var(--outline-variant)] text-[var(--on-surface)]"
            >
              <SelectValue placeholder="All Statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all-statuses">All Statuses</SelectItem>
              <SelectItem value="200">Success (200)</SelectItem>
              <SelectItem value="500">Failed (500, 400)</SelectItem>
            </SelectContent>
          </Select>
          <Select defaultValue="all-events">
            <SelectTrigger
              aria-label="Filter by event"
              className="h-9 flex-1 md:w-[180px] bg-white border-[var(--outline-variant)] text-[var(--on-surface)]"
            >
              <SelectValue placeholder="All Events" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all-events">All Events</SelectItem>
              <SelectItem value="payment.succeeded">payment.succeeded</SelectItem>
              <SelectItem value="subscription.updated">subscription.updated</SelectItem>
              <SelectItem value="charge.failed">charge.failed</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Table — Status 200/500 + Event payment… + Target URL + latency 24ms + evt_3NzQ + chevron + 4 rows */}
      <div className="bg-white border border-[var(--outline-variant)] rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-[var(--surface-container-low)] border-b border-[var(--outline-variant)] sticky top-0">
              <TableRow className="hover:bg-transparent border-b-0">
                <TableHead className="label-caps text-[var(--on-surface-variant)] w-16 px-4 py-3">Status</TableHead>
                <TableHead className="label-caps text-[var(--on-surface-variant)] px-4 py-3">Event Type</TableHead>
                <TableHead className="label-caps text-[var(--on-surface-variant)] px-4 py-3">Target URL</TableHead>
                <TableHead className="label-caps text-[var(--on-surface-variant)] px-4 py-3 text-right">Date / Time</TableHead>
                <TableHead className="label-caps text-[var(--on-surface-variant)] w-16 px-4 py-3">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className="divide-y divide-[var(--outline-variant)]/50">
              {rows.map((r) => (
                <TableRow
                  key={r.id}
                  className={`group hover:bg-[var(--surface-container-lowest)] transition-colors cursor-pointer ${r.statusVariant === "error" ? "bg-[var(--error-container)]/10" : ""}`}
                >
                  <TableCell className="px-4 py-3">
                    <span
                      className={`inline-flex items-center justify-center px-2 py-0.5 rounded-full data-mono text-[11px] font-bold ${
                        r.statusVariant === "success"
                          ? "bg-[var(--status-success-bg)] text-[var(--status-success)]"
                          : "bg-[var(--status-error-bg)] text-[var(--status-error)]"
                      }`}
                    >
                      {r.status}
                    </span>
                  </TableCell>
                  <TableCell className="px-4 py-3">
                    <div className={`data-mono ${r.statusVariant === "error" ? "text-[var(--status-error)]" : "text-[var(--primary)]"}`}>
                      {r.event}
                    </div>
                    <div className="body-sm text-[var(--on-surface-variant)] mt-0.5 text-[12px] data-mono">{r.id}</div>
                  </TableCell>
                  <TableCell
                    className="px-4 py-3 data-mono text-[12px] text-[var(--on-surface-variant)] truncate max-w-[200px]"
                    title={r.url}
                  >
                    {r.url}
                  </TableCell>
                  <TableCell className="px-4 py-3 text-right">
                    <div className="data-mono text-[12px] text-[var(--on-surface)]">{r.date}</div>
                    <div
                      className={`data-mono text-[11px] mt-0.5 ${r.latencyVariant === "error" ? "text-[var(--status-error)]" : "text-[var(--on-surface-variant)]"}`}
                    >
                      {r.latency}
                    </div>
                  </TableCell>
                  <TableCell className="px-4 py-3 text-right">
                    <span
                      className="material-symbols-outlined text-[var(--outline-variant)] group-hover:text-[var(--primary)] transition-colors"
                      style={{ fontSize: 18 }}
                      aria-hidden="true"
                    >
                      chevron_right
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        {/* Pagination 1-4 of 1,024 */}
        <div className="border-t border-[var(--outline-variant)] p-4 flex items-center justify-between bg-[var(--surface-bright)]">
          <span className="body-sm text-[var(--on-surface-variant)]">Showing 1 to 4 of 1,024 results</span>
          <div className="flex gap-1">
            <Button
              variant="outline"
              size="sm"
              disabled
              aria-label="Previous page"
              className="h-8 px-3 border border-[var(--outline-variant)] bg-white disabled:opacity-50"
            >
              Prev
            </Button>
            <Button
              variant="outline"
              size="sm"
              aria-label="Next page"
              className="h-8 px-3 border border-[var(--outline-variant)] bg-white hover:bg-[var(--surface-container-low)]"
            >
              Next
            </Button>
          </div>
        </div>
      </div>
    </main>
  );
}
