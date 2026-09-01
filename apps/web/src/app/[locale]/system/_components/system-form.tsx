"use client";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Slider } from "@/components/ui/slider";

export function SystemForm() {
  return (
    <form className="space-y-6" onSubmit={(e) => e.preventDefault()} aria-label="Monitoring settings">
      <div>
        <h4 className="label-caps text-[var(--on-surface-variant)] mb-3">Alert Thresholds</h4>
        <div className="space-y-4">
          <div>
            <div className="flex justify-between items-center mb-2">
              <Label htmlFor="failure-rate" className="body-sm text-[var(--on-surface)] font-normal">
                Failure Rate Alert
              </Label>
              <span className="data-mono text-[var(--primary)]" aria-live="polite">
                &gt; 5%
              </span>
            </div>
            <Slider id="failure-rate" aria-label="Failure Rate Alert threshold 5 percent" defaultValue={[5]} min={1} max={20} />
            <p className="text-xs text-[var(--on-surface-variant)] mt-1">Alert when failure rate exceeds threshold over 5m window.</p>
          </div>
          <div>
            <div className="flex justify-between items-center mb-2">
              <Label htmlFor="queue-depth" className="body-sm text-[var(--on-surface)] font-normal">
                Queue Depth Alert
              </Label>
              <span className="data-mono text-[var(--primary)]" aria-live="polite">
                &gt; 500
              </span>
            </div>
            <Slider id="queue-depth" aria-label="Queue Depth Alert threshold 500" defaultValue={[500]} min={100} max={2000} step={100} />
          </div>
        </div>
      </div>
      <div className="pt-4 border-t border-[var(--border-subtle)]">
        <h4 className="label-caps text-[var(--on-surface-variant)] mb-3">Notification Channels</h4>
        <div className="space-y-3">
          <label
            htmlFor="channel-email"
            className="flex items-center gap-3 p-2 hover:bg-[var(--surface-container)] rounded-md cursor-pointer transition-colors border border-transparent hover:border-[var(--border-subtle)]"
          >
            <Checkbox id="channel-email" defaultChecked aria-label="Email Operations Team" />
            <span className="flex flex-col">
              <span className="body-sm text-[var(--on-surface)] font-medium">Email Operations Team</span>
              <span className="text-xs text-[var(--on-surface-variant)]">ops-alerts@kinetic.local</span>
            </span>
          </label>
          <label
            htmlFor="channel-slack"
            className="flex items-center gap-3 p-2 hover:bg-[var(--surface-container)] rounded-md cursor-pointer transition-colors border border-transparent hover:border-[var(--border-subtle)]"
          >
            <Checkbox id="channel-slack" defaultChecked aria-label="Slack PagerDuty" />
            <span className="flex flex-col">
              <span className="body-sm text-[var(--on-surface)] font-medium">Slack PagerDuty</span>
              <span className="text-xs text-[var(--on-surface-variant)]">#alerts-critical</span>
            </span>
          </label>
          <label
            htmlFor="channel-sms"
            className="flex items-center gap-3 p-2 hover:bg-[var(--surface-container)] rounded-md cursor-pointer transition-colors border border-transparent hover:border-[var(--border-subtle)] opacity-60"
          >
            <Checkbox id="channel-sms" aria-label="SMS On-call Engineer" />
            <span className="flex flex-col">
              <span className="body-sm text-[var(--on-surface)] font-medium">SMS On-call Engineer</span>
              <span className="text-xs text-[var(--on-surface-variant)]">Requires premium tier</span>
            </span>
          </label>
        </div>
      </div>
      <div className="pt-4 border-t border-[var(--border-subtle)] flex gap-3">
        <Button type="submit" className="flex-1 bg-[var(--primary)] text-[var(--on-primary)] hover:bg-[var(--on-primary-fixed-variant)]">
          Save Settings
        </Button>
        <Button type="button" variant="outline" className="border-[var(--border-subtle)] bg-[var(--surface-container)]">
          Test Alert
        </Button>
      </div>
    </form>
  );
}
