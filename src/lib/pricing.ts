export const BILLING_INTERVALS = ['month', 'year'] as const;
export type BillingInterval = (typeof BILLING_INTERVALS)[number];

/** Percentage saved by paying yearly instead of 12 monthly payments (0 when there's no yearly price). */
export function yearlySavingsPct(monthly: number, yearly: number | null | undefined) {
  if (!monthly || !yearly) return 0;
  return Math.max(0, Math.round((1 - yearly / (monthly * 12)) * 100));
}

/** The largest yearly saving across plans, for "Save up to N%" labels. */
export function bestYearlySavings(plans: { priceAmount: number; yearlyPriceAmount: number | null }[]) {
  return plans.reduce((best, p) => Math.max(best, yearlySavingsPct(p.priceAmount, p.yearlyPriceAmount)), 0);
}
