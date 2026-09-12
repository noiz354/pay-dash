"use client";

import * as React from "react";

import { cn } from "@/lib/utils";
import { usePolling } from "@/hooks/use-polling";
import { trackEvent } from "@/lib/analytics-events";
import { Button } from "@/components/ui/button";
import { StaleBanner } from "@/components/data-table/stale-banner";
import {
  COMMAND_CENTER_LANES,
  EXCEPTION_LANES,
  LANE_META,
  emptyCommandCenter,
  isCommandCenterDto,
  type CommandCenterDto,
  type CommandCenterItem,
  type CommandCenterLane,
} from "@/lib/command-center";
import { CommandCenterCard, CommandCenterCardSkeleton } from "./command-center-card";

// Wave 4 §2 — Command Center.
//
// The dashboard as an operational surface: exception lanes an actor can walk
// into and finish. Four states are mandatory per lane and for the section as a
// whole — loading, empty, error and populated — and freshness is explicit
// (20s poll, stale after 60s, manual refresh) per spec §7.
//
// Data arrives from the server render and is then re-read from
// `/api/dashboard/command-center`, which re-checks the session on every poll.
// The client never widens its own permissions: `canAct` is computed server-side
// and only ever re-computed by the server.

const POLL_INTERVAL_MS = 20_000;
const STALE_AFTER_SECONDS = 60;
const ENDPOINT = "/api/dashboard/command-center";

export type CommandCenterProps = {
  /** Server-rendered snapshot. */
  initialData: CommandCenterDto;
  /** Focus a single lane (`/dashboard?lane=critical`). */
  focusLane?: CommandCenterLane | null;
  className?: string;
};

