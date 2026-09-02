import { beforeEach, describe, expect, it } from "vitest";
import {
  createLink,
  deriveLinkStatus,
  expireLink,
  getLink,
  listLinks,
  recordLinkPayment,
  totalOf,
  type PaymentLink,
} from "./links";
import { getTransaction } from "./transactions";

function resetAllStores() {
  const g = globalThis as unknown as {
    __kineticTxStore?: unknown;
    __kineticLinksStore?: unknown;
  };
  g.__kineticTxStore = undefined;
  g.__kineticLinksStore = undefined;
}

beforeEach(resetAllStores);

const PAID_SEED = "plink_8x9a2b1c";
const OPEN_SINGLE_SEED = "plink_4c5d6e7f";
const OPEN_MULTI_SEED = "plink_2z3x4c5v";
const EXPIRED_SEED = "plink_9q8w7e6r";
const CANCELLED_SEED = "plink_7f8g9h0j";

function baseLink(overrides: Partial<PaymentLink> = {}): PaymentLink {
  return {
    id: "plink_test",
    kind: "single",
    items: [{ id: "it_1", label: "Payment", amount: 100_000 }],
    payerEmail: null,
    createdAt: new Date().toISOString(),
    expiresAt: null,
    cancelledAt: null,
    paidAt: null,
    currency: "IDR",
    ...overrides,
  };
}

describe("seed coverage", () => {
  it("lists eight seeded links with derived statuses", () => {
    const data = listLinks({ pageSize: 100 });
    expect(data.total).toBe(8);

    const byStatus = new Map<string, number>();
    for (const row of data.rows) byStatus.set(row.status, (byStatus.get(row.status) ?? 0) + 1);
    expect(byStatus.get("OPEN")).toBe(3);
    expect(byStatus.get("PAID")).toBe(2);
    expect(byStatus.get("EXPIRED")).toBe(2);
    expect(byStatus.get("CANCELLED")).toBe(1);
  });

  it("seeds every derived status with the right shape", () => {
    expect(getLink(PAID_SEED)?.status).toBe("PAID");
    expect(getLink(OPEN_SINGLE_SEED)?.status).toBe("OPEN");
    expect(getLink(OPEN_MULTI_SEED)?.status).toBe("OPEN");
    expect(getLink(EXPIRED_SEED)?.status).toBe("EXPIRED");
    expect(getLink(CANCELLED_SEED)?.status).toBe("CANCELLED");

    const paid = getLink(PAID_SEED);
    expect(paid?.total).toBe(totalOf(paid!));
    expect(paid?.total).toBe(4_250_000);
    expect(getLink(OPEN_MULTI_SEED)?.total).toBe(58_750_000);
  });

  it("sorts by createdAt descending", () => {
    const rows = listLinks({ pageSize: 100 }).rows;
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i - 1].createdAt >= rows[i].createdAt).toBe(true);
    }
  });

  it("returns null for unknown ids", () => {
    expect(getLink("plink_does_not_exist")).toBeNull();
  });
});

describe("filters and pagination", () => {
  it("filters by kind", () => {
    expect(listLinks({ kind: "single", pageSize: 100 }).total).toBe(5);
    expect(listLinks({ kind: "multiple", pageSize: 100 }).total).toBe(3);
  });

  it("filters by status", () => {
    expect(listLinks({ status: "PAID", pageSize: 100 }).total).toBe(2);
    expect(listLinks({ status: "OPEN", pageSize: 100 }).total).toBe(3);
    expect(listLinks({ status: "EXPIRED", pageSize: 100 }).total).toBe(2);
    expect(listLinks({ status: "CANCELLED", pageSize: 100 }).total).toBe(1);
  });

  it("searches id, payer email and item labels", () => {
    const byEmail = listLinks({ q: "starkindustries", pageSize: 100 });
    expect(byEmail.total).toBe(2);
    expect(byEmail.rows.every((r) => r.payerEmail === "billing@starkindustries.com")).toBe(true);

    const byId = listLinks({ q: "plink_4c5d6e7f" });
    expect(byId.total).toBe(1);
    expect(byId.rows[0]?.id).toBe("plink_4c5d6e7f");

    const byLabel = listLinks({ q: "Licensing" });
    expect(byLabel.total).toBe(1);
    expect(byLabel.rows[0]?.id).toBe(OPEN_MULTI_SEED);

    expect(listLinks({ q: "no-such-needle-xyz" }).total).toBe(0);
  });

  it("pages correctly and clamps out-of-range pages", () => {
    const first = listLinks({ pageSize: 3, page: 1 });
    expect(first.total).toBe(8);
    expect(first.pageCount).toBe(3);
    expect(first.rows).toHaveLength(3);

    const second = listLinks({ pageSize: 3, page: 2 });
    expect(second.rows).toHaveLength(3);
    // No overlap between adjacent pages.
    expect(new Set(first.rows.map((r) => r.id)).intersection(new Set(second.rows.map((r) => r.id)))).toHaveLength(0);

    // Past the last page → clamps to the last page, not an empty slice.
    const clamped = listLinks({ pageSize: 3, page: 99 });
    expect(clamped.page).toBe(3);
    expect(clamped.rows).toHaveLength(2);
  });
});

