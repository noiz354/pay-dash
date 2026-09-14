// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest";

import { getSystemWebhookSummary, listWebhooks, recordInbound } from "./webhooks";

/**
 * Audit findings R-07 / F-03 — provenance on the fabricated webhook rows.
 *
 * `seed()` invents seven deliveries, `whk_seed_1` … `whk_seed_7`, including
 * terminal DUPLICATED and REJECTED statuses for events that never arrived. They
 * rendered indistinguishably from genuine traffic on two operational pages. Each
 * seeded row now carries `seeded: true`, and the summary reports how many of the
 * figures `/system` displays were invented rather than observed.
 */

const SEED_IDS = ["whk_seed_1", "whk_seed_2", "whk_seed_3", "whk_seed_4", "whk_seed_5", "whk_seed_6", "whk_seed_7"];

function resetStore() {
  (globalThis as unknown as { __kineticWebhooksStore?: unknown }).__kineticWebhooksStore = undefined;
}

beforeEach(resetStore);

describe("seeded webhook rows carry provenance", () => {
  it("flags all seven seeds", () => {
    const { rows } = listWebhooks({ page: 1, pageSize: 50 });
    const seeded = rows.filter((r) => r.seeded === true);

    expect(seeded.map((r) => r.id).sort()).toEqual([...SEED_IDS].sort());
    expect(seeded).toHaveLength(7);
  });

  it("includes the terminal statuses that describe events which never happened", () => {
    const { rows } = listWebhooks({ page: 1, pageSize: 50 });
    const seeded = rows.filter((r) => r.seeded === true);
    const statuses = new Set(seeded.map((r) => r.status));

    // These are the ones R-07 calls out: a reader counts them as provider
    // failures or retries when no callback was ever received.
    expect(statuses.has("DUPLICATED")).toBe(true);
    expect(statuses.has("REJECTED")).toBe(true);
  });

  it("does not flag a callback the endpoint actually recorded", () => {
    const { event } = recordInbound({
      eventId: "evt_real_observed",
      type: "payment.succeeded",
      payload: { id: "evt_real_observed" },
      source: "xendit",
    });

    expect(event.seeded).toBeUndefined();

    const summary = getSystemWebhookSummary();
    // The real row joins the totals without joining the seeded count, which is
    // what makes the ratio on /system meaningful rather than decorative.
    expect(summary.last24h.total).toBe(summary.seeded.inLast24h + 1);
  });
});

describe("the system summary reports how much of it is invented", () => {
  it("counts the seeds in total and inside the 24h window", () => {
    const summary = getSystemWebhookSummary();

    expect(summary.seeded.total).toBe(7);

    // Independent recount: the seeds use now-relative offsets, so window
    // membership is deterministic, and the 24h figures /system renders as
    // "real counts" are mostly seed data.
    const { rows } = listWebhooks({ page: 1, pageSize: 50 });
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    const expected = rows.filter(
      (r) => r.seeded === true && new Date(r.receivedAt).getTime() >= cutoff,
    ).length;

    expect(summary.seeded.inLast24h).toBe(expected);
    expect(summary.seeded.inLast24h).toBeLessThanOrEqual(summary.seeded.total);
    expect(summary.seeded.inLast24h).toBeLessThanOrEqual(summary.last24h.total);
  });

  it("marks the seeded rows it returns in `recent`", () => {
    const summary = getSystemWebhookSummary();

    // /system renders `recent` as a list, so the badge has to be derivable from
    // the rows it is given rather than from a page-level count alone.
    expect(summary.recent.some((e) => e.seeded === true)).toBe(true);
  });
});
