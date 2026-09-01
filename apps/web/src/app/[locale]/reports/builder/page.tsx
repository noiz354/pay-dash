import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export default function ReportsBuilderPage() {
  return (
    <main className="mx-auto max-w-container-max p-gutter space-y-6">
      <div>
        <h1 className="headline-xl text-[var(--on-surface)]">Custom Reports Builder</h1>
        <p className="body-sm text-[var(--on-surface-variant)] mt-1">Configure data source and filters to generate your report.</p>
      </div>

      <div className="flex flex-col lg:flex-row gap-6 lg:h-[760px] border border-[var(--outline-variant)] rounded-xl overflow-hidden bg-[var(--surface-container-lowest)] shadow-sm">
        {/* Config Sidebar w-80 */}
        <section className="w-full lg:w-80 border-b lg:border-b-0 lg:border-r border-[var(--outline-variant)] bg-[var(--surface-container-lowest)] flex flex-col shrink-0 overflow-y-auto">
          <div className="p-6 border-b border-[var(--outline-variant)] sticky top-0 bg-[var(--surface-container-lowest)] z-20">
            <h2 className="headline-md font-semibold text-[var(--on-surface)] mb-1">Report Builder</h2>
            <p className="body-sm text-[var(--on-surface-variant)]">Configure data source and filters.</p>
          </div>

          <div className="p-6 space-y-8 flex-1">
            {/* Data Source radios Transactions/Payouts/Customers/Disputes */}
            <div className="space-y-3">
              <Label className="label-caps text-[var(--on-surface)] uppercase tracking-wide flex items-center gap-2">
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                  dataset
                </span>
                Data Source
              </Label>
              <RadioGroup defaultValue="transactions" className="space-y-2">
                <Label className="flex items-center gap-2 p-2 rounded-lg border border-[var(--outline-variant)] hover:bg-[var(--surface-container-low)] cursor-pointer has-[[data-checked]]:border-[var(--primary)] has-[[data-checked]]:bg-[var(--primary-fixed)]/20">
                  <RadioGroupItem value="transactions" id="ds-transactions" />
                  <span className="material-symbols-outlined text-[var(--primary)]" style={{ fontSize: 16 }}>sync_alt</span>
                  <span className="body-sm font-medium">Transactions</span>
                </Label>
                <Label className="flex items-center gap-2 p-2 rounded-lg border border-[var(--outline-variant)] hover:bg-[var(--surface-container-low)] cursor-pointer has-[[data-checked]]:border-[var(--primary)] has-[[data-checked]]:bg-[var(--primary-fixed)]/20">
                  <RadioGroupItem value="payouts" id="ds-payouts" />
                  <span className="material-symbols-outlined text-[var(--secondary)]" style={{ fontSize: 16 }}>account_balance_wallet</span>
                  <span className="body-sm font-medium">Payouts</span>
                </Label>
                <Label className="flex items-center gap-2 p-2 rounded-lg border border-[var(--outline-variant)] hover:bg-[var(--surface-container-low)] cursor-pointer has-[[data-checked]]:border-[var(--primary)] has-[[data-checked]]:bg-[var(--primary-fixed)]/20">
                  <RadioGroupItem value="customers" id="ds-customers" />
                  <span className="material-symbols-outlined text-[var(--secondary)]" style={{ fontSize: 16 }}>group</span>
                  <span className="body-sm font-medium">Customers</span>
                </Label>
                <Label className="flex items-center gap-2 p-2 rounded-lg border border-[var(--outline-variant)] hover:bg-[var(--surface-container-low)] cursor-pointer has-[[data-checked]]:border-[var(--primary)] has-[[data-checked]]:bg-[var(--primary-fixed)]/20">
                  <RadioGroupItem value="disputes" id="ds-disputes" />
                  <span className="material-symbols-outlined text-[var(--secondary)]" style={{ fontSize: 16 }}>gavel</span>
                  <span className="body-sm font-medium">Disputes</span>
                </Label>
              </RadioGroup>
            </div>

            {/* Date Range dual 2023-10-01 */}
            <div className="space-y-3">
              <Label className="label-caps text-[var(--on-surface)] uppercase tracking-wide flex items-center gap-2">
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                  calendar_today
                </span>
                Date Range
              </Label>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <span className="body-sm text-[var(--on-surface-variant)] block mb-1">Start</span>
                  <Input type="date" defaultValue="2023-10-01" className="h-9" />
                </div>
                <div>
                  <span className="body-sm text-[var(--on-surface-variant)] block mb-1">End</span>
                  <Input type="date" defaultValue="2023-10-31" className="h-9" />
                </div>
              </div>
              <div className="flex gap-2 mt-2">
                <Button variant="outline" size="sm" className="flex-1 h-7 text-xs">7D</Button>
                <Button size="sm" className="flex-1 h-7 text-xs bg-[var(--primary)]/10 text-[var(--primary)] border border-[var(--primary)] hover:bg-[var(--primary)]/20">30D</Button>
                <Button variant="outline" size="sm" className="flex-1 h-7 text-xs">YTD</Button>
              </div>
            </div>

            {/* Filters Status/Amount */}
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <Label className="label-caps text-[var(--on-surface)] uppercase tracking-wide flex items-center gap-2">
                  <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                    filter_list
                  </span>
                  Filters
                </Label>
                <button className="text-[var(--primary)] hover:text-[var(--primary-container)] body-sm flex items-center gap-1">
                  <span className="material-symbols-outlined" style={{ fontSize: 14 }}>
                    add
                  </span>{" "}
                  Add
                </button>
              </div>
              <div className="space-y-2">
                <div className="p-3 rounded bg-[var(--surface-container)] border border-[var(--outline-variant)]/50 flex flex-col gap-2">
                  <div className="flex justify-between items-center">
                    <span className="body-sm font-medium">Status</span>
                    <button className="text-[var(--on-surface-variant)] hover:text-[var(--error)] transition-colors">
                      <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                        close
                      </span>
                    </button>
                  </div>
                  <Select defaultValue="equal">
                    <SelectTrigger className="h-8 w-full bg-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="equal">is equal to</SelectItem>
                      <SelectItem value="not">is not equal to</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select defaultValue="succeeded">
                    <SelectTrigger className="h-8 w-full bg-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="succeeded">Succeeded</SelectItem>
                      <SelectItem value="failed">Failed</SelectItem>
                      <SelectItem value="pending">Pending</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="p-3 rounded bg-[var(--surface-container)] border border-[var(--outline-variant)]/50 flex flex-col gap-2">
                  <div className="flex justify-between items-center">
                    <span className="body-sm font-medium">Amount (USD)</span>
                    <button className="text-[var(--on-surface-variant)] hover:text-[var(--error)] transition-colors">
                      <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                        close
                      </span>
                    </button>
                  </div>
                  <Select defaultValue="gt">
                    <SelectTrigger className="h-8 w-full bg-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="gt">is greater than</SelectItem>
                      <SelectItem value="lt">is less than</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input type="number" defaultValue="1000" className="h-8 data-mono bg-white" />
                </div>
              </div>
            </div>

            {/* Columns 7 checks */}
            <div className="space-y-3">
              <Label className="label-caps text-[var(--on-surface)] uppercase tracking-wide flex items-center gap-2">
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                  view_column
                </span>
                Columns
              </Label>
              <div className="space-y-1">
                <Label className="flex items-center gap-2 p-1.5 hover:bg-[var(--surface-container-low)] rounded cursor-pointer font-normal">
                  <Checkbox defaultChecked />
                  <span className="body-sm">Transaction ID</span>
                </Label>
                <Label className="flex items-center gap-2 p-1.5 hover:bg-[var(--surface-container-low)] rounded cursor-pointer font-normal">
                  <Checkbox defaultChecked />
                  <span className="body-sm">Date & Time</span>
                </Label>
                <Label className="flex items-center gap-2 p-1.5 hover:bg-[var(--surface-container-low)] rounded cursor-pointer font-normal">
                  <Checkbox defaultChecked />
                  <span className="body-sm">Amount</span>
                </Label>
                <Label className="flex items-center gap-2 p-1.5 hover:bg-[var(--surface-container-low)] rounded cursor-pointer font-normal">
                  <Checkbox defaultChecked />
                  <span className="body-sm">Status</span>
                </Label>
                <Label className="flex items-center gap-2 p-1.5 hover:bg-[var(--surface-container-low)] rounded cursor-pointer font-normal">
                  <Checkbox defaultChecked />
                  <span className="body-sm">Customer Email</span>
                </Label>
                <Label className="flex items-center gap-2 p-1.5 hover:bg-[var(--surface-container-low)] rounded cursor-pointer font-normal">
                  <Checkbox />
                  <span className="body-sm">Payment Method</span>
                </Label>
                <Label className="flex items-center gap-2 p-1.5 hover:bg-[var(--surface-container-low)] rounded cursor-pointer font-normal">
                  <Checkbox />
                  <span className="body-sm">Fee</span>
                </Label>
              </div>
            </div>
          </div>

          <div className="p-4 border-t border-[var(--outline-variant)] bg-[var(--surface-container-lowest)] sticky bottom-0 z-20 flex gap-3">
            <Button variant="outline" className="flex-1 h-9">
              Reset
            </Button>
            <Button className="flex-1 h-9">Apply</Button>
          </div>
        </section>

        {/* Live Preview */}
        <section className="flex-1 flex flex-col overflow-hidden bg-[var(--surface-canvas)] min-h-[600px]">
          <div className="h-16 border-b border-[var(--outline-variant)] bg-[var(--surface)] flex items-center justify-between px-6 shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-2 h-2 rounded-full bg-[var(--success-status)] animate-pulse" />
              <span className="headline-md font-semibold">Live Preview</span>
              <span className="body-sm text-[var(--on-surface-variant)] bg-[var(--surface-container-low)] px-2 py-0.5 rounded border border-[var(--outline-variant)]">Showing 1,248 rows</span>
            </div>
            <div className="flex items-center gap-3">
              <Button variant="outline" className="h-9 gap-2">
                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
                  schedule
                </span>
                Schedule
              </Button>
              <Button className="h-9 gap-2">
                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
                  download
                </span>
                Export CSV
              </Button>
            </div>
          </div>

          <div className="flex-1 overflow-auto p-6 relative">
            <Card className="overflow-hidden flex flex-col h-full">
              <Table>
                <TableHeader className="bg-[var(--surface-container-low)] label-caps sticky top-0">
                  <TableRow>
                    <TableHead className="label-caps text-[var(--on-surface-variant)]">Transaction ID</TableHead>
                    <TableHead className="label-caps text-[var(--on-surface-variant)]">Date & Time</TableHead>
                    <TableHead className="label-caps text-[var(--on-surface-variant)]">Customer</TableHead>
                    <TableHead className="label-caps text-[var(--on-surface-variant)] text-right">Status</TableHead>
                    <TableHead className="label-caps text-[var(--on-surface-variant)] text-right">Amount (USD)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow className="hover:bg-[var(--surface-container)]/30">
                    <TableCell className="data-mono text-[var(--primary)] cursor-pointer hover:underline">txn_1Nj8V2</TableCell>
                    <TableCell className="body-sm text-[var(--on-surface-variant)]">Oct 24, 14:32:01</TableCell>
                    <TableCell className="body-sm text-[var(--on-surface)] truncate max-w-[180px]">sarah.jenkins@example.com</TableCell>
                    <TableCell className="text-right">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-[var(--status-success-bg)] text-[var(--success-status)] body-sm border border-[var(--success-status)]/20">Succeeded</span>
                    </TableCell>
                    <TableCell className="data-mono text-[var(--on-surface)] text-right">,250.00</TableCell>
                  </TableRow>
                  <TableRow className="hover:bg-[var(--surface-container)]/30">
                    <TableCell className="data-mono text-[var(--primary)] cursor-pointer hover:underline">txn_1Nj8U9</TableCell>
                    <TableCell className="body-sm text-[var(--on-surface-variant)]">Oct 24, 14:28:45</TableCell>
                    <TableCell className="body-sm text-[var(--on-surface)] truncate max-w-[180px]">michael.chen@corp.io</TableCell>
                    <TableCell className="text-right">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-amber-50 text-[var(--pending-status)] body-sm border border-[var(--pending-status)]/20">Processing</span>
                    </TableCell>
                    <TableCell className="data-mono text-[var(--on-surface)] text-right">,500.00</TableCell>
                  </TableRow>
                  <TableRow className="hover:bg-[var(--surface-container)]/30 bg-[var(--error-container)]/10">
                    <TableCell className="data-mono text-[var(--primary)] cursor-pointer hover:underline">txn_1Nj8T5</TableCell>
                    <TableCell className="body-sm text-[var(--on-surface-variant)]">Oct 24, 14:15:22</TableCell>
                    <TableCell className="body-sm text-[var(--on-surface)] truncate max-w-[180px]">billing@techstart.co</TableCell>
                    <TableCell className="text-right">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-[var(--status-error-bg)] text-[var(--failed-status)] body-sm border border-[var(--failed-status)]/20">Failed</span>
                    </TableCell>
                    <TableCell className="data-mono text-[var(--on-surface)] text-right">99.00</TableCell>
                  </TableRow>
                  <TableRow className="hover:bg-[var(--surface-container)]/30">
                    <TableCell className="data-mono text-[var(--primary)] cursor-pointer hover:underline">txn_1Nj8S1</TableCell>
                    <TableCell className="body-sm text-[var(--on-surface-variant)]">Oct 24, 13:55:10</TableCell>
                    <TableCell className="body-sm text-[var(--on-surface)] truncate max-w-[180px]">emma.davis@designco.net</TableCell>
                    <TableCell className="text-right">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-[var(--status-success-bg)] text-[var(--success-status)] body-sm border border-[var(--success-status)]/20">Succeeded</span>
                    </TableCell>
                    <TableCell className="data-mono text-[var(--on-surface)] text-right">,150.50</TableCell>
                  </TableRow>
                  <TableRow className="hover:bg-[var(--surface-container)]/30">
                    <TableCell className="data-mono text-[var(--primary)] cursor-pointer hover:underline">txn_1Nj8R8</TableCell>
                    <TableCell className="body-sm text-[var(--on-surface-variant)]">Oct 24, 13:42:05</TableCell>
                    <TableCell className="body-sm text-[var(--on-surface)] truncate max-w-[180px]">operations@logistics.com</TableCell>
                    <TableCell className="text-right">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-[var(--status-success-bg)] text-[var(--success-status)] body-sm border border-[var(--success-status)]/20">Succeeded</span>
                    </TableCell>
                    <TableCell className="data-mono text-[var(--on-surface)] text-right">2,400.00</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
              <div className="bg-[var(--surface-container-lowest)] border-t border-[var(--outline-variant)] px-4 py-2 flex justify-between items-center mt-auto shrink-0">
                <span className="body-sm text-[var(--on-surface-variant)]">1-50 of 1,248</span>
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon-sm" disabled>
                    <span className="material-symbols-outlined" style={{ fontSize: 20 }}>
                      chevron_left
                    </span>
                  </Button>
                  <Button variant="ghost" size="icon-sm">
                    <span className="material-symbols-outlined" style={{ fontSize: 20 }}>
                      chevron_right
                    </span>
                  </Button>
                </div>
              </div>
            </Card>
          </div>
        </section>
      </div>
    </main>
  );
}
