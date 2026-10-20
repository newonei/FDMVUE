import type { Contract } from '#/api/fdmplatform';

import { describe, expect, it } from 'vitest';

import { financeActions } from '../data';

const contract = (businessType: string) =>
  ({
    id: 'c1',
    code: 'HT-1',
    customerId: 'customer-1',
    businessType,
    currency: 'CNY',
    items: [],
    finance: { receipts: [], invoices: [], allocations: [], costs: [] },
  }) as unknown as Contract;

describe('invoice registration shows the buyer invoice details', () => {
  it('points domestic contracts and domestic samples at their customer', () => {
    for (const type of ['DOMESTIC', 'DOMESTIC_SAMPLE'])
      expect(
        financeActions(contract(type)).CREATE_INVOICE?.buyerCustomerId,
      ).toBe('customer-1');
  });

  it('leaves foreign-trade invoices without a buyer panel', () => {
    for (const type of ['FOREIGN', 'SAMPLE', ''])
      expect(
        financeActions(contract(type)).CREATE_INVOICE?.buyerCustomerId,
      ).toBeUndefined();
  });
});
