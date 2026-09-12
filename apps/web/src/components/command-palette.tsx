"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { NAV_SECTIONS, PINNED_NAV, type NavItem, type NavSection } from "@/components/navigation/nav-config";
import { filterNavByRoles, getVisiblePinned } from "@/components/navigation/permission-adapter";
import type { OrganizationRole } from "@/domain/organization/roles";
import { trackEvent } from "@/lib/analytics-events";
import { cn } from "@/lib/utils";

// FE-011 / CMP-018 / ANA-010 — Command Palette (SCR-039).
//
// Two things the first attempt got wrong, fixed here:
//
// 1. **Single source of truth.** The palette no longer carries its own copy of
//    the route table (which had drifted: it gated Balance on a `balance.write`
//    permission that does not exist in the RBAC catalog). It projects
//    `NAV_SECTIONS` through the same `permission-adapter` the Sidebar uses, so
//    the palette can never offer a route the navigation hides, and tightening
//    the matrix retargets both at once.
//
// 2. **Safe-only by construction.** Every item is a navigation target resolved
//    from the nav config. There is no mutation registry to leak from, so the
//    "no destructive actions in the palette" rule is structural rather than a
//    filter someone has to remember to apply.
//
// Analytics: `palette_opened` / `palette_invoked` / `nav_used`. We emit
// `query_length`, never the query — an operator may type a customer email into
// this box, and ANA-* is contracted to carry no PII.

const RECENT_KEY = "paydash.palette.recent.v1";
const RECENT_LIMIT = 5;

export type PaletteEntry = {
  /** Stable id — the href, which is unique across the nav config. */
  id: string;
  href: string;
  label: string;
  icon: string;
  /** Grouping heading ("Money In", "Governance", …). */
  category: string;
  /** Keywords that should also match, beyond the label. */
  keywords: string[];
};

// ---------------------------------------------------------------------------
// Fuzzy matching — exported for unit tests.
// ---------------------------------------------------------------------------

/**
 * Score `text` against `query`. Higher is better; `null` means no match.
 *
 * Deterministic and dependency-free so ordering is stable across renders and
 * testable without a DOM:
 *   exact          1000
 *   prefix          900 - length penalty
 *   word prefix     800 - position penalty
 *   substring       700 - position penalty
 *   subsequence     500 - spread penalty (compact matches win)
 */
