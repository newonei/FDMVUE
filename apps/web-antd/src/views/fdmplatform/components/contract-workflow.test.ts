import type { Contract } from '#/api/fdmplatform';

import { describe, expect, it } from 'vitest';

import { contractQuickActionReason } from './contract-workflow';

const contract = {
  id: 'contract-1',
  code: 'HT-20260917-000001',
  name: '客户订单名称',
  status: 'CONFIRMED',
  currency: 'CNY',
  ownerUserId: 7,
  items: [{ id: 'line-1', skuId: 'sku-1', skuName: '产品', unitPrice: '100' }],
  allowedActions: [
    'CREATE_REQUEST',
    'CREATE_RECEIPT',
    'STOCK_RESERVE',
    'CREATE_INVOICE',
  ],
  finance: { receipts: [], invoices: [] },
} as unknown as Contract;

describe('contractQuickActionReason', () => {
  it('blocks shortcuts until the current contract is loaded', () => {
    expect(contractQuickActionReason(undefined, 'CREATE_REQUEST')).toMatch(
      /尚未加载/,
    );
  });

  it('requires confirmation before purchase or shipping on a draft', () => {
    for (const action of [
      'CREATE_REQUEST',
      'ASSIGN_FULFILLMENT',
      'CREATE_QUOTE',
      'SAVE_PLAN',
      'GENERATE_ORDERS',
      'UPDATE_PRODUCTION',
      'STOCK_RESERVE',
      'STOCK_SHIP',
    ]) {
      expect(
        contractQuickActionReason({ ...contract, status: 'DRAFT' }, action),
      ).toMatch(/先完成订单生效/);
    }
  });

  it('does not add a new confirmation gate for priced draft receipts', () => {
    expect(
      contractQuickActionReason(
        { ...contract, status: 'DRAFT' },
        'CREATE_RECEIPT',
      ),
    ).toBeUndefined();
  });

  it('blocks receipts and invoices while any line is still unpriced', () => {
    for (const unitPrice of [null, undefined, '']) {
      for (const action of ['CREATE_RECEIPT', 'CREATE_INVOICE']) {
        expect(
          contractQuickActionReason(
            {
              ...contract,
              items: [{ id: '1', unitPrice } as Contract['items'][number]],
            },
            action,
          ),
        ).toMatch(/补齐成交单价/);
      }
    }
  });

  it('treats a legitimate zero sample price as priced', () => {
    expect(
      contractQuickActionReason(
        {
          ...contract,
          businessType: 'SAMPLE',
          items: [{ id: '1', unitPrice: 0 } as Contract['items'][number]],
        },
        'CREATE_RECEIPT',
      ),
    ).toBeUndefined();
  });

  it('uses the server pricingComplete flag when it is false', () => {
    expect(
      contractQuickActionReason(
        { ...contract, pricingComplete: false },
        'CREATE_RECEIPT',
      ),
    ).toMatch(/待定价/);
  });

  it('keeps terminal contracts view-only', () => {
    for (const status of ['CLOSED', 'CANCELLED'] as const) {
      for (const action of contract.allowedActions) {
        expect(
          contractQuickActionReason({ ...contract, status }, action),
        ).toMatch(/仅可查看/);
      }
    }
  });

  it('surfaces migration block reasons before shortcuts', () => {
    expect(
      contractQuickActionReason(
        { ...contract, blockReasons: ['缺少客户'] },
        'CREATE_REQUEST',
      ),
    ).toMatch(/缺少客户/);
  });

  it('does not open unauthorized actions from the overview', () => {
    expect(
      contractQuickActionReason(
        { ...contract, allowedActions: [] },
        'CREATE_REQUEST',
      ),
    ).toMatch(/权限/);
  });

  it('allows original authorized actions on confirmed and executing contracts', () => {
    for (const status of ['CONFIRMED', 'EXECUTING'] as const) {
      for (const action of contract.allowedActions) {
        expect(
          contractQuickActionReason({ ...contract, status }, action),
        ).toBeUndefined();
      }
    }
  });
});
