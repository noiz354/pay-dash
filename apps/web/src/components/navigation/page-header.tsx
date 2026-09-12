// Wave1: PageHeader — title + description + breadcrumb + loading/empty/error/forbidden slots
// Usage: server page passes title/description, client can swap states via props without layout shift
import { Breadcrumb } from "./breadcrumb";
import { cn } from "@/lib/utils";

type PageHeaderProps = {
  pathname?: string;
  title: string;
  description?: string;
  actions?: React.ReactNode;
  // State slots: when set, header still renders title but page body can show state component below
  className?: string;
};

export function PageHeader({ pathname, title, description, actions, className }: PageHeaderProps) {
  return (
    <div className={cn("mb-6 flex flex-col gap-2", className)}>
      {pathname ? <Breadcrumb pathname={pathname} /> : null}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--on-surface)]">{title}</h1>
          {description ? <p className="mt-1 text-sm text-[var(--on-surface-variant)] max-w-[60ch]">{description}</p> : null}
        </div>
        {actions ? <div className="flex items-center gap-2 shrink-0">{actions}</div> : null}
      </div>
    </div>
  );
}

// Loading skeleton for PageHeader — same dims to avoid CLS (FE-016 pattern reused)
export function PageHeaderSkeleton() {
  return (
    <div className="mb-6 flex flex-col gap-2 animate-pulse" aria-hidden>
      <div className="h-4 w-32 bg-[var(--surface-container-high)] rounded" />
      <div className="h-7 w-48 bg-[var(--surface-container-high)] rounded" />
      <div className="h-4 w-64 bg-[var(--surface-container-high)] rounded" />
    </div>
  );
}
