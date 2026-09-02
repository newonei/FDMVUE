import BigNumber from 'bignumber.js';

export interface AmountItemInput {
  discountRate?: null | string;
  quantity?: null | string;
  unitPrice?: null | string;
}

export interface ContractAmountInput {
  additionalFeeAmount?: null | string;
  items: readonly AmountItemInput[];
  orderDiscountRate?: null | string;
  roundingDiscountAmount?: null | string;
}

export interface ContractAmountResult {
  additionalFeeAmount: string;
  discountedProductAmount: string;
  itemAmounts: string[];
  orderDiscountAmount: string;
  orderDiscountRate: string;
  productAmount: string;
  roundingDiscountAmount: string;
  totalAmount: string;
}

const ZERO = new BigNumber(0);
const ONE_HUNDRED = new BigNumber(100);

function decimal(value: unknown, fallback = ZERO) {
  if (value === null || value === undefined) {
    return fallback;
  }
  const normalized = String(value).trim();
  if (!normalized) return fallback;
  const result = new BigNumber(normalized);
  return result.isFinite() ? result : fallback;
}

export function roundMoney(value: BigNumber.Value) {
  return new BigNumber(value)
    .decimalPlaces(2, BigNumber.ROUND_HALF_UP)
    .toFixed(2);
}

export function canonicalDecimal(value: unknown, fallback = '0') {
  const result = decimal(value, new BigNumber(fallback));
  return result.toFixed(0);
}

export function isDecimalInRange(
  value: unknown,
  minimum: BigNumber.Value,
  maximum?: BigNumber.Value,
) {
  if (value === null || value === undefined) return false;
  const normalized = String(value).trim();
  if (!normalized) return false;
  const result = new BigNumber(normalized);
  if (!result.isFinite() || result.lt(minimum)) return false;
  return maximum === undefined || result.lte(maximum);
}

export function calculateLineAmount(item: AmountItemInput) {
  const unitPrice = decimal(item.unitPrice);
  const quantity = decimal(item.quantity);
  const discountRate = decimal(item.discountRate, ONE_HUNDRED);
  return roundMoney(
    unitPrice.multipliedBy(quantity).multipliedBy(discountRate).dividedBy(100),
  );
}

export function calculateContractAmount(
  input: ContractAmountInput,
): ContractAmountResult {
  const itemAmounts = input.items.map(calculateLineAmount);
  let productAmountNumber = ZERO;
  for (const value of itemAmounts) {
    productAmountNumber = productAmountNumber.plus(value);
  }
  const orderDiscountRateNumber = decimal(input.orderDiscountRate, ONE_HUNDRED);
  const discountedProductNumber = productAmountNumber
    .multipliedBy(orderDiscountRateNumber)
    .dividedBy(100);
  const roundingDiscountNumber = decimal(input.roundingDiscountAmount);
  const additionalFeeNumber = decimal(input.additionalFeeAmount);
  const productAmount = roundMoney(productAmountNumber);
  const discountedProductAmount = roundMoney(discountedProductNumber);
  const discountedProductRounded = new BigNumber(discountedProductAmount);
  const totalNumber = discountedProductRounded
    .minus(roundingDiscountNumber)
    .plus(additionalFeeNumber);

  return {
    additionalFeeAmount: roundMoney(additionalFeeNumber),
    discountedProductAmount,
    itemAmounts,
    orderDiscountAmount: roundMoney(
      new BigNumber(productAmount).minus(discountedProductRounded),
    ),
    orderDiscountRate: canonicalDecimal(
      input.orderDiscountRate,
      ONE_HUNDRED.toFixed(0),
    ),
    productAmount,
    roundingDiscountAmount: roundMoney(roundingDiscountNumber),
    totalAmount: roundMoney(totalNumber),
  };
}

export function formatCurrencyAmount(value: unknown) {
  const amount = decimal(value);
  return amount.toFormat(2, BigNumber.ROUND_HALF_UP, {
    decimalSeparator: '.',
    groupSeparator: ',',
    groupSize: 3,
  });
}
