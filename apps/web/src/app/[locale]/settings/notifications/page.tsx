import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export default function NotificationsPage() {
  return (
    <main className="mx-auto w-full max-w-container-max p-gutter space-y-6 bg-[var(--surface-canvas)]">
      {/* Page Header — breadcrumb + headline */}
      <div className="mb-2">
        <div className="flex items-center gap-2 text-[var(--on-surface-variant)] body-sm mb-2">
          <a href="#" className="hover:text-[var(--primary)] transition-colors">
            Settings
          </a>
          <span className="material-symbols-outlined text-[14px]" aria-hidden="true">
            chevron_right
          </span>
          <span className="text-[var(--on-surface)]">Notifications</span>
        </div>
        <h1 className="headline-xl text-[var(--on-surface)]">Notification Preferences</h1>
        <p className="body-md text-[var(--on-surface-variant)] mt-2 max-w-2xl">
          Manage how and when you receive alerts for system events, transactions, and account activities.
        </p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Global Delivery — 3 toggles Email admin@acme / SMS / Dashboard */}
        <div className="xl:col-span-1 space-y-6">
          <div className="bg-[var(--surface-container-lowest)] border border-[var(--border-subtle)] rounded-xl p-6 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)]">
            <h2 className="headline-lg text-[var(--on-surface)] mb-1">Global Delivery</h2>
            <p className="body-sm text-[var(--on-surface-variant)] mb-6">Master toggles for communication channels.</p>
            <div className="space-y-4">
              <div className="flex items-center justify-between p-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-canvas)] hover:bg-[var(--surface-container-low)] transition-colors">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-md bg-[var(--surface-variant)] flex items-center justify-center text-[var(--on-surface)] shrink-0">
                    <span className="material-symbols-outlined text-[18px]" aria-hidden="true">
                      mail
                    </span>
                  </div>
                  <div>
                    <div className="body-md font-medium text-[var(--on-surface)]">Email Notifications</div>
                    <div className="body-sm text-[var(--on-surface-variant)]">Sent to admin@acmecorp.com</div>
                  </div>
                </div>
                <Switch defaultChecked aria-label="Email Notifications" id="toggle_email" />
              </div>
              <div className="flex items-center justify-between p-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-canvas)] hover:bg-[var(--surface-container-low)] transition-colors">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-md bg-[var(--surface-variant)] flex items-center justify-center text-[var(--on-surface)] shrink-0">
                    <span className="material-symbols-outlined text-[18px]" aria-hidden="true">
                      sms
                    </span>
                  </div>
                  <div>
                    <div className="body-md font-medium text-[var(--on-surface)]">SMS Alerts</div>
                    <div className="body-sm text-[var(--on-surface-variant)]">Critical security alerts only</div>
                  </div>
                </div>
                <Switch defaultChecked aria-label="SMS Alerts" id="toggle_sms" />
              </div>
              <div className="flex items-center justify-between p-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-canvas)] hover:bg-[var(--surface-container-low)] transition-colors">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-md bg-[var(--surface-variant)] flex items-center justify-center text-[var(--on-surface)] shrink-0">
                    <span className="material-symbols-outlined text-[18px]" aria-hidden="true">
                      dashboard
                    </span>
                  </div>
                  <div>
                    <div className="body-md font-medium text-[var(--on-surface)]">Dashboard Feed</div>
                    <div className="body-sm text-[var(--on-surface-variant)]">In-app notification center</div>
                  </div>
                </div>
                <Switch defaultChecked aria-label="Dashboard Feed" id="toggle_dash" />
              </div>
            </div>
          </div>
        </div>

        {/* Categories Column — Payments 3 ACTIVE + Security */}
        <div className="xl:col-span-2 space-y-6">
          {/* Payments — 3 ACTIVE EVENT/EMAIL/DASHBOARD/SMS Successful Daily / Failed CRITICAL Instant */}
          <div className="bg-[var(--surface-container-lowest)] border border-[var(--border-subtle)] rounded-xl overflow-hidden shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)]">
            <div className="px-6 py-4 border-b border-[var(--border-subtle)] bg-[var(--surface-canvas)] flex justify-between items-center">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[var(--primary)]" aria-hidden="true">
                  payments
                </span>
                <h3 className="headline-md text-[var(--on-surface)]">Payments</h3>
              </div>
              <span className="label-caps text-[var(--on-surface-variant)]">3 ACTIVE</span>
            </div>
            <div className="p-0">
              <div className="grid grid-cols-12 gap-4 px-6 py-3 border-b border-[var(--border-subtle)] bg-[var(--surface-container-low)]/50 label-caps text-[var(--on-surface-variant)]">
                <div className="col-span-5">EVENT TYPE</div>
                <div className="col-span-3 text-center">EMAIL FREQUENCY</div>
                <div className="col-span-2 text-center">DASHBOARD</div>
                <div className="col-span-2 text-center">SMS</div>
              </div>
              {/* Successful Charges — Daily Digest */}
              <div className="grid grid-cols-12 gap-4 px-6 py-4 border-b border-[var(--border-subtle)] items-center hover:bg-[var(--surface-canvas)] transition-colors">
                <div className="col-span-5">
                  <div className="body-md font-medium text-[var(--on-surface)]">Successful Charges</div>
                  <div className="body-sm text-[var(--on-surface-variant)]">When a customer payment clears</div>
                </div>
                <div className="col-span-3 flex justify-center">
                  <Select defaultValue="daily">
                    <SelectTrigger
                      aria-label="Successful Charges email frequency"
                      className="h-8 w-[140px] border-[var(--outline-variant)] bg-[var(--surface-container-lowest)] text-[var(--on-surface)]"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="daily">Daily Digest</SelectItem>
                      <SelectItem value="instant">Instant</SelectItem>
                      <SelectItem value="weekly">Weekly</SelectItem>
                      <SelectItem value="off">Off</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="col-span-2 flex justify-center">
                  <Switch defaultChecked aria-label="Successful Charges dashboard" id="p_succ_dash" />
                </div>
                <div className="col-span-2 flex justify-center">
                  <Switch aria-label="Successful Charges SMS" id="p_succ_sms" />
                </div>
              </div>
              {/* Failed Charges — CRITICAL Instant */}
              <div className="grid grid-cols-12 gap-4 px-6 py-4 border-b border-[var(--border-subtle)] items-center hover:bg-[var(--surface-canvas)] transition-colors">
                <div className="col-span-5">
                  <div className="body-md font-medium text-[var(--on-surface)] flex items-center gap-2">
                    Failed Charges
                    <Badge className="rounded-full bg-[var(--failed-status)]/10 px-1.5 py-0.5 text-[9px] font-bold text-[var(--failed-status)] label-caps border-transparent hover:bg-[var(--failed-status)]/10">
                      CRITICAL
                    </Badge>
                  </div>
                  <div className="body-sm text-[var(--on-surface-variant)]">Declines, insufficient funds, fraud blocks</div>
                </div>
                <div className="col-span-3 flex justify-center">
                  <Select defaultValue="instant">
                    <SelectTrigger
                      aria-label="Failed Charges email frequency"
                      className="h-8 w-[140px] border-[var(--outline-variant)] bg-[var(--surface-container-lowest)] text-[var(--on-surface)]"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="instant">Instant</SelectItem>
                      <SelectItem value="daily">Daily Digest</SelectItem>
                      <SelectItem value="weekly">Weekly</SelectItem>
                      <SelectItem value="off">Off</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="col-span-2 flex justify-center">
                  <Switch defaultChecked aria-label="Failed Charges dashboard" id="p_fail_dash" />
                </div>
                <div className="col-span-2 flex justify-center">
                  <Switch defaultChecked aria-label="Failed Charges SMS" id="p_fail_sms" />
                </div>
              </div>
            </div>
          </div>

          {/* Security — New Device Forced disabled lock */}
          <div className="bg-[var(--surface-container-lowest)] border border-[var(--border-subtle)] rounded-xl overflow-hidden shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)]">
            <div className="px-6 py-4 border-b border-[var(--border-subtle)] bg-[var(--surface-canvas)] flex justify-between items-center">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[var(--primary)]" aria-hidden="true">
                  shield
                </span>
                <h3 className="headline-md text-[var(--on-surface)]">Security &amp; Access</h3>
              </div>
            </div>
            <div className="p-0">
              <div className="grid grid-cols-12 gap-4 px-6 py-3 border-b border-[var(--border-subtle)] bg-[var(--surface-container-low)]/50 label-caps text-[var(--on-surface-variant)]">
                <div className="col-span-5">EVENT TYPE</div>
                <div className="col-span-3 text-center">EMAIL FREQUENCY</div>
                <div className="col-span-2 text-center">DASHBOARD</div>
                <div className="col-span-2 text-center">SMS</div>
              </div>
              <div className="grid grid-cols-12 gap-4 px-6 py-4 items-center bg-[var(--surface-canvas)]/50">
                <div className="col-span-5">
                  <div className="body-md font-medium text-[var(--on-surface)] flex items-center gap-2">
                    New Device Login
                    <span className="material-symbols-outlined text-[14px] text-[var(--outline)]" aria-label="Required by security policy" title="Required by security policy">
                      lock
                    </span>
                  </div>
                  <div className="body-sm text-[var(--on-surface-variant)]">Login from an unrecognized IP/device</div>
                </div>
                <div className="col-span-3 flex justify-center">
                  <Select defaultValue="forced" disabled>
                    <SelectTrigger
                      aria-label="New Device Login email frequency"
                      className="h-8 w-[150px] border-[var(--outline-variant)]/30 bg-[var(--surface-variant)]/30 text-[var(--on-surface-variant)] opacity-70"
                    >
                      <SelectValue placeholder="Instant (Forced)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="forced">Instant (Forced)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="col-span-2 flex justify-center opacity-50">
                  <Switch defaultChecked disabled aria-label="New Device Login dashboard" />
                </div>
                <div className="col-span-2 flex justify-center opacity-50">
                  <Switch defaultChecked disabled aria-label="New Device Login SMS" />
                </div>
              </div>
            </div>
          </div>

          {/* Action Bar — Reset/Save */}
          <div className="flex justify-end gap-3 pt-4">
            <Button
              variant="outline"
              aria-label="Reset to Defaults"
              className="h-9 px-4 border border-[var(--outline-variant)] bg-[var(--surface)] text-[var(--on-surface)] hover:bg-[var(--surface-container-low)]"
            >
              Reset to Defaults
            </Button>
            <Button
              aria-label="Save Preferences"
              className="h-9 px-4 bg-[var(--primary)] text-[var(--on-primary)] hover:bg-[var(--on-primary-fixed-variant)] shadow-sm"
            >
              Save Preferences
            </Button>
          </div>
        </div>
      </div>
    </main>
  );
}
