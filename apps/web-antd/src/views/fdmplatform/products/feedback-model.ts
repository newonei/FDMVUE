import type { Contract, ContractItem, Decimal } from '#/api/fdmplatform';

import BigNumber from 'bignumber.js';

export interface SalesCharge {
  name: string;
  amount: Decimal;
}

export function salesChargesTotal(charges: SalesCharge[]) {
  let total = new BigNumber(0);
  for (const charge of charges) {
    total = total.plus(charge.amount || 0);
  }
  return total;
}

export function historicalAdditionalAmount(contract?: Contract) {
  if (!contract) return '0';
  return new BigNumber(contract.additionalAmount ?? 0)
    .minus(salesChargesTotal(contract.salesCharges ?? []))
    .toFixed(2);
}

/** Only known active requests consume the suggested quantity. Unknown history requires manual input. */
export function requestLineDefaults(contract: Contract, item: ContractItem) {
  let remaining = new BigNumber(item.quantity);
  let known =
    remaining.isFinite() &&
    remaining.isGreaterThan(0) &&
    Array.isArray(contract.requests);
  for (const request of contract.requests ?? []) {
    if (request.status === 'CANCELLED') continue;
    if (request.status !== 'ACTIVE' || !Array.isArray(request.items)) {
      known = false;
      continue;
    }
    for (const line of request.items as Record<string, unknown>[]) {
      if (line.contractItemId !== item.id) continue;
      const quantity = new BigNumber(String(line.quantity ?? ''));
      if (!quantity.isFinite() || !quantity.isGreaterThan(0)) known = false;
      else remaining = remaining.minus(quantity);
    }
  }
  return {
    quantity:
      known && remaining.isGreaterThan(0)
        ? remaining.toFixed(remaining.decimalPlaces() ?? 0)
        : '',
    requiredDate: item.requiredDate ?? '',
  };
}

export const attachmentPurposeOptions = [
  { value: 'ARTWORK', label: '产品图稿' },
  { value: 'LOGO', label: 'LOGO' },
  { value: 'MARK', label: '唛头 / 箱唛' },
  { value: 'CARD', label: '卡纸' },
  { value: 'STICKER', label: '贴纸' },
];
