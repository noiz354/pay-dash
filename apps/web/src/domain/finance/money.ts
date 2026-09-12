/**
 * Wave 6 — minor-unit money arithmetic (INV-L8).
 *
 * Every financial figure in the reconciliation / invariant / case layers is an
 * **integer number of minor units** for one currency. There is no float
 * arithmetic anywhere in `domain/finance`: `0.1 + 0.2 !== 0.3` is not a
 * curiosity in a ledger, it is a defect that compounds silently across a
 * million rows.
 *
 * This module is deliberately tiny and dependency-free so it can be used by the
 * pure checkers (`invariants.ts`, `reconciliation.ts`) without pulling in Zod,
 * Prisma, or anything server-only.
 *
 * Relationship to `domain/payments/money.ts`: that module validates the
 * *persistence* contract (canonical decimal strings, ISO currency) at the
 * repository boundary. This module is the *arithmetic* contract used once the
 * value is inside the financial engine. They meet at `fromDecimalString`.
 */

/** Minor units for the currencies this product actually handles. */
export const MINOR_UNITS: Readonly<Record<string, number>> = Object.freeze({
  IDR: 0,
  JPY: 0,
  VND: 0,
  USD: 2,
  SGD: 2,
  PHP: 2,
  THB: 2,
  MYR: 2,
  EUR: 2,
});

export class MoneyError extends Error {
  constructor(
    readonly code: "NOT_INTEGER" | "NOT_FINITE" | "CURRENCY_MISMATCH" | "UNKNOWN_CURRENCY" | "BAD_DECIMAL",
    message: string,
  ) {
    super(message);
    this.name = "MoneyError";
  }
}

/** An amount in integer minor units, tagged with its currency. */
export type Minor = {
  /** Integer minor units. May be negative (a credit / outflow). */
  readonly units: number;
  /** Uppercase ISO-4217 code. */
  readonly currency: string;
};

/**
 * Build a `Minor`. Rejects non-integers outright — a caller that has a
 * fractional minor unit has already lost precision upstream and must be fixed
 * there, not rounded here (INV-L8).
 */
export function minor(units: number, currency: string): Minor {
  if (!Number.isFinite(units)) {
    throw new MoneyError("NOT_FINITE", `Amount is not finite: ${String(units)}`);
  }
  if (!Number.isInteger(units)) {
    throw new MoneyError(
      "NOT_INTEGER",
      `Amount must be an integer number of minor units, received ${units}. Fix the precision loss at the source; do not round here.`,
    );
  }
  return { units, currency: currency.toUpperCase() };
}

/** Zero in a given currency — the identity element for `addMinor`. */
export function zero(currency: string): Minor {
  return { units: 0, currency: currency.toUpperCase() };
}

function assertSameCurrency(a: Minor, b: Minor): void {
  if (a.currency !== b.currency) {
    throw new MoneyError(
      "CURRENCY_MISMATCH",
      `Refusing to combine ${a.currency} with ${b.currency} — cross-currency arithmetic is never implicit (INV-L6).`,
    );
  }
}

export function addMinor(a: Minor, b: Minor): Minor {
  assertSameCurrency(a, b);
  return { units: a.units + b.units, currency: a.currency };
}

export function subMinor(a: Minor, b: Minor): Minor {
  assertSameCurrency(a, b);
  return { units: a.units - b.units, currency: a.currency };
}

export function negateMinor(a: Minor): Minor {
  return { units: -a.units, currency: a.currency };
}

/**
 * Sum a list. An empty list needs an explicit currency: returning a
 * "currency-less zero" would let a caller accidentally add IDR to USD later.
 */
export function sumMinor(values: readonly Minor[], currency: string): Minor {
  return values.reduce<Minor>((acc, v) => addMinor(acc, v), zero(currency));
}

export function cmpMinor(a: Minor, b: Minor): -1 | 0 | 1 {
  assertSameCurrency(a, b);
  if (a.units < b.units) return -1;
  if (a.units > b.units) return 1;
  return 0;
}

export function eqMinor(a: Minor, b: Minor): boolean {
  return a.currency === b.currency && a.units === b.units;
}

export function isNegative(a: Minor): boolean {
  return a.units < 0;
}

export function absMinor(a: Minor): Minor {
  return { units: Math.abs(a.units), currency: a.currency };
}

/**
 * Parse the canonical decimal string used at the persistence boundary
 * (`domain/payments/money.ts`) into integer minor units. This is the single
 * conversion point between the two representations.
 */
export function fromDecimalString(value: string, currency: string): Minor {
  const cur = currency.toUpperCase();
  const scale = MINOR_UNITS[cur];
  if (scale === undefined) {
    throw new MoneyError("UNKNOWN_CURRENCY", `Unknown currency ${cur}; add it to MINOR_UNITS before using it.`);
  }
  const match = /^(-)?(\d+)(?:\.(\d+))?$/.exec(value.trim());
  if (!match) {
    throw new MoneyError("BAD_DECIMAL", `Not a canonical decimal amount: ${value}`);
  }
  const [, sign, whole, frac = ""] = match;
  if (frac.length > scale) {
    // Trailing zeros beyond the scale are harmless; real digits are precision loss.
    const excess = frac.slice(scale);
    if (/[^0]/.test(excess)) {
      throw new MoneyError(
        "BAD_DECIMAL",
        `${cur} supports ${scale} fractional digits; ${value} carries more significant precision than the currency can hold.`,
      );
    }
  }
  const padded = (frac + "0".repeat(scale)).slice(0, scale);
  const units = Number(whole) * 10 ** scale + (scale > 0 ? Number(padded || "0") : 0);
  return minor(sign === "-" ? -units : units, cur);
}

/** Render minor units back to the canonical decimal string (for persistence/exports). */
export function toDecimalString(value: Minor): string {
  const scale = MINOR_UNITS[value.currency];
  if (scale === undefined) {
    throw new MoneyError("UNKNOWN_CURRENCY", `Unknown currency ${value.currency}`);
  }
  const sign = value.units < 0 ? "-" : "";
  const abs = Math.abs(value.units);
  if (scale === 0) return `${sign}${abs}`;
  const whole = Math.floor(abs / 10 ** scale);
  const frac = String(abs % 10 ** scale).padStart(scale, "0");
  return `${sign}${whole}.${frac}`;
}

/**
 * Convert a legacy in-memory amount (a plain JS number in **major** units, as
 * used by `server/data/*`) into minor units.
 *
 * The legacy stores hold IDR whole rupiah as numbers. For a zero-decimal
 * currency that is lossless; for a 2-decimal currency it is only lossless if
 * the value has at most 2 decimal places, which we verify rather than assume.
 */
export function fromLegacyNumber(value: number, currency: string): Minor {
  const cur = currency.toUpperCase();
  const scale = MINOR_UNITS[cur];
  if (scale === undefined) {
    throw new MoneyError("UNKNOWN_CURRENCY", `Unknown currency ${cur}`);
  }
  if (!Number.isFinite(value)) {
    throw new MoneyError("NOT_FINITE", `Legacy amount is not finite: ${String(value)}`);
  }
  const scaled = value * 10 ** scale;
  // Guard the float: 1.005 * 100 = 100.49999999999999 must not become 100.
  const rounded = Math.round(scaled);
  if (Math.abs(scaled - rounded) > 1e-6) {
    throw new MoneyError(
      "NOT_INTEGER",
      `Legacy amount ${value} ${cur} does not land on a whole minor unit (${scaled}); the precision was already lost upstream.`,
    );
  }
  return minor(rounded, cur);
}
