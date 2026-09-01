import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";

export default function RiskPage() {
  return (
    <main className="mx-auto max-w-container-max p-gutter space-y-6">
      {/* Page Header — screens/desktop/risk_velocity_limits_desktop:182-189 */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4 border-b border-[var(--border-subtle)] pb-4">
        <div>
          <h1 className="headline-xl text-[var(--on-surface)]">Risk &amp; Velocity Limits</h1>
          <p className="body-md text-[var(--on-surface-variant)] mt-1">Configure transaction thresholds and monitor real-time velocity triggers.</p>
        </div>
        <div className="flex items-center gap-3">
          <Badge
            variant="outline"
            className="inline-flex items-center gap-1.5 rounded-full border-[var(--success-status)]/20 bg-[var(--success-status)]/10 px-2.5 py-1 text-[var(--success-status)] label-caps"
            aria-label="Active ruleset"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--success-status)]" aria-hidden="true" />
            Active Ruleset
          </Badge>
          <Button
            variant="outline"
            className="h-9 bg-[var(--surface-container)] border-[var(--border-subtle)] text-[var(--on-surface)] label-caps hover:bg-[var(--surface-container-high)]"
          >
            Discard Draft
          </Button>
          <Button className="h-9 bg-[var(--primary)] text-[var(--on-primary)] label-caps shadow-sm hover:bg-[var(--surface-tint)]">Deploy Changes</Button>
        </div>
      </div>

      {/* Active Alerts Bento Grid — screens/desktop/risk_velocity_limits_desktop:191-228 */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-4" aria-label="Active alerts">
        <Card className="md:col-span-1 flex flex-col justify-between border border-[var(--border-subtle)] bg-[var(--surface-container-lowest)] p-4 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <span className="label-caps text-[var(--on-surface-variant)]">Alerts (24h)</span>
            <span className="material-symbols-outlined text-[20px] text-[var(--failed-status)]" aria-hidden="true">
              warning
            </span>
          </div>
          <div>
            <div className="headline-xl text-[var(--on-surface)]">14</div>
            <p className="body-sm mt-1 flex items-center gap-1 text-[var(--failed-status)]">
              <span className="material-symbols-outlined text-[16px]" aria-hidden="true">
                arrow_upward
              </span>
              12% vs yesterday
            </p>
          </div>
        </Card>
        <Card className="md:col-span-2 border border-[var(--border-subtle)] bg-[var(--surface-container-lowest)] p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between border-b border-[var(--border-subtle)] pb-2">
            <span className="label-caps text-[var(--on-surface-variant)]">Critical Triggers</span>
            <button type="button" className="body-sm text-[var(--primary)] hover:underline">
              View All
            </button>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between py-1">
              <div className="flex items-center gap-3">
                <span className="h-2 w-2 rounded-full bg-[var(--failed-status)]" aria-hidden="true" />
                <span className="body-sm font-medium text-[var(--on-surface)]">Velocity Max: Card ending 4492</span>
              </div>
              <span className="data-mono text-[var(--on-surface-variant)]">10:42 AM</span>
            </div>
            <div className="flex items-center justify-between py-1">
              <div className="flex items-center gap-3">
                <span className="h-2 w-2 rounded-full bg-[var(--pending-status)]" aria-hidden="true" />
                <span className="body-sm font-medium text-[var(--on-surface)]">Txn Limit Approaching: Merchant A</span>
              </div>
              <span className="data-mono text-[var(--on-surface-variant)]">09:15 AM</span>
            </div>
          </div>
        </Card>
      </section>

      {/* Configuration Grid — screens/desktop/risk_velocity_limits_desktop:231-272 */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-8 space-y-6">
          <Card className="overflow-hidden border border-[var(--border-subtle)] bg-[var(--surface-container-lowest)] shadow-sm">
            <div className="flex items-center justify-between border-b border-[var(--border-subtle)] bg-[var(--surface-container-low)] px-4 py-3">
              <h2 className="headline-md text-[var(--on-surface)]">Global Volume Limits</h2>
              <Switch defaultChecked aria-label="Global volume limits enabled" />
            </div>
            <div className="space-y-5 p-4">
              <div className="grid grid-cols-1 items-center gap-4 md:grid-cols-2">
                <div>
                  <label htmlFor="daily-volume" className="body-sm block font-medium text-[var(--on-surface)]">Max Daily Volume (USD)</label>
                  <p className="body-sm text-[12px] text-[var(--on-surface-variant)]">Total settled value per 24h rolling window.</p>
                </div>
                <div className="relative">
                  <span className="data-mono pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--on-surface-variant)]" aria-hidden="true">
                    $
                  </span>
                  <Input
                    id="daily-volume"
                    defaultValue="1,500,000"
                    aria-label="Max daily volume USD"
                    className="h-9 border-[var(--border-subtle)] bg-[var(--surface)] pl-8 pr-3 text-right data-mono focus-visible:border-[var(--primary)] focus-visible:ring-[var(--primary)]"
                  />
                </div>
              </div>
              <hr className="border-[var(--border-subtle)]" />
              <div className="grid grid-cols-1 items-center gap-4 md:grid-cols-2">
                <div>
                  <label htmlFor="monthly-volume" className="body-sm block font-medium text-[var(--on-surface)]">Max Monthly Volume (USD)</label>
                  <p className="body-sm text-[12px] text-[var(--on-surface-variant)]">Hard cap for calendar month processing.</p>
                </div>
                <div className="relative">
                  <span className="data-mono pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--on-surface-variant)]" aria-hidden="true">
                    $
                  </span>
                  <Input
                    id="monthly-volume"
                    defaultValue="45,000,000"
                    aria-label="Max monthly volume USD"
                    className="h-9 border-[var(--border-subtle)] bg-[var(--surface)] pl-8 pr-3 text-right data-mono focus-visible:border-[var(--primary)] focus-visible:ring-[var(--primary)]"
                  />
                </div>
              </div>
            </div>
          </Card>
        </div>
        <div className="lg:col-span-4" aria-hidden="true" />
      </div>
    </main>
  );
}
