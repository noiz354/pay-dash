import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { reportSlaBreaches, type SlaBreachSubject } from "./sla-telemetry";

// track() flushes on an idle callback / macrotask, so tests drain the queue
// before asserting on the emissions.
async function flushAsync(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

type Call = { event: string; props: Record<string, unknown> };
function trackCalls(spy: ReturnType<typeof vi.spyOn>): Call[] {
  return (spy.mock.calls as unknown as Array<[string, string, Record<string, unknown>]>)
    .map(([, event, props]) => ({ event, props }))
    .filter((c) => c.event === "sla_breached");
}

describe("reportSlaBreaches — sla_breached exactly once per item per band", () => {
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  });
  afterEach(() => {
    logSpy.mockRestore();
  });

  const subject = (id: string, band: string, entityType = "transaction_settlement"): SlaBreachSubject => ({
    id,
    band,
    entityType,
    ageSeconds: 7200,
    dueSeconds: 14400,
  });

  it("emits for OVERDUE and CRITICAL subjects only", async () => {
    const seen = new Set<string>();
    const emitted = reportSlaBreaches(
      [subject("a", "NORMAL"), subject("b", "APPROACHING"), subject("c", "OVERDUE"), subject("d", "CRITICAL")],
      { seen, scr: "SCR-005" },
    );
    expect(emitted).toBe(2);
    await flushAsync();
    expect(trackCalls(logSpy)).toHaveLength(2);
  });

  it("does not re-emit the same item+band on the next render", async () => {
    const seen = new Set<string>();
    reportSlaBreaches([subject("a", "OVERDUE")], { seen });
    await flushAsync();
    expect(reportSlaBreaches([subject("a", "OVERDUE")], { seen })).toBe(0);
    await flushAsync();
    expect(trackCalls(logSpy)).toHaveLength(1);
  });

  it("an escalation OVERDUE → CRITICAL is a new signal, a re-render is not", async () => {
    const seen = new Set<string>();
    expect(reportSlaBreaches([subject("a", "OVERDUE")], { seen })).toBe(1);
    expect(reportSlaBreaches([subject("a", "CRITICAL")], { seen })).toBe(1);
    expect(reportSlaBreaches([subject("a", "CRITICAL")], { seen })).toBe(0);
    await flushAsync();
    expect(trackCalls(logSpy)).toHaveLength(2);
  });

  it("different entities breach independently", async () => {
    const seen = new Set<string>();
    expect(reportSlaBreaches([subject("a", "OVERDUE"), subject("b", "OVERDUE")], { seen })).toBe(2);
    await flushAsync();
    expect(trackCalls(logSpy)).toHaveLength(2);
  });

  it("carries the catalog props and never invents a clock", async () => {
    const seen = new Set<string>();
    reportSlaBreaches([subject("txn_1", "OVERDUE", "failed_payment")], { seen, scr: "SCR-005" });
    await flushAsync();
    const call = trackCalls(logSpy)[0];
    expect(call).toBeDefined();
    expect(call.props).toMatchObject({
      registry: "W4-SLA",
      entity_type: "failed_payment",
      band: "OVERDUE",
      age_sec: 7200,
      sla_sec: 14400,
      scr: "SCR-005",
    });
  });

  it("null age/due seconds are omitted, not zeroed", async () => {
    const seen = new Set<string>();
    reportSlaBreaches([{ id: "x", band: "OVERDUE", entityType: "failed_payment", ageSeconds: null, dueSeconds: null }], { seen });
    await flushAsync();
    const props = trackCalls(logSpy)[0].props;
    expect(props).not.toHaveProperty("age_sec", 0);
    expect(props).not.toHaveProperty("sla_sec", 0);
  });
});
