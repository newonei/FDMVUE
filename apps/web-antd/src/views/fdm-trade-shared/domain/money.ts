import type {
  DecimalString,
  MoneyString,
  QuantityString,
  RateString,
} from './types';

import BigNumber from 'bignumber.js';

export type DecimalValue = BigNumber.Value;

export function asBigNumber(value: DecimalValue): BigNumber {
  const result = new BigNumber(value);
  if (!result.isFinite()) {
    throw new TypeError(`Invalid decimal value: ${String(value)}`);
  }
  return result;
}

export function decimal(value: DecimalValue): DecimalString {
  const number = asBigNumber(value);
  return number.toFixed(number.decimalPlaces() ?? 0);
}

export function money(value: DecimalValue): MoneyString {
  return asBigNumber(value)
    .decimalPlaces(2, BigNumber.ROUND_HALF_UP)
    .toFixed(2);
}

export function rate(value: DecimalValue): RateString {
  const number = asBigNumber(value).decimalPlaces(6, BigNumber.ROUND_HALF_UP);
  return number.toFixed(number.decimalPlaces() ?? 0);
}

export function quantity(value: DecimalValue): QuantityString {
  const number = asBigNumber(value).decimalPlaces(6, BigNumber.ROUND_HALF_UP);
  return number.toFixed(number.decimalPlaces() ?? 0);
}

export function add(...values: DecimalValue[]): DecimalString {
  let total = new BigNumber(0);
  for (const value of values) total = total.plus(value);
  return decimal(total);
}

export function subtract(
  minuend: DecimalValue,
  ...subtrahends: DecimalValue[]
): DecimalString {
  let total = asBigNumber(minuend);
  for (const value of subtrahends) total = total.minus(value);
  return decimal(total);
}

export function multiply(
  left: DecimalValue,
  right: DecimalValue,
): DecimalString {
  return decimal(asBigNumber(left).multipliedBy(right));
}

export function sum<T>(
  values: readonly T[],
  select: (value: T) => DecimalValue,
): DecimalString {
  let total = new BigNumber(0);
  for (const value of values) total = total.plus(select(value));
  return decimal(total);
}

export function equals(left: DecimalValue, right: DecimalValue): boolean {
  return asBigNumber(left).isEqualTo(right);
}

export function isNegative(value: DecimalValue): boolean {
  return asBigNumber(value).isNegative();
}

export function isGreaterThan(
  left: DecimalValue,
  right: DecimalValue,
): boolean {
  return asBigNumber(left).isGreaterThan(right);
}

export function clampToZero(value: DecimalValue): DecimalString {
  const number = asBigNumber(value);
  return decimal(number.isNegative() ? 0 : number);
}
