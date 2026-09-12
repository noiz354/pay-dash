// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// BE-004: export guard — fail-closed 401/403
// Mock resolveSessionOrgContext to control ctx
vi.mock("./session-org-context", async () => {
  const actual = await vi.importActual("./session-org-context");
  return {
    ...(actual as any),
    resolveSessionOrgContext: vi.fn(),
  };
});

import { guardExport } from "./export-guard";
import { resolveSessionOrgContext } from "./session-org-context";

const mockedResolve = vi.mocked(resolveSessionOrgContext);

function req(url = "http://localhost/api/exports/transactions") {
  return new Request(url, { headers: new Headers() });
}

describe("guardExport (BE-004)", () => {
  const original = process.env.AUTH_ENFORCED;
  afterEach(() => {
    vi.clearAllMocks();
    if (original === undefined) delete (process.env as any).AUTH_ENFORCED;
    else process.env.AUTH_ENFORCED = original;
  });

  it("returns 401 for demo fallback (strict mode, anonymous)", async () => {
    process.env.AUTH_ENFORCED = "strict";
    mockedResolve.mockResolvedValue({
      organizationId: "demo",
      roles: ["OWNER"],
      userId: null,
      isDemoFallback: true,
    } as any);
    const res = await guardExport(req(), "transaction.read");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.response.status).toBe(401);
  });

  it("returns 403 for wrong role (SUPPORT cannot export audit)", async () => {
    process.env.AUTH_ENFORCED = "strict";
    mockedResolve.mockResolvedValue({
      organizationId: "org-1",
      roles: ["SUPPORT"],
      userId: "u-support",
      isDemoFallback: false,
    } as any);
    const res = await guardExport(req("http://localhost/api/exports/audit"), "audit.read");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.response.status).toBe(403);
  });

  it("returns 200 for correct role (OWNER can export transactions, also via report.export fallback)", async () => {
    process.env.AUTH_ENFORCED = "strict";
    mockedResolve.mockResolvedValue({
      organizationId: "org-1",
      roles: ["FINANCE_OPERATOR"],
      userId: "u-op",
      isDemoFallback: false,
    } as any);
    // FINANCE_OPERATOR has transaction.read but not audit.read; for transactions it should pass
    const res = await guardExport(req(), "transaction.read");
    expect(res.ok).toBe(true);
  });

  it("allows via report.export alternative (DEVELOPER has report.export but not transaction.read for payouts)", async () => {
    process.env.AUTH_ENFORCED = "strict";
    mockedResolve.mockResolvedValue({
      organizationId: "org-1",
      roles: ["DEVELOPER"],
      userId: "u-dev",
      isDemoFallback: false,
    } as any);
    const res = await guardExport(req("http://localhost/api/exports/payouts"), "report.export");
    expect(res.ok).toBe(true);
  });

  it("bypasses guard when AUTH_ENFORCED=off (demo fallback allowed)", async () => {
    process.env.AUTH_ENFORCED = "off";
    mockedResolve.mockResolvedValue({
      organizationId: "demo",
      roles: ["OWNER"],
      userId: null,
      isDemoFallback: true,
    } as any);
    const res = await guardExport(req(), "transaction.read");
    expect(res.ok).toBe(true);
  });
});
