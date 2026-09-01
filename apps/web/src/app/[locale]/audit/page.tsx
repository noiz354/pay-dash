import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

// High-fidelity: screens/desktop/detailed_audit_log_desktop:206-393
const logs = [
  {
    timestamp: "2023-10-24 14:32:01",
    initials: "AJ",
    email: "alice.jones@org.com",
    action: "API Key Generated",
    resource: "key_prod_892f...",
    ip: "192.168.1.104",
    status: "Success" as const,
    avatarClass: "bg-[var(--primary)]/10 text-[var(--primary)]",
  },
  {
    timestamp: "2023-10-24 14:28:45",
    initials: "SYS",
    email: "system@ledger.io",
    action: "Batch Settlement",
    resource: "batch_77x21",
    ip: "10.0.0.5 (Internal)",
    status: "Success" as const,
    avatarClass: "bg-[var(--surface-variant)] text-[var(--on-surface-variant)]",
  },
  {
    timestamp: "2023-10-24 14:15:12",
    initials: "BS",
    email: "bob.smith@org.com",
    action: "Refund Issued",
    resource: "txn_9942a",
    ip: "203.0.113.42",
    status: "Failed" as const,
    avatarClass: "bg-[var(--secondary-container)] text-[var(--on-secondary-container)]",
    failedRow: true,
  },
  {
    timestamp: "2023-10-24 13:50:05",
    initials: "AJ",
    email: "alice.jones@org.com",
    action: "User Login",
    resource: "session_b44",
    ip: "192.168.1.104",
    status: "Success" as const,
    avatarClass: "bg-[var(--primary)]/10 text-[var(--primary)]",
  },
  {
    timestamp: "2023-10-24 12:10:22",
    initials: "EK",
    email: "e.klein@vendor.co",
    action: "Webhook Configured",
    resource: "wh_endpoint_2",
    ip: "198.51.100.14",
    status: "Success" as const,
    avatarClass: "bg-[var(--test-mode-amber)]/10 text-[var(--test-mode-amber)]",
  },
];

