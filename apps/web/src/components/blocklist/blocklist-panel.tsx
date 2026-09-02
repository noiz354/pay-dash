"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { usePathname, useRouter } from "@/i18n/navigation";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TablePagination } from "@/components/transactions/table-pagination";
import { EmptyState } from "@/components/common/empty-state";
import { formatDateLong } from "@/lib/format";
import {
  BLOCKLIST_REASON_LABELS,
  type BlocklistType,
} from "@/lib/blocklist-options";
import type { BlocklistEntry } from "@/server/data/blocklist";
import { removeBlocklistAction, type ActionState } from "@/server/actions/blocklist";

type DirectAction = (
  _prev: ActionState | undefined,
  formData: FormData,
) => Promise<ActionState>;

export type BlocklistSection = {
  rows: BlocklistEntry[];
  total: number;
  page: number;
  pageCount: number;
  pageSize: number;
};

const TYPE_ICON: Record<BlocklistType, string> = {
  IP: "router",
  CARD: "credit_card",
  EMAIL: "alternate_email",
};

const TAB_LABEL: Record<BlocklistType, string> = {
  IP: "IP Addresses",
  CARD: "Card Numbers",
  EMAIL: "Email Domains",
};

// The blocklist panel (ADR-0024) — shared by /fraud and /fraud/blocklist so
// both pages run on one store. All three sections are pre-rendered (no tab
// flash), tabs and search are URL state (so the Export button mirrors them),
// and remove is a real action.
export function BlocklistPanel({
  sections,
  activeType,
  queryActive,
}: {
  sections: Record<BlocklistType, BlocklistSection>;
  activeType: BlocklistType;
  queryActive: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [busyId, setBusyId] = React.useState<string | null>(null);

  const type = ((): BlocklistType => {
    const t = searchParams.get("type")?.toLowerCase();
    return t === "card" ? "CARD" : t === "email" ? "EMAIL" : "IP";
  })();

  const push = React.useCallback(
    (mutate: (params: URLSearchParams) => void) => {
      const params = new URLSearchParams(searchParams.toString());
      mutate(params);
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams]
  );

  const urlQuery = searchParams.get("q") ?? "";
  const [query, setQuery] = React.useState(urlQuery);
  React.useEffect(() => {
    setQuery((prev) => (prev === urlQuery ? prev : urlQuery));
  }, [urlQuery]);
  React.useEffect(() => {
    if (query === urlQuery) return;
    const t = setTimeout(() => push((p) => (query ? p.set("q", query) : p.delete("q"))), 350);
    return () => clearTimeout(t);
  }, [query, urlQuery, push]);

  const remove = (id: string) => {
    if (busyId) return;
    setBusyId(id);
    const fd = new FormData();
    fd.set("id", id);
    removeBlocklistAction(undefined, fd)
      .then((res) => {
        if (res.status === "success") toast.success(res.message);
        else toast.error(res.message);
        router.refresh();
      })
      .finally(() => setBusyId(null));
  };

  const active = sections[activeType];

  return (
    <div className="overflow-hidden rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-container-lowest)]">
      <Tabs value={activeType.toLowerCase()} onValueChange={(v) => push((p) => p.set("type", String(v)))}>
        <div className="flex flex-col gap-4 border-b border-[var(--border-subtle)] px-4 pt-3 md:flex-row md:items-center md:justify-between">
          <TabsList variant="line">
            {(Object.keys(TAB_LABEL) as BlocklistType[]).map((t) => (
              <TabsTrigger key={t} value={t.toLowerCase()}>
                <span className="material-symbols-outlined text-[16px]" aria-hidden="true">
                  {TYPE_ICON[t]}
                </span>
                {TAB_LABEL[t]} ({sections[t].total})
              </TabsTrigger>
            ))}
          </TabsList>
          <div className="relative w-full pb-3 md:w-64">
            <span
              className="material-symbols-outlined pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[18px] text-[var(--on-surface-variant)]"
              aria-hidden="true"
            >
              search
            </span>
            <Input
              placeholder={`Search ${TAB_LABEL[activeType].toLowerCase()}…`}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-9"
              aria-label={`Search ${TAB_LABEL[activeType].toLowerCase()}`}
            />
          </div>
        </div>

        {(Object.keys(TAB_LABEL) as BlocklistType[]).map((t) => {
          const section = sections[t];
          return (
            <TabsContent key={t} value={t.toLowerCase()} className="mt-0">
              {section.rows.length === 0 ? (
                <div className="p-10">
                  <EmptyState
                    icon="gavel"
                    title={queryActive ? `No ${TAB_LABEL[t].toLowerCase()} match the search` : `No ${TAB_LABEL[t].toLowerCase()} blocklisted`}
                    description={
                      queryActive
                        ? "Widen or clear the search."
                        : "Add an entry to start blocking."
                    }
                  />
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader className="label-caps sticky top-0 bg-[var(--surface-container-low)]">
                      <TableRow>
                        <TableHead>Value</TableHead>
                        <TableHead>Reason</TableHead>
                        <TableHead className="text-right">Added On</TableHead>
                        <TableHead className="w-[100px] text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {section.rows.map((e) => (
                        <TableRow key={e.id} className="group h-12">
                          <TableCell className="data-mono">
                            <span className="inline-flex items-center gap-2">
                              <span
                                className="material-symbols-outlined text-[16px] text-[var(--on-surface-variant)]"
                                aria-hidden="true"
                              >
                                {TYPE_ICON[e.type]}
                              </span>
                              {e.value}
                            </span>
                          </TableCell>
                          <TableCell>
                            <span className="inline-flex items-center rounded-full bg-[var(--surface-container)] px-2 py-0.5 text-xs font-medium">
                              {BLOCKLIST_REASON_LABELS[e.reason]}
                            </span>
                          </TableCell>
                          <TableCell className="data-mono text-right text-[var(--on-surface-variant)]">
                            {formatDateLong(e.addedAt)}
                          </TableCell>
                          <TableCell className="text-right">
                            <DropdownMenu>
                              <DropdownMenuTrigger
                                className="inline-flex rounded p-1 text-[var(--on-surface-variant)] transition-opacity opacity-100 md:opacity-0 hover:bg-[var(--surface-container-high)] hover:text-[var(--on-surface)] group-hover:opacity-100 focus:opacity-100 disabled:opacity-40"
                                aria-label={`Actions for ${e.value}`}
                                disabled={busyId !== null}
                              >
                                <span className="material-symbols-outlined text-[18px]" aria-hidden="true">
                                  {busyId === e.id ? "progress_activity" : "more_vert"}
                                </span>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-44">
                                <DropdownMenuItem
                                  className="text-[var(--failed-status)]"
                                  onClick={() => remove(e.id)}
                                >
                                  Remove from blocklist
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </TabsContent>
          );
        })}
      </Tabs>

      <div className="flex items-center justify-between border-t border-[var(--border-subtle)] p-2">
        <TablePagination
          page={active.page}
          pageCount={active.pageCount}
          total={active.total}
          pageSize={active.pageSize}
        />
      </div>
    </div>
  );
}
