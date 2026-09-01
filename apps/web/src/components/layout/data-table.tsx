import { cn } from "@/lib/utils";

// Reusable DataTable — wrapper bg-surface border rounded-lg overflow-hidden, thead label-caps sticky, td data-mono right
// Pattern: transaction_ledger:218, billing:238, audit:268

export function DataTable({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("overflow-hidden rounded-lg border border-[var(--border-subtle)] bg-white", className)} {...props} />;
}

export function DataTableHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("border-b bg-[var(--surface-container-low)] p-4", className)} {...props} />;
}

export function DataTableContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("overflow-x-auto", className)} {...props} />;
}

// Table primitives — keep label-caps sticky + data-mono right via Tailwind
export function TableHeadCell({ className, ...props }: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return <th className={cn("px-[var(--cell-x)] py-[var(--cell-y)] text-left label-caps sticky top-0 bg-[var(--surface-container-low)] whitespace-nowrap min-w-[100px]", className)} {...props} />;
}

export function TableCellMono({ className, ...props }: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn("px-[var(--cell-x)] py-[var(--cell-y)] data-mono whitespace-nowrap", className)} {...props} />;
}