export default function AuditPage() {
  return (
    <main className="mx-auto max-w-container-max p-gutter space-y-0">
      {/* Page Header & Filter Top Bar — detailed_audit_log_desktop:206-264 */}
      <div className="bg-[var(--surface-container-lowest)] border border-[var(--border-subtle)] rounded-t-xl p-[var(--gutter)]">
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-end gap-4 mb-6">
          <div>
            <h1 className="headline-xl text-[var(--on-surface)]">Detailed Audit Log</h1>
            <p className="body-sm text-[var(--on-surface-variant)] mt-1">
              System-wide compliance tracking and immutable event history.
            </p>
          </div>
          <Button
            variant="outline"
            aria-label="Export audit log as CSV"
            className="h-9 px-4 bg-[var(--surface)] border border-[var(--border-subtle)] shadow-sm hover:bg-[var(--surface-container)] gap-2 shrink-0"
          >
            <span className="material-symbols-outlined text-[18px]" aria-hidden="true">
              download
            </span>
            Export CSV
          </Button>
        </div>

        {/* Powerful Filter Bar */}
        <div className="flex flex-wrap gap-4 items-center bg-[var(--surface-canvas)] p-4 rounded-xl border border-[var(--border-subtle)]">
          {/* Global Search (Cmd+K hint) */}
          <div className="relative flex-1 min-w-[240px]">
            <span
              className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[var(--on-surface-variant)] text-[18px] pointer-events-none"
              aria-hidden="true"
            >
              search
            </span>
            <Input
              aria-label="Search audit logs"
              placeholder="Search resources, users, IPs..."
              className="h-[36px] pl-9 pr-12 bg-[var(--surface-container-lowest)] border-[var(--outline-variant)] placeholder:text-[var(--outline)] focus-visible:border-[var(--primary)] focus-visible:ring-[var(--primary)]/20"
            />
            <span
              className="absolute right-3 top-1/2 -translate-y-1/2 font-data-mono text-[10px] border border-[var(--outline-variant)] rounded px-1 py-0.5 text-[var(--outline-variant)] leading-none"
              aria-hidden="true"
            >
              ⌘K
            </span>
          </div>

          {/* Date Range */}
          <div className="relative min-w-[200px]">
            <span
              className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[var(--on-surface-variant)] text-[18px] pointer-events-none z-10"
              aria-hidden="true"
            >
              calendar_today
            </span>
            <Select defaultValue="24h">
              <SelectTrigger
                aria-label="Filter by date range"
                className="w-full h-[36px] pl-9 bg-[var(--surface-container-lowest)] border-[var(--outline-variant)]"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="24h">Last 24 Hours</SelectItem>
                <SelectItem value="7d">Last 7 Days</SelectItem>
                <SelectItem value="30d">Last 30 Days</SelectItem>
                <SelectItem value="custom">Custom Range...</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Action Category */}
          <div className="relative min-w-[180px]">
            <Select defaultValue="all">
              <SelectTrigger
                aria-label="Filter by action category"
                className="w-full h-[36px] bg-[var(--surface-container-lowest)] border-[var(--outline-variant)]"
              >
                <SelectValue placeholder="All Actions" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Actions</SelectItem>
                <SelectItem value="auth">Authentication</SelectItem>
                <SelectItem value="data">Data Mutation</SelectItem>
                <SelectItem value="sys">System Config</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Status Filter */}
          <div className="flex items-center gap-2 bg-[var(--surface-container-lowest)] border border-[var(--outline-variant)] rounded-lg h-[36px] px-2">
            <label className="flex items-center gap-1.5 cursor-pointer px-2 py-1 rounded hover:bg-[var(--surface-container)] transition-colors">
              <Checkbox defaultChecked aria-label="Filter Success status" className="rounded border-[var(--outline-variant)] data-[state=checked]:bg-[var(--primary)] data-[state=checked]:border-[var(--primary)]" />
              <span className="body-sm text-[var(--on-surface-variant)]">Success</span>
            </label>
            <div className="w-px h-4 bg-[var(--outline-variant)]" aria-hidden="true" />
            <label className="flex items-center gap-1.5 cursor-pointer px-2 py-1 rounded hover:bg-[var(--surface-container)] transition-colors">
              <Checkbox defaultChecked aria-label="Filter Failure status" className="rounded border-[var(--outline-variant)] data-[state=checked]:bg-[var(--error)] data-[state=checked]:border-[var(--error)]" />
              <span className="body-sm text-[var(--on-surface-variant)]">Failure</span>
            </label>
          </div>
        </div>
      </div>

      {/* Data Table Container — detailed_audit_log_desktop:265-393 */}
      <div className="border border-t-0 border-[var(--border-subtle)] rounded-b-xl bg-[var(--surface-container-lowest)] shadow-sm overflow-hidden flex flex-col">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[720px]" aria-label="Detailed audit log">
            <thead className="sticky top-0 z-10 bg-[var(--surface-container-low)] border-b border-[var(--border-subtle)]">
              <tr className="flex items-center px-4 py-3 w-full">
                <th scope="col" className="w-32 shrink-0 label-caps text-[var(--on-surface-variant)] text-left font-normal">
                  Timestamp
                </th>
                <th scope="col" className="w-48 shrink-0 label-caps text-[var(--on-surface-variant)] text-left font-normal px-[var(--cell-x,16px)]">
                  User
                </th>
                <th scope="col" className="flex-1 min-w-[200px] label-caps text-[var(--on-surface-variant)] text-left font-normal px-[var(--cell-x,16px)]">
                  Action &amp; Resource
                </th>
                <th scope="col" className="w-36 shrink-0 label-caps text-[var(--on-surface-variant)] text-left font-normal px-[var(--cell-x,16px)]">
                  IP Address
                </th>
                <th scope="col" className="w-24 shrink-0 label-caps text-[var(--on-surface-variant)] text-right font-normal pl-[var(--cell-x,16px)]">
                  Status
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-subtle)]">
              {logs.map((row) => (
                <tr
                  key={`${row.timestamp}-${row.email}-${row.resource}`}
                  className={`flex items-center px-4 h-[48px] hover:bg-[var(--surface-canvas)] transition-colors ${row.failedRow ? "bg-[var(--error-container)]/10" : ""}`}
                >
                  <td className="w-32 shrink-0 data-mono text-[var(--on-surface-variant)] text-left">{row.timestamp}</td>
                  <td className="w-48 shrink-0 px-[var(--cell-x,16px)] flex items-center gap-2 truncate">
                    <div
                      className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${row.avatarClass}`}
                      aria-hidden="true"
                    >
                      {row.initials}
                    </div>
                    <span className="body-sm text-[var(--on-surface)] truncate">{row.email}</span>
                  </td>
                  <td className="flex-1 min-w-[200px] px-[var(--cell-x,16px)] flex items-center gap-2 truncate">
                    <span className={`body-sm font-semibold truncate ${row.status === "Failed" ? "text-[var(--error)]" : "text-[var(--on-surface)]"}`}>
                      {row.action}
                    </span>
                    <span className="data-mono text-[11px] text-[var(--outline)] bg-[var(--surface-variant)]/30 px-1.5 py-0.5 rounded shrink-0">
                      {row.resource}
                    </span>
                    {row.status === "Failed" && (
                      <span className="material-symbols-outlined text-[14px] text-[var(--error)] ml-1 shrink-0" aria-label="Insufficient funds" title="Insufficient funds">
                        info
                      </span>
                    )}
                  </td>
                  <td className="w-36 shrink-0 px-[var(--cell-x,16px)] data-mono text-[var(--on-surface-variant)] truncate text-left">
                    {row.ip}
                  </td>
                  <td className="w-24 shrink-0 pl-[var(--cell-x,16px)] flex justify-end">
                    <Badge
                      variant="secondary"
                      className={
                        row.status === "Success"
                          ? "rounded-full bg-[var(--success-status)]/10 text-[var(--success-status)] border border-[var(--success-status)]/20 px-2 py-0.5 text-[11px] font-medium"
                          : "rounded-full bg-[var(--failed-status)]/10 text-[var(--failed-status)] border border-[var(--failed-status)]/20 px-2 py-0.5 text-[11px] font-medium"
                      }
                    >
                      {row.status}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Table Footer / Pagination */}
        <div className="border-t border-[var(--border-subtle)] p-3 flex justify-between items-center bg-[var(--surface-container-lowest)] rounded-b-xl">
          <span className="body-sm text-[var(--on-surface-variant)]">Showing 1-5 of 12,042 events</span>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon-sm"
              disabled
              aria-label="Previous page"
              className="rounded hover:bg-[var(--surface-container)] text-[var(--on-surface-variant)] disabled:opacity-50"
            >
              <span className="material-symbols-outlined text-[20px]" aria-hidden="true">
                chevron_left
              </span>
            </Button>
            <span className="body-sm text-[var(--on-surface)]">Page 1 of 2409</span>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Next page"
              className="rounded hover:bg-[var(--surface-container)] text-[var(--on-surface-variant)]"
            >
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
