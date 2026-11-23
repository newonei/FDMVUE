import BigNumber from 'bignumber.js';

export function formatMoneyDecimal(
  value: unknown,
  useGrouping = true,
): string | undefined {
  const input = typeof value === 'string' ? value.trim() : value;
  if (
    input === '' ||
    (typeof input !== 'string' &&
      typeof input !== 'number' &&
      !BigNumber.isBigNumber(input))
  ) {
    return undefined;
  }

  const amount = new BigNumber(input);
  if (!amount.isFinite()) return undefined;
  return useGrouping
    ? amount.toFormat(2, BigNumber.ROUND_HALF_UP)
    : amount.toFixed(2, BigNumber.ROUND_HALF_UP);
}
