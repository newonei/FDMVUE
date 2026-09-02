import BigNumber from 'bignumber.js';

const ZERO = new BigNumber(0);

function decimal(value: unknown, fallback = ZERO) {
  if (value === null || value === undefined) return fallback;
  const normalized = String(value).trim();
  if (!normalized) return fallback;
  const result = new BigNumber(normalized);
  return result.isFinite() ? result : fallback;
}

export function canonicalDecimal(value: unknown, fallback = '0') {
  return decimal(value, new BigNumber(fallback)).toFixed(0);
}

export function isPositiveDecimal(value: unknown) {
  if (value === null || value === undefined || String(value).trim() === '') {
    return false;
  }
  const result = new BigNumber(String(value));
  return result.isFinite() && result.gt(0);
}

export function calculateCnyAmount(amount: unknown, rate: unknown) {
  return decimal(amount)
    .multipliedBy(decimal(rate))
    .decimalPlaces(2, BigNumber.ROUND_HALF_UP)
    .toFixed(2);
}

export function sumCnyAmounts(values: readonly unknown[]) {
  let total = ZERO;
  for (const value of values) total = total.plus(decimal(value));
  return total.decimalPlaces(2, BigNumber.ROUND_HALF_UP).toFixed(2);
}

export function formatAmount(value: unknown, decimals = 2) {
  return decimal(value).toFormat(decimals, BigNumber.ROUND_HALF_UP, {
    decimalSeparator: '.',
    groupSeparator: ',',
    groupSize: 3,
  });
}

export function createLatestRequestGuard() {
  let sequence = 0;
  return {
    begin() {
      sequence += 1;
      return sequence;
    },
    invalidate() {
      sequence += 1;
    },
    isLatest(requestId: number) {
      return requestId === sequence;
    },
  };
}
