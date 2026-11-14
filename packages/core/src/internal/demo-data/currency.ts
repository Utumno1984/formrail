// Currencies of the demo universe. Money is always an integer amount of minor units (cents, pence; yen
// have none) plus an ISO 4217 code: never a float, so totals add up exactly.

/** The ISO 4217 codes the demo company trades in. */
export type DemoCurrency = 'EUR' | 'USD' | 'GBP' | 'JPY';

export const DEMO_CURRENCIES: readonly DemoCurrency[] = Object.freeze(['EUR', 'USD', 'GBP', 'JPY']);

/** Digits after the decimal separator (ISO 4217 minor unit): 1 JPY has no subdivision. */
export const CURRENCY_MINOR_DIGITS: Readonly<Record<DemoCurrency, number>> = Object.freeze({
  EUR: 2,
  USD: 2,
  GBP: 2,
  JPY: 0,
});

/** Fixed demo exchange rates, units of each currency per 1 EUR (not market data). */
export const DEMO_FX_PER_EUR: Readonly<Record<DemoCurrency, number>> = Object.freeze({
  EUR: 1,
  USD: 1.08,
  GBP: 0.85,
  JPY: 162,
});

/**
 * Converts an amount in EUR minor units to `currency` minor units at the demo rate, rounded to a
 * multiple of `step` minor units of the target currency (half away from zero). Always an integer.
 */
export function convertFromEurMinor(eurMinor: number, currency: DemoCurrency, step = 1): number {
  const major = eurMinor / 100;
  const minor = major * DEMO_FX_PER_EUR[currency] * 10 ** CURRENCY_MINOR_DIGITS[currency];
  const rounded = Math.sign(minor) * Math.round(Math.abs(minor) / step) * step;
  return rounded === 0 ? 0 : rounded;
}
