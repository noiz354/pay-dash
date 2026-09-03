import { z } from "zod";

// Broad persistence contract. Provider capability manifests impose narrower limits.
export const DecimalAmountSchema = z
  .string()
  .regex(/^(0|[1-9]\d{0,15})(\.\d{1,4})?$/, "Use a canonical non-negative decimal string with at most 4 fractional digits");

export const CurrencySchema = z
  .string()
  .regex(/^[A-Z]{3}$/, "Use an uppercase ISO-4217 currency code");

export const MoneySchema = z.object({
  amount: DecimalAmountSchema,
  currency: CurrencySchema,
});

export type Money = z.infer<typeof MoneySchema>;

export const CURRENCY_MINOR_UNITS: Readonly<Record<string, number>> = Object.freeze({
  IDR: 0,
  JPY: 0,
  USD: 2,
  SGD: 2,
  PHP: 2,
  THB: 2,
  VND: 0,
});

export function parseMoney(value: unknown): Money {
  return MoneySchema.parse(value);
}

export function assertSupportedMinorUnits(money: Money): Money {
  const units = CURRENCY_MINOR_UNITS[money.currency];
  if (units === undefined) return money;
  const fractionalLength = money.amount.split(".")[1]?.length ?? 0;
  if (fractionalLength > units) {
    throw new Error(`${money.currency} supports at most ${units} fractional digits`);
  }
  return money;
}
