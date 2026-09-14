import type { ProductActivityRecord } from '#/api/fdmplatform/product-activity';

import { describe, expect, it } from 'vitest';

import { navigationRoute } from '../documents/navigation';
import {
  activityAmount,
  activityDate,
  activityName,
  activityQuantity,
  activityTarget,
  dateRangeError,
  quantityText,
} from './activity-model';

function record(
  overrides: Partial<ProductActivityRecord> = {},
): ProductActivityRecord {
  return {
    id: 'row-a',
    type: 'CONTRACT',
    documentId: 'doc-a',
    contractId: 'contract-a',
    name: '模拟单据',
    quantities: [],
    amounts: [],
    lines: [],
    targetType: 'contracts',
    ...overrides,
  };
}

describe('product activity navigation and quantity display', () => {
  it.each([
    'STOCK_IN',
    'STOCK_OUT',
    'STOCKTAKE',
    'PURCHASE_INVOICE',
    'PURCHASE_PAYMENT',
    'RECEIPT',
    'REFUND',
    'SALES_INVOICE',
  ] as const)('opens native %s without inventing a contract', (type) => {
    const target = activityTarget(
      record({
        type,
        contractId: null,
        standaloneId: 'native/a',
        recordType: type,
      }),
    );
    expect(target).toEqual({
      type: 'businessRecord',
      recordType: type,
      standaloneId: 'native/a',
    });
    expect(navigationRoute(target!).query.standaloneId).toBe('native/a');
  });
  it('routes confirmed procurement payments to their own finance identity and never attributes whole payments to the product', () => {
    const row = record({
      type: 'PURCHASE_PAYMENT',
      contractId: null,
      financeDocumentId: 'payment-a',
      amountBasis: 'DOCUMENT_TOTAL_NOT_ALLOCATED',
      documentAmount: '1000.25',
      documentCurrency: 'USD',
    });
    expect(navigationRoute(activityTarget(row)!)).toEqual({
      path: '/caiwu/platform-procurement-payments',
      query: { financeId: 'payment-a' },
    });
    expect(activityAmount(row)).toBe('整单付款 1,000.25 USD，未分摊至产品');
    expect(activityQuantity(row)).toBe('—');
  });
  it.each([
    ['PURCHASE_REQUEST', 'requests'],
    ['PURCHASE_ORDER', 'orders'],
    ['ARRIVAL', 'arrivals'],
    ['PURCHASE_RETURN', 'purchaseReturns'],
    ['SHIPMENT', 'shipments'],
    ['SALES_RETURN', 'salesReturns'],
    ['PRODUCTION_PROGRESS', 'production'],
  ] as const)('opens the exact %s document from a product', (type, kind) => {
    expect(activityTarget(record({ type }))).toEqual({
      type: 'document',
      kind,
      contractId: 'contract-a',
      documentId: 'doc-a',
    });
  });

  it('keeps stock events tied to their actual pool, not the entire contract', () => {
    const target = activityTarget(
      record({ type: 'STOCK_EVENT', poolId: 'pool/a', eventId: 'event:b' }),
    );
    expect(target).toEqual({
      type: 'stock',
      poolId: 'pool/a',
      eventId: 'event:b',
    });
    expect(navigationRoute(target!)).toEqual({
      path: '/gongchang/platform-stock',
      query: { poolId: 'pool/a', eventId: 'event:b' },
    });
    expect(
      activityTarget(record({ type: 'STOCK_EVENT', eventId: 'event:b' })),
    ).toBeUndefined();
    expect(
      activityTarget(record({ type: 'PURCHASE_ORDER', contractId: null })),
    ).toBeUndefined();
  });

  it('distinguishes missing quantities from zero and preserves decimal precision', () => {
    expect(quantityText(null, '张')).toBe('—');
    expect(quantityText('', '张')).toBe('—');
    expect(quantityText('0', '张')).toBe('0 张');
    expect(quantityText('123456789.12345678', '米')).toBe(
      '123,456,789.12345678 米',
    );
    expect(quantityText('-2.5', '米')).toBe('-2.5 米');
    expect(quantityText('NaN')).toBe('—');
  });

  it('displays units separately and never sums unrelated measures', () => {
    expect(
      activityQuantity(
        record({
          quantities: [
            { unit: '张', quantity: '20' },
            { unit: '套', quantity: 3 },
          ],
        }),
      ),
    ).toBe('20 张 / 3 套');
    expect(activityQuantity(record())).toBe('—');
  });

  it('uses original dates and does not invent times for missing records', () => {
    expect(activityDate(record({ businessDate: '2026-09-08' }))).toBe(
      '2026-09-08',
    );
    expect(activityDate(record())).toBe('时间未记录');
    expect(activityDate(record({ occurredAt: 'invalid' }))).toBe('时间未记录');
    expect(dateRangeError('2026-09-09', '2026-09-08')).toBe(
      '开始日期不能晚于结束日期',
    );
    expect(dateRangeError('2026-09-08', '2026-09-08')).toBe('');
  });

  it('keeps missing units explicit and gives unnamed documents readable labels', () => {
    expect(
      activityQuantity(record({ quantities: [{ quantity: 12, unit: null }] })),
    ).toBe('12 （单位未记录）');
    expect(
      activityName(
        record({
          type: 'PURCHASE_ORDER',
          name: null,
          supplierName: '蓝海工厂',
          documentId: 'abc12345-6789',
        }),
      ),
    ).toBe('蓝海工厂 · 采购单 · abc12345');
    expect(activityName(record({ type: 'STOCK_EVENT', name: 'RESERVE' }))).toBe(
      '预留',
    );
  });
});