export function CommandCenter({ initialData, focusLane = null, className }: CommandCenterProps) {
  const [data, setData] = React.useState<CommandCenterDto>(initialData);
  // Distinguish the very first paint (server data present) from a client-side
  // fetch that has nothing to show yet.
  const [hasLoadedOnce, setHasLoadedOnce] = React.useState(true);
  const [loadError, setLoadError] = React.useState<string | null>(null);

  const fetchData = React.useCallback(async () => {
    const response = await fetch(ENDPOINT, { headers: { Accept: "application/json" }, cache: "no-store" });
    if (!response.ok) {
      throw new Error(response.status === 401 ? "Session expired" : response.status === 403 ? "Not authorized" : `Request failed (${response.status})`);
    }
    const payload: unknown = await response.json();
    if (!isCommandCenterDto(payload)) throw new Error("Malformed response");
    setData(payload);
    setLoadError(null);
    setHasLoadedOnce(true);
  }, []);

  const { ageSeconds, isStale, isPolling, error, refresh } = usePolling({
    interval: POLL_INTERVAL_MS,
    staleThreshold: STALE_AFTER_SECONDS,
    immediate: false,
    onRefresh: fetchData,
  });

  // A poll failure is a first-class state, not a silent no-op.
  React.useEffect(() => {
    if (error) setLoadError(error);
  }, [error]);

  // ANA `stale_seen` — emitted once per stale episode, not once per tick.
  const staleAnnounced = React.useRef(false);
  React.useEffect(() => {
    if (isStale && !staleAnnounced.current) {
      staleAnnounced.current = true;
      trackEvent("stale_seen", { age_sec: ageSeconds ?? 0, scr: "SCR-004", surface: "command_center" });
    }
    if (!isStale) staleAnnounced.current = false;
  }, [isStale, ageSeconds]);

  const onAct = React.useCallback((item: CommandCenterItem) => {
    trackEvent("command_center_action", {
      lane: item.lane,
      card: item.id,
      count: item.count,
      scr: "SCR-004",
      role: null,
    });
    if (!item.canAct && item.permission) {
      // The viewer is walking into a queue they cannot close. That is a real
      // authorization signal worth recording (ANA `permission_denied`).
      trackEvent("permission_denied", {
        permission: item.permission,
        surface: "command_center",
        scr: "SCR-004",
        entity_type: item.id,
        role: null,
      });
    }
  }, []);

  const visibleLanes = React.useMemo<CommandCenterLane[]>(
    () => (focusLane ? [focusLane] : [...COMMAND_CENTER_LANES]),
    [focusLane],
  );

  const exceptions = data.totals.exceptions;

  return (
    <section
      className={cn("space-y-4", className)}
      aria-labelledby="command-center-heading"
      data-testid="command-center"
    >
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="command-center-heading" className="headline-md text-[var(--on-surface)]">
            Command Center
          </h2>
          <p className="body-sm mt-0.5 text-[var(--on-surface-variant)]">
            {exceptions === 0
              ? "Nothing needs you right now."
              : `${exceptions} ${exceptions === 1 ? "item needs" : "items need"} action across ${countActiveLanes(data)} ${countActiveLanes(data) === 1 ? "lane" : "lanes"}.`}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Freshness — always visible so "how old is this?" is never a guess. */}
          <span
            className="inline-flex items-center gap-1.5 body-xs text-[var(--on-surface-variant)]"
            data-testid="cc-freshness"
            aria-live="off"
          >
            <span
              className={cn("material-symbols-outlined text-[14px]", isPolling && "motion-safe:animate-spin")}
              aria-hidden="true"
            >
              {isPolling ? "progress_activity" : "schedule"}
            </span>
            {ageSeconds === null ? "Checking…" : `Updated ${ageSeconds}s ago`}
          </span>
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1.5"
            onClick={() => {
              if (ageSeconds !== null) trackEvent("stale_refreshed", { age_sec: ageSeconds, scr: "SCR-004" });
              void refresh();
            }}
            disabled={isPolling}
            data-testid="cc-refresh"
          >
            <span className="material-symbols-outlined text-[16px]" aria-hidden="true">
              refresh
            </span>
            Refresh
          </Button>
        </div>
      </header>

      {/* Counts change without a navigation, so announce them politely. */}
      <p className="sr-only" role="status" aria-live="polite">
        {exceptions === 0 ? "No open exceptions." : `${exceptions} open exceptions.`}
      </p>

      {isStale ? (
        <StaleBanner
          ageSeconds={ageSeconds ?? 0}
          onRefresh={() => {
            trackEvent("stale_refreshed", { age_sec: ageSeconds ?? 0, scr: "SCR-004" });
            void refresh();
          }}
        />
      ) : null}

      {loadError ? (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-card)] border border-[var(--failed-status)]/40 bg-[var(--failed-status)]/8 p-4"
          data-testid="cc-error"
        >
          <div className="flex items-start gap-2.5">
            <span className="material-symbols-outlined text-[20px] text-[var(--failed-text)]" aria-hidden="true">
              cloud_off
            </span>
            <div>
              <p className="body-md font-semibold text-[var(--failed-text)]">Could not refresh the Command Center</p>
              <p className="body-sm text-[var(--on-surface-variant)]">
                {loadError}. Showing the last successful snapshot
                {ageSeconds !== null ? ` from ${ageSeconds}s ago` : ""}.
              </p>
            </div>
          </div>
          <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={() => void refresh()}>
            <span className="material-symbols-outlined text-[16px]" aria-hidden="true">
              refresh
            </span>
            Try again
          </Button>
        </div>
      ) : null}

      {!hasLoadedOnce ? (
        <LaneGrid lanes={visibleLanes} skeleton />
      ) : data.allClear && exceptions === 0 ? (
        <CelebrateAllClear onRefresh={() => void refresh()} />
      ) : (
        <LaneGrid lanes={visibleLanes} data={data} onAct={onAct} />
      )}

      {/* The completed lane is shown even in the all-clear state — it is the
          evidence that the queue drains rather than a hidden success. */}
      {data.allClear && data.lanes.recently_completed.length > 0 && !focusLane ? (
        <LaneSection lane="recently_completed" items={data.lanes.recently_completed} onAct={onAct} />
      ) : null}
    </section>
  );
}

function countActiveLanes(data: CommandCenterDto): number {
  return EXCEPTION_LANES.filter((lane) => data.totals[lane] > 0).length;
}

function LaneGrid({
  lanes,
  data,
  onAct,
  skeleton = false,
}: {
  lanes: CommandCenterLane[];
  data?: CommandCenterDto;
  onAct?: (item: CommandCenterItem) => void;
  skeleton?: boolean;
}) {
  return (
    <div className="space-y-5">
      {lanes.map((lane) => {
        if (skeleton) return <LaneSection key={lane} lane={lane} skeleton />;
        const items = data?.lanes[lane] ?? [];
        if (items.length === 0) return null;
        return <LaneSection key={lane} lane={lane} items={items} onAct={onAct} />;
      })}
    </div>
  );
}

