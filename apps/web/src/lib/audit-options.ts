// Client-safe audit-log vocabulary (ADR-0026). Shared by the page, the
// filter bar, the CSV export and the e2e specs.
export const AUDIT_CATEGORIES = [
  { value: "PAYMENTS", label: "Payments" },
  { value: "PAYOUTS", label: "Payouts" },
  { value: "WEBHOOKS", label: "Webhooks" },
  { value: "CONFIGURATION", label: "Configuration" },
] as const;

export type AuditCategoryValue = (typeof AUDIT_CATEGORIES)[number]["value"];

export const AUDIT_STATUSES = [
  { value: "SUCCESS", label: "Success" },
  { value: "FAILED", label: "Failed" },
  { value: "WARNING", label: "Warning" },
  { value: "INFO", label: "Info" },
] as const;

export type AuditStatusValue = (typeof AUDIT_STATUSES)[number]["value"];

export const AUDIT_RANGES = [
  { value: "24h", label: "Last 24 hours" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "90d", label: "Last 90 days" },
  { value: "all", label: "All time" },
] as const;

export type AuditRangeValue = (typeof AUDIT_RANGES)[number]["value"];

export function isAuditCategory(v: string): v is AuditCategoryValue {
  return (AUDIT_CATEGORIES as readonly { value: string }[]).some((c) => c.value === v);
}

export function isAuditStatus(v: string): v is AuditStatusValue {
  return (AUDIT_STATUSES as readonly { value: string }[]).some((s) => s.value === v);
}

export function isAuditRange(v: string): v is AuditRangeValue {
  return (AUDIT_RANGES as readonly { value: string }[]).some((r) => r.value === v);
}