describe("deriveLinkStatus precedence", () => {
  it("cancelled wins over everything", () => {
    const link = baseLink({
      cancelledAt: new Date().toISOString(),
      paidAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() - 1000).toISOString(),
    });
    expect(deriveLinkStatus(link, new Set())).toBe("CANCELLED");
  });

  it("paid via paidAt wins over expiry", () => {
    const link = baseLink({
      paidAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() - 1000).toISOString(),
    });
    expect(deriveLinkStatus(link, new Set())).toBe("PAID");
  });

  it("paid via a SUCCEEDED ledger reference flips a link with no paidAt", () => {
    const link = baseLink();
    expect(deriveLinkStatus(link, new Set())).toBe("OPEN");
    expect(deriveLinkStatus(link, new Set(["plink_other"]))).toBe("OPEN");
    expect(deriveLinkStatus(link, new Set(["plink_test"]))).toBe("PAID");
  });

  it("expired when the clock has passed and nothing else closed it", () => {
    expect(deriveLinkStatus(baseLink({ expiresAt: new Date(Date.now() - 1000).toISOString() }), new Set())).toBe(
      "EXPIRED"
    );
  });

  it("open otherwise — including not-yet-expired links", () => {
    expect(deriveLinkStatus(baseLink(), new Set())).toBe("OPEN");
    expect(
      deriveLinkStatus(baseLink({ expiresAt: new Date(Date.now() + 86_400_000).toISOString() }), new Set())
    ).toBe("OPEN");
  });
});

describe("createLink", () => {
  it("adds a link that lists first and derives OPEN", () => {
    const before = listLinks({ pageSize: 100 }).total;
    const link = createLink({
      kind: "single",
      items: [{ label: "Website checkout", amount: 250_000 }],
      payerEmail: "billing@customer.com",
      expiresAt: null,
    });

    expect(link.id).toMatch(/^plink_/);
    expect(listLinks({ pageSize: 100 }).total).toBe(before + 1);
    const listed = getLink(link.id);
    expect(listed?.status).toBe("OPEN");
    expect(listed?.total).toBe(250_000);
  });
});

describe("expireLink", () => {
  it("closes an open link", () => {
    const link = createLink({
      kind: "single",
      items: [{ label: "Payment", amount: 50_000 }],
      payerEmail: null,
      expiresAt: null,
    });
    expireLink(link.id);
    expect(getLink(link.id)?.status).toBe("CANCELLED");
    expect(getLink(link.id)?.cancelledAt).toBeTruthy();
  });

  it("rejects unknown, already-closed and paid links", () => {
    expect(() => expireLink("plink_nope")).toThrow(/Unknown payment link/);

    const closed = createLink({
      kind: "single",
      items: [{ label: "Payment", amount: 50_000 }],
      payerEmail: null,
      expiresAt: null,
    });
    expireLink(closed.id);
    expect(() => expireLink(closed.id)).toThrow(/already closed/);

    const paid = baseLink({ paidAt: new Date().toISOString() });
    expect(deriveLinkStatus(paid, new Set())).toBe("PAID");
    // A paid seed (ledger-confirmed) cannot be closed either.
    expect(() => expireLink(PAID_SEED)).toThrow(/cannot be expired/);
  });
});

describe("recordLinkPayment (TEST MODE)", () => {
  it("creates a SUCCEEDED ledger row that references the link and flips it to PAID", async () => {
    const link = createLink({
      kind: "multiple",
      items: [
        { label: "Consulting — March", amount: 10_000_000 },
        { label: "Support plan", amount: 2_000_000 },
      ],
      payerEmail: "billing@customer.com",
      expiresAt: null,
    });
    const beforeLedger = listLinks({ pageSize: 100 }).total;

    const { transactionId, total } = await recordLinkPayment(link.id);

    expect(total).toBe(12_000_000);
    // The ledger row IS the payment: id = referenceId = link id.
    expect(transactionId).toBe(link.id);
    const tx = await getTransaction(transactionId);
    expect(tx).not.toBeNull();
    expect(tx?.status).toBe("SUCCEEDED");
    expect(tx?.referenceId).toBe(link.id);
    expect(tx?.amount).toBe(12_000_000);

    // The link flipped — driven by the ledger reference, not a stored status.
    const after = getLink(link.id);
    expect(after?.status).toBe("PAID");
    expect(after?.paidAt).toBeTruthy();
    // No phantom link was created.
    expect(listLinks({ pageSize: 100 }).total).toBe(beforeLedger);
  });

  it("refuses to pay twice, or pay a closed link", async () => {
    const link = createLink({
      kind: "single",
      items: [{ label: "Payment", amount: 50_000 }],
      payerEmail: null,
      expiresAt: null,
    });
    await recordLinkPayment(link.id);
    await expect(recordLinkPayment(link.id)).rejects.toThrow(/only open links/i);

    const closed = createLink({
      kind: "single",
      items: [{ label: "Payment", amount: 50_000 }],
      payerEmail: null,
      expiresAt: null,
    });
    expireLink(closed.id);
    await expect(recordLinkPayment(closed.id)).rejects.toThrow(/only open links/i);
  });

  it("refuses unknown links", async () => {
    await expect(recordLinkPayment("plink_nope")).rejects.toThrow(/Unknown payment link/);
  });
});
