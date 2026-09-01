import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

export default function PayoutSettingsPage() {
  return (
    <main className="mx-auto w-full max-w-[var(--container-max)] p-[var(--gutter)] space-y-6">
      <div>
        <h1 className="headline-xl text-[var(--on-surface)]">Payout Settings</h1>
        <p className="body-sm mt-1 text-[var(--on-surface-variant)]">Configure settlement, destination and notification preferences.</p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="flex flex-col gap-6 lg:col-span-8">
          <section className="rounded-xl border border-[var(--outline-variant)] bg-[var(--surface-container-lowest)] p-6">
            <h2 className="mb-6 flex items-center gap-2 headline-md text-[var(--on-surface)]">
              <span className="material-symbols-outlined text-[var(--primary)]" aria-hidden="true">tune</span>
              Settlement Configuration
            </h2>

            <div className="flex items-center justify-between border-b border-[var(--surface-container-high)] py-4">
              <div>
                <Label htmlFor="auto-payout-toggle" className="body-md mb-1 block font-medium text-[var(--on-surface)]">Automated Payouts</Label>
                <p className="body-sm text-[var(--on-surface-variant)]">Automatically sweep funds to your destination account.</p>
              </div>
              <Switch id="auto-payout-toggle" defaultChecked aria-label="Automated Payouts toggle" />
            </div>

            <div className="border-b border-[var(--surface-container-high)] py-4">
              <Label className="body-md mb-3 block font-medium text-[var(--on-surface)]">Payout Schedule</Label>
              <RadioGroup defaultValue="weekly" className="grid grid-cols-3 gap-3" aria-label="Payout Schedule">
                <Label htmlFor="schedule-daily" className="cursor-pointer">
                  <RadioGroupItem id="schedule-daily" value="daily" className="peer sr-only" />
                  <div className="rounded-lg border border-[var(--outline-variant)] px-4 py-2 text-center body-sm text-[var(--on-surface-variant)] peer-data-[state=checked]:border-[var(--primary)] peer-data-[state=checked]:bg-[var(--primary-container)] peer-data-[state=checked]:text-[var(--on-primary-container)] transition-colors">
                    Daily
                  </div>
                </Label>
                <Label htmlFor="schedule-weekly" className="cursor-pointer">
                  <RadioGroupItem id="schedule-weekly" value="weekly" className="peer sr-only" />
                  <div className="rounded-lg border border-[var(--outline-variant)] px-4 py-2 text-center body-sm text-[var(--on-surface-variant)] peer-data-[state=checked]:border-[var(--primary)] peer-data-[state=checked]:bg-[var(--primary-container)] peer-data-[state=checked]:text-[var(--on-primary-container)] transition-colors">
                    Weekly
                  </div>
                </Label>
                <Label htmlFor="schedule-monthly" className="cursor-pointer">
                  <RadioGroupItem id="schedule-monthly" value="monthly" className="peer sr-only" />
                  <div className="rounded-lg border border-[var(--outline-variant)] px-4 py-2 text-center body-sm text-[var(--on-surface-variant)] peer-data-[state=checked]:border-[var(--primary)] peer-data-[state=checked]:bg-[var(--primary-container)] peer-data-[state=checked]:text-[var(--on-primary-container)] transition-colors">
                    Monthly
                  </div>
                </Label>
              </RadioGroup>
            </div>

            <div className="pt-4">
              <Label htmlFor="min-payout" className="body-md mb-2 block font-medium text-[var(--on-surface)]">Minimum Payout Amount</Label>
              <div className="relative w-full max-w-sm">
                <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 data-mono text-sm text-[var(--on-surface-variant)]" aria-hidden="true">IDR</span>
                <Input id="min-payout" defaultValue="50,000" placeholder="10,000" aria-label="Minimum Payout Amount" className="w-full rounded-md border-[var(--outline-variant)] bg-white pl-12 pr-12 py-2 data-mono text-sm text-[var(--on-surface)] focus-visible:border-[var(--primary)] focus-visible:ring-1 focus-visible:ring-[var(--primary)]" />
              </div>
              <p className="mt-2 body-sm text-[var(--on-surface-variant)]">Payouts will only trigger if balance meets this threshold.</p>
            </div>
          </section>

          <section className="group relative overflow-hidden rounded-xl border border-[var(--outline-variant)] bg-[var(--surface-container-lowest)] p-6">
            <div className="pointer-events-none absolute -right-16 -top-16 h-32 w-32 rounded-bl-full bg-[var(--primary)]/5 transition-transform duration-500 group-hover:scale-110" aria-hidden="true" />
            <div className="relative z-10 mb-6 flex items-start justify-between">
              <h2 className="flex items-center gap-2 headline-md text-[var(--on-surface)]">
                <span className="material-symbols-outlined text-[var(--primary)]" aria-hidden="true">account_balance_wallet</span>
                Destination Account
              </h2>
              <Button variant="ghost" size="sm" className="px-3 py-1 text-[var(--primary)] hover:bg-[var(--primary)]/10 body-sm font-medium">Change</Button>
            </div>
            <div className="relative z-10 flex items-center gap-4 rounded-lg border border-[var(--surface-container-high)] bg-[var(--surface-bright)] p-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded border border-[var(--outline-variant)] bg-white">
                <span className="headline-md font-bold text-[var(--primary)]">BCA</span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="body-md truncate font-semibold text-[var(--on-surface)]">Bank Central Asia</p>
                <div className="mt-1 flex items-center gap-2">
                  <span className="data-mono text-[var(--on-surface-variant)]">**** 1234</span>
                  <span className="inline-flex items-center rounded bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">Verified</span>
                </div>
              </div>
            </div>
          </section>
        </div>

        <div className="flex flex-col gap-6 lg:col-span-4">
          <section className="rounded-xl border border-[var(--outline-variant)] bg-[var(--surface-container-lowest)] p-6">
            <h2 className="mb-6 flex items-center gap-2 headline-md text-[var(--on-surface)]">
              <span className="material-symbols-outlined text-[var(--primary)]" aria-hidden="true">notifications_active</span>
              Email Notifications
            </h2>
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <Checkbox id="notify-initiated" defaultChecked aria-label="Payout initiated" className="mt-1 border-[var(--outline-variant)] data-[state=checked]:bg-[var(--primary)] data-[state=checked]:border-[var(--primary)] data-[state=checked]:text-white" />
                <div className="leading-6">
                  <Label htmlFor="notify-initiated" className="body-md font-medium text-[var(--on-surface)]">Payout initiated</Label>
                  <p className="body-sm text-[var(--on-surface-variant)]">Receive an email when processing begins.</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Checkbox id="notify-completed" defaultChecked aria-label="Payout completed" className="mt-1 border-[var(--outline-variant)] data-[state=checked]:bg-[var(--primary)] data-[state=checked]:border-[var(--primary)] data-[state=checked]:text-white" />
                <div className="leading-6">
                  <Label htmlFor="notify-completed" className="body-md font-medium text-[var(--on-surface)]">Payout completed</Label>
                  <p className="body-sm text-[var(--on-surface-variant)]">Receive an email when funds settle.</p>
                </div>
              </div>
            </div>
          </section>

          <div className="mt-auto flex justify-end gap-3 pt-6 lg:pt-0">
            <Button variant="outline" className="border-[var(--outline-variant)] px-4 py-2 body-md font-medium text-[var(--on-surface)] hover:bg-[var(--surface-container)]">Discard</Button>
            <Button className="bg-[var(--primary)] px-4 py-2 body-md font-medium text-[var(--on-primary)] shadow-sm hover:bg-[var(--primary)]/90">Save Changes</Button>
          </div>
        </div>
      </div>
    </main>
  );
}