export function fuzzyScore(query: string, text: string): number | null {
  const q = query.trim().toLowerCase();
  if (!q) return 1000;
  const t = text.toLowerCase();
  if (!t) return null;

  if (t === q) return 1000;
  if (t.startsWith(q)) return 900 - Math.min(100, t.length - q.length);

  const wordIndex = t.search(new RegExp(`\\b${escapeRegExp(q)}`));
  // >= 0: position 0 is a word start too — without it the first word of a
  // multi-word label fell through to the subsequence tier.
  if (wordIndex >= 0) return 800 - Math.min(200, wordIndex);

  const subIndex = t.indexOf(q);
  if (subIndex > 0) return 700 - Math.min(200, subIndex);

  // Subsequence: every query character must appear in order.
  let ti = 0;
  let spread = 0;
  let lastMatch = -1;
  for (const ch of q) {
    const found = t.indexOf(ch, ti);
    if (found === -1) return null;
    if (lastMatch >= 0) spread += found - lastMatch - 1;
    lastMatch = found;
    ti = found + 1;
  }
  return 500 - Math.min(300, spread);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Best score across an entry's label, category and keywords. */
export function scoreEntry(query: string, entry: PaletteEntry): number | null {
  const candidates = [entry.label, entry.category, ...entry.keywords];
  let best: number | null = null;
  for (const candidate of candidates) {
    const score = fuzzyScore(query, candidate);
    if (score === null) continue;
    if (best === null || score > best) best = score;
  }
  return best;
}

// ---------------------------------------------------------------------------
// Nav projection
// ---------------------------------------------------------------------------

/** Extra match terms so "money out" finds Payouts and "rbac" finds Team. */
const KEYWORDS: Record<string, string[]> = {
  "/dashboard": ["home", "command center", "overview", "exceptions"],
  "/transactions": ["ledger", "payments", "money in", "refunds"],
  "/balance": ["wallet", "settlement", "reserve", "available"],
  "/payments/links": ["link", "checkout", "qr", "money in"],
  "/subscriptions": ["recurring", "mrr", "plans"],
  "/billing": ["invoices", "bill pay", "statements"],
  "/customers": ["people", "accounts", "kyb"],
  "/payouts": ["payout", "disbursement", "money out", "batch"],
  "/payouts/bulk": ["csv", "upload", "bulk", "money out"],
  "/payouts/settings": ["schedule", "cadence", "bank account"],
  "/team": ["members", "invites", "roles", "rbac"],
  "/audit": ["log", "history", "compliance", "export"],
  "/reports/builder": ["reports", "analytics", "export"],
  "/support": ["help", "ticket", "contact"],
  "/system": ["status", "health", "webhooks"],
  "/onboarding": ["setup", "checklist", "getting started"],
  "/fraud": ["fraud", "disputes", "risk"],
  "/fraud/blocklist": ["blocklist", "block", "deny", "fraud"],
  "/risk": ["velocity", "limits", "alerts", "risk"],
  "/kyc": ["kyc", "verification", "compliance", "documents"],
  "/settings/developer": ["developer", "api", "integration"],
  "/settings/api-keys": ["api keys", "secrets", "rotate", "developer"],
  "/webhooks": ["webhooks", "callbacks", "events", "developer"],
  "/settings/mcp": ["mcp", "model context protocol", "ai"],
  "/payments/platform": ["platform", "split", "routing"],
  "/settings": ["settings", "preferences", "merchant"],
  "/ai-journal": ["ai", "journal", "copilot"],
};

function toEntry(item: NavItem, category: string): PaletteEntry {
  return {
    id: item.href,
    href: item.href,
    label: item.label,
    icon: item.icon,
    category,
    keywords: KEYWORDS[item.href] ?? [],
  };
}

/**
 * Project the canonical nav into palette entries.
 *
 * `roles === undefined` means "no session resolved" (dev/demo fallback) and
 * mirrors the Sidebar exactly: show everything. An empty array means a real
 * session with no granted roles, which correctly shows only ungated routes.
 */
export function buildPaletteEntries(roles?: OrganizationRole[]): PaletteEntry[] {
  const sections: NavSection[] = roles ? filterNavByRoles(NAV_SECTIONS, roles) : NAV_SECTIONS;
  const pinned: NavItem[] = roles ? getVisiblePinned(roles) : PINNED_NAV;

  const entries: PaletteEntry[] = [];
  const seen = new Set<string>();
  for (const section of sections) {
    for (const item of section.items) {
      if (seen.has(item.href)) continue;
      seen.add(item.href);
      entries.push(toEntry(item, section.label));
    }
  }
  for (const item of pinned) {
    if (seen.has(item.href)) continue;
    seen.add(item.href);
    entries.push(toEntry(item, "Workspace"));
  }
  return entries;
}

/** Rank entries for a query, preserving nav order on ties. */
export function rankEntries(query: string, entries: readonly PaletteEntry[]): PaletteEntry[] {
  const trimmed = query.trim();
  if (!trimmed) return [...entries];
  const scored = entries
    .map((entry, index) => ({ entry, index, score: scoreEntry(trimmed, entry) }))
    .filter((r): r is { entry: PaletteEntry; index: number; score: number } => r.score !== null);
  return scored.sort((a, b) => b.score - a.score || a.index - b.index).map((r) => r.entry);
}

// ---------------------------------------------------------------------------
// Recents
// ---------------------------------------------------------------------------

export function readRecents(storage?: Pick<Storage, "getItem">): string[] {
  const store = storage ?? (typeof window !== "undefined" ? window.localStorage : undefined);
  if (!store) return [];
  try {
    const raw = store.getItem(RECENT_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((v): v is string => typeof v === "string").slice(0, RECENT_LIMIT);
  } catch {
    return [];
  }
}

export function pushRecent(href: string, previous: readonly string[], storage?: Pick<Storage, "setItem">): string[] {
  const next = [href, ...previous.filter((h) => h !== href)].slice(0, RECENT_LIMIT);
  try {
    (storage ?? (typeof window !== "undefined" ? window.localStorage : undefined))?.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    // Private mode / quota — recents are a convenience, never a failure path.
  }
  return next;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export type CommandPaletteProps = {
  roles?: OrganizationRole[];
  /** Open state is controllable so tests and the top bar can drive it. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};

export function CommandPalette({ roles, open: controlledOpen, onOpenChange }: CommandPaletteProps) {
  const router = useRouter();
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(false);
  const open = controlledOpen ?? uncontrolledOpen;

  const [query, setQuery] = React.useState("");
  const [recents, setRecents] = React.useState<string[]>([]);

  // Entries are a pure projection of the nav config — memoised so typing in the
  // box does not rebuild the table on every keystroke (INP budget, spec §25).
  const entries = React.useMemo(() => buildPaletteEntries(roles), [roles]);

  React.useEffect(() => {
    setRecents(readRecents());
  }, []);

  const setOpen = React.useCallback(
    (next: boolean) => {
      if (controlledOpen === undefined) setUncontrolledOpen(next);
      onOpenChange?.(next);
      if (next) {
        setQuery("");
        trackEvent("palette_opened", { role: roles?.[0] ?? null, surface: "global" });
      }
    },
    [controlledOpen, onOpenChange, roles],
  );

  // ⌘K / Ctrl+K. Ignored while a modal dialog is already open so the palette
  // cannot stack on top of a confirmation and steal its focus trap.
  React.useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (!(event.metaKey || event.ctrlKey)) return;
      if (event.key.toLowerCase() !== "k") return;
      event.preventDefault();
      setOpen(!open);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, setOpen]);

  const ranked = React.useMemo(() => rankEntries(query, entries), [query, entries]);
  const grouped = React.useMemo(() => {
    const map = new Map<string, PaletteEntry[]>();
    for (const entry of ranked) {
      const list = map.get(entry.category);
      if (list) list.push(entry);
      else map.set(entry.category, [entry]);
    }
    return [...map.entries()];
  }, [ranked]);

  const recentEntries = React.useMemo(
    () => recents.map((href) => entries.find((e) => e.href === href)).filter((e): e is PaletteEntry => Boolean(e)),
    [recents, entries],
  );

  const go = React.useCallback(
    (entry: PaletteEntry) => {
      setRecents((prev) => pushRecent(entry.href, prev));
      // ANA-010: query_length, never the query itself (no PII on the wire).
      trackEvent("palette_invoked", {
        query_length: query.trim().length,
        result_count: ranked.length,
        category: entry.category,
        role: roles?.[0] ?? null,
      });
      trackEvent("nav_used", { section: entry.category, role: roles?.[0] ?? null, surface: "palette", href: entry.href });
      setOpen(false);
      router.push(entry.href);
    },
    [query, ranked.length, roles, router, setOpen],
  );

  return (
    <CommandDialog
      open={open}
      onOpenChange={setOpen}
      title="Command palette"
      description="Search pages and jump straight to a filtered queue."
      className="sm:max-w-xl"
    >
      <Command shouldFilter={false} className="bg-transparent">
        <CommandInput
          value={query}
          onValueChange={setQuery}
          placeholder="Search pages… (try “payouts”, “audit”, “blocklist”)"
          aria-label="Search pages"
          data-testid="palette-input"
        />
        <CommandList className="max-h-[min(60vh,26rem)]">
          <CommandEmpty>No pages match that search.</CommandEmpty>

          {query.trim() === "" && recentEntries.length > 0 && (
            <>
              <CommandGroup heading="Recent">
                {recentEntries.map((entry) => (
                  <CommandItem key={`recent-${entry.id}`} value={entry.id} onSelect={() => go(entry)} data-testid={`palette-item-${entry.href}`}>
                    <span className="material-symbols-outlined text-[18px] text-[var(--on-surface-variant)]" aria-hidden="true">
                      history
                    </span>
                    <span className="flex-1 truncate">{entry.label}</span>
                    <span className="text-[11px] text-[var(--on-surface-variant)]">{entry.category}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
              <CommandSeparator />
            </>
          )}

          {grouped.map(([category, items]) => (
            <CommandGroup key={category} heading={category}>
              {items.map((entry) => (
                <CommandItem
                  key={entry.id}
                  value={entry.id}
                  onSelect={() => go(entry)}
                  data-testid={`palette-item-${entry.href}`}
                  className={cn("gap-3")}
                >
                  <span className="material-symbols-outlined text-[18px] text-[var(--on-surface-variant)]" aria-hidden="true">
                    {entry.icon}
                  </span>
                  <span className="flex-1 truncate">{entry.label}</span>
                  <span className="text-[11px] text-[var(--on-surface-variant)]">{entry.href}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          ))}
        </CommandList>
      </Command>
    </CommandDialog>
  );
}

export default CommandPalette;
