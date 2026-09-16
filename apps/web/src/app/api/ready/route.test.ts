import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Regression guard for audit finding O-02.
 *
 * `/api/health` used to run `SELECT 1` and then return HTTP 200 with
 * `{"status":"ok","db":"error"}` while no database was running, and
 * `compose.yaml` grepped that body for the substring `ok` — so an instance with
 * no database was declared healthy and kept receiving traffic forever.
 *
 * The two questions are now separated: liveness ("is the process up") must never
 * depend on a dependency, and readiness ("can it do its job") must fail loudly
 * when a required dependency is down.
 */

const queryRaw = vi.fn();

vi.mock("@/lib/db/prisma", () => ({
  prisma: { $queryRaw: (...args: unknown[]) => queryRaw(...args) },
}));

vi.mock("@/lib/env", () => ({
  // A getter, not a captured value: the suite flips `READY_REQUIRE_DB` between
  // blocks and the mock factory is only evaluated once per module registry.
  env: {
    get READY_REQUIRE_DB() {
      return process.env.READY_REQUIRE_DB ?? "true";
    },
  },
}));

async function loadRoutes() {
  const health = await import("../health/route");
  const ready = await import("../ready/route");
  return { health, ready };
}

describe("/api/health — liveness", () => {
  beforeEach(() => {
    queryRaw.mockReset();
  });

  it("returns 200 and never probes the database", async () => {
    queryRaw.mockRejectedValue(new Error("can't reach database"));
    const { health } = await loadRoutes();

    const res = await health.GET();
    const body = (await res.json()) as { status: string; db?: unknown };

    expect(res.status).toBe(200);
    expect(body.status).toBe("ok");
    // The whole point of the split: a liveness probe must not carry a
    // dependency verdict that contradicts its own status code.
    expect(body.db).toBeUndefined();
    expect(queryRaw).not.toHaveBeenCalled();
  });

  it("stays 200 even when the database is healthy", async () => {
    queryRaw.mockResolvedValue([{ "?column?": 1 }]);
    const { health } = await loadRoutes();

    const res = await health.GET();
    expect(res.status).toBe(200);
    expect(queryRaw).not.toHaveBeenCalled();
  });
});

describe("/api/ready — readiness", () => {
  beforeEach(() => {
    queryRaw.mockReset();
  });

  it("returns 200 when the database probe succeeds", async () => {
    queryRaw.mockResolvedValue([{ "?column?": 1 }]);
    const { ready } = await loadRoutes();

    const res = await ready.GET();
    const body = (await res.json()) as {
      status: string;
      checks: { db: { status: string; required: boolean } };
    };

    expect(res.status).toBe(200);
    expect(body.status).toBe("ready");
    expect(body.checks.db.status).toBe("ok");
    expect(body.checks.db.required).toBe(true);
  });

  it("returns 503 when the database is required and unreachable", async () => {
    queryRaw.mockRejectedValue(new Error("connect ECONNREFUSED 127.0.0.1:5432"));
    const { ready } = await loadRoutes();

    const res = await ready.GET();
    const body = (await res.json()) as {
      status: string;
      checks: { db: { status: string; required: boolean; reason?: string } };
    };

    expect(res.status).toBe(503);
    expect(body.status).toBe("not-ready");
    expect(body.checks.db.status).toBe("error");
    expect(body.checks.db.reason).toContain("ECONNREFUSED");
  });

  it("reports the failure reason so an operator can diagnose it", async () => {
    queryRaw.mockRejectedValue(new Error("password authentication failed"));
    const { ready } = await loadRoutes();

    const res = await ready.GET();
    const body = (await res.json()) as { checks: { db: { reason?: string } } };
    expect(body.checks.db.reason).toContain("password authentication failed");
  });
});

describe("/api/ready — READY_REQUIRE_DB=false (local development)", () => {
  beforeEach(() => {
    queryRaw.mockReset();
    process.env.READY_REQUIRE_DB = "false";
  });

  afterEach(() => {
    delete process.env.READY_REQUIRE_DB;
  });

  it("stays 200 but still reports the database as errored", async () => {
    queryRaw.mockRejectedValue(new Error("no database in this sandbox"));
    const { ready } = await loadRoutes();

    const res = await ready.GET();
    const body = (await res.json()) as {
      status: string;
      checks: { db: { status: string; required: boolean } };
    };

    expect(res.status).toBe(200);
    expect(body.status).toBe("ready");
    // Not ready-conditional, but never misrepresented either.
    expect(body.checks.db.status).toBe("error");
    expect(body.checks.db.required).toBe(false);
  });
});