function LaneSection({
  lane,
  items = [],
  onAct,
  skeleton = false,
}: {
  lane: CommandCenterLane;
  items?: CommandCenterItem[];
  onAct?: (item: CommandCenterItem) => void;
  skeleton?: boolean;
}) {
  const meta = LANE_META[lane];
  const total = items.reduce((sum, i) => sum + i.count, 0);

  return (
    <div data-testid={`cc-lane-${lane}`} aria-labelledby={`cc-lane-${lane}-heading`}>
      <div className="mb-2 flex items-center gap-2">
        <span
          className={cn("material-symbols-outlined text-[18px]", laneToneClass(meta.tone))}
          aria-hidden="true"
        >
          {meta.icon}
        </span>
        <h3 id={`cc-lane-${lane}-heading`} className="body-md font-semibold text-[var(--on-surface)]">
          {meta.label}
        </h3>
        {skeleton ? (
          <span className="h-4 w-6 animate-pulse rounded-full bg-[var(--surface-container-high)]" aria-hidden="true" />
        ) : (
          <span className={cn("data-mono rounded-full px-2 py-0.5 text-[11px] font-bold", laneCountClass(meta.tone))}>
            {total}
          </span>
        )}
        <span className="body-xs ml-auto hidden text-[var(--on-surface-variant)] sm:inline">{meta.blurb}</span>
      </div>

      {skeleton ? (
        <ul className="grid list-none grid-cols-1 gap-3 p-0 md:grid-cols-2 xl:grid-cols-3">
          <CommandCenterCardSkeleton />
          <CommandCenterCardSkeleton />
        </ul>
      ) : (
        <ul className="grid list-none grid-cols-1 gap-3 p-0 md:grid-cols-2 xl:grid-cols-3">
          {items.map((item) => (
            <CommandCenterCard key={item.id} item={item} onAct={onAct} />
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Empty state (spec §7): when there are no exceptions we celebrate rather than
 * showing a grid of zeros — zeros invite the reader to wonder whether the data
 * failed to load.
 */
export function CelebrateAllClear({ onRefresh }: { onRefresh?: () => void }) {
  return (
    <div
      className="flex flex-col items-center gap-3 rounded-[var(--radius-card)] border border-[var(--success-border)] bg-[var(--success-bg)] p-8 text-center"
      data-testid="cc-all-clear"
    >
      <span className="material-symbols-outlined text-[40px] text-[var(--success-text)]" aria-hidden="true">
        verified
      </span>
      <div>
        <p className="headline-md text-[var(--success-text)]">All clear</p>
        <p className="body-sm mt-1 max-w-md text-[var(--on-surface-variant)]">
          No payouts, refunds, failures or SLA breaches need you right now. Anything that lands will appear here within
          20 seconds.
        </p>
      </div>
      {onRefresh ? (
        <Button variant="outline" size="sm" className="mt-1 h-8 gap-1.5" onClick={onRefresh}>
          <span className="material-symbols-outlined text-[16px]" aria-hidden="true">
            refresh
          </span>
          Check again
        </Button>
      ) : null}
    </div>
  );
}

function laneToneClass(tone: CommandCenterItem["tone"]): string {
  switch (tone) {
    case "critical":
      return "text-[var(--critical-text)]";
    case "warning":
      return "text-[var(--overdue-text)]";
    case "pending":
      return "text-[var(--pending-text)]";
    case "success":
      return "text-[var(--success-text)]";
    default:
      return "text-[var(--on-surface-variant)]";
  }
}

function laneCountClass(tone: CommandCenterItem["tone"]): string {
  switch (tone) {
    case "critical":
      return "bg-[var(--critical-text)]/12 text-[var(--critical-text)]";
    case "warning":
      return "bg-[var(--overdue-text)]/12 text-[var(--overdue-text)]";
    case "pending":
      return "bg-[var(--pending-text)]/12 text-[var(--pending-text)]";
    case "success":
      return "bg-[var(--success-text)]/12 text-[var(--success-text)]";
    default:
      return "bg-[var(--surface-container-high)] text-[var(--on-surface)]";
  }
}

/** Fallback used by the dashboard's Suspense boundary — same metrics, no shift. */
export function CommandCenterSkeleton() {
  return (
    <section className="space-y-4" aria-busy="true" aria-label="Loading command center">
      <div className="flex items-end justify-between gap-3">
        <div className="space-y-2">
          <div className="h-5 w-44 animate-pulse rounded bg-[var(--surface-container-high)]" />
          <div className="h-3.5 w-64 animate-pulse rounded bg-[var(--surface-container-low)]" />
        </div>
        <div className="h-8 w-24 animate-pulse rounded bg-[var(--surface-container-low)]" />
      </div>
      <LaneGrid lanes={["critical", "needs_attention", "pending_approval"]} skeleton />
    </section>
  );
}

export { emptyCommandCenter };
