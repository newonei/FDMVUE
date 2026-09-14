import type { Contract } from '#/api/fdmplatform';

import { describe, expect, it } from 'vitest';

import {
  importedCompletionPayload,
  importedContractGaps,
} from './import-completion';
const contract = {
  id: 'c',
  companyId: 0,
  currency: '',
  customerId: 'known',
  businessType: 'FOREIGN',
  ownerUserId: 0,
  departmentId: 0,
  items: [
    {
      id: 'line',
      skuId: '',
      quantity: '3',
      unitPrice: '17',
      unit: '张',
      specification: '',
      taxBasis: '',
    },
  ],
} as unknown as Contract;
describe('native imported contract completion', () => {
  it('keeps an unknown currency empty and exposes only actually missing identity fields', () => {
    expect(importedContractGaps(contract)).toEqual([
      'companyId',
      'currency',
      'productCategory',
      'ownerUserId',
      'departmentId',
    ]);
  });
  it('can fill a missing product category without replacing an already known category', () => {
    expect(
      importedCompletionPayload(
        contract,
        { reason: '核对产品', productCategory: 'YOGA' },
        {},
      ),
    ).toEqual({ reason: '核对产品', productCategory: 'YOGA' });
    expect(
      importedCompletionPayload(
        { ...contract, productCategory: 'YOGA' },
        { reason: '核对产品', productCategory: 'FITNESS', currency: 'USD' },
        {},
      ),
    ).toEqual({ reason: '核对产品', currency: 'USD' });
  });
  it('never changes existing customer, commercial quantity, price, or unit while filling verified fields', () => {
    expect(
      importedCompletionPayload(
        contract,
        {
          reason: '核对原合同',
          companyId: 2,
          currency: 'USD',
          customerId: 'wrong',
          amount: '999',
        },
        {
          line: {
            skuId: 'p1',
            unit: '米',
            quantity: 9,
            unitPrice: 0,
            specification: '原规格',
          },
        },
      ),
    ).toEqual({
      reason: '核对原合同',
      companyId: 2,
      currency: 'USD',
      itemMappings: [{ itemId: 'line', skuId: 'p1', specification: '原规格' }],
    });
  });
  it('rejects a confirmation with no actual completion and requires a traceable reason', () => {
    expect(() =>
      importedCompletionPayload(contract, { reason: '核对' }, {}),
    ).toThrow('至少补齐');
    expect(() =>
      importedCompletionPayload(contract, { currency: 'USD' }, {}),
    ).toThrow('依据说明');
  });
});
