import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// Reusable MetricCard — bg-white border rounded-xl p-5 label-caps + headline-xl data-mono (dashboard:241, bulk_payouts:244)
export function MetricCard({
  label,
  value,
  trend,
}: {
  label: string;
  value: string;
  trend?: string;
}) {
  return (
    <Card className="p-5 min-w-0 overflow-hidden">
      <CardHeader className="p-0 pb-2 min-w-0">
        <CardTitle className="label-caps text-[var(--on-surface-variant)] truncate">{label}</CardTitle>
      </CardHeader>
      <CardContent className="p-0 min-w-0">
        <div className="data-mono headline-xl break-words">{value}</div>
        {trend && <div className="body-sm mt-1 text-[var(--success-status)] break-words whitespace-normal">{trend}</div>}
      </CardContent>
    </Card>
  );
}
