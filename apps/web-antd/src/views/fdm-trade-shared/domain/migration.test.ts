import { describe, expect, it } from 'vitest';

import {
  isTradePrototypeState,
  migrateLegacySnapshot,
  parseStoredJson,
  resolvePrototypeSnapshot,
} from './migration';
import { createTradePrototypeSeed } from './mock-data';

describe('foreign-trade prototype snapshot migration', () => {
  it('accepts a complete v2 snapshot without sharing references', () => {
    const seed = createTradePrototypeSeed();
    const resolution = resolvePrototypeSnapshot(seed);

    expect(resolution.source).toBe('v2');
    expect(resolution.snapshot).toEqual(seed);
    expect(resolution.snapshot).not.toBe(seed);
    expect(isTradePrototypeState(resolution.snapshot)).toBe(true);
  });

  it('migrates the current v1 customer, order, demand and receipt shapes', () => {
    const legacy = {
      audits: [
        {
          action: '旧版人工确认',
          actor: '测试用户',
          id: 'AUD-V1',
          result: '成功',
          time: '2026-08-20 10:00',
          type: '人工确认',
        },
      ],
      customers: [
        {
          code: 'FT-CUS-V1',
          contact: 'Anna',
          country: '德国',
          email: 'anna@example.test',
          id: 'CUS-V1',
          level: 'A',
          name: 'V1 Customer',
          orderCount: 1,
          outstandingAmount: 1000,
          owner: '林晓月',
          syncStatus: '已同步',
          transactionAmount: 1000,
        },
      ],
      demandLines: [
        {
          amount: 1000,
          factoryQty: 40,
          id: 'LINE-V1',
          orderId: 'SO-V1',
          productName: '迁移产品',
          purchaseQty: 50,
          quantity: 100,
          sku: 'SKU-V1',
          stockQty: 10,
          unit: '套',
          unitPrice: 10,
        },
      ],
      journey: { analysisStatus: 'AI草稿' },
      okkiCustomers: [],
      orders: [
        {
          currency: 'USD',
          customerId: 'CUS-V1',
          exchangeRate: 7.18,
          id: 'SO-V1',
          risk: '中',
          status: '执行中',
          totalAmount: 1000,
          type: '大货订单',
        },
      ],
      purchaseRequests: [
        {
          id: 'PR-V1',
          orderId: 'SO-V1',
          requiredAt: '2026-09-01',
          risk: '旧版风险说明',
          status: '草稿 · 未提交',
        },
      ],
      receipts: [
        {
          allocatedAmount: 600,
          amount: 600,
          currency: 'USD',
          id: 'RC-V1',
          orderId: 'SO-V1',
          rate: 7.18,
        },
      ],
      writeOffItems: [
        {
          amount: 100,
          id: 'WO-V1',
          orderId: 'SO-V1',
          type: '客户余额消费',
        },
      ],
    };

    const migrated = migrateLegacySnapshot(legacy);
    expect(isTradePrototypeState(migrated)).toBe(true);
    expect(migrated.orders[0]?.totalAmount).toBe('1000.00');
    expect(migrated.orders[0]?.lines[0]?.quantity).toBe('100');
    expect(migrated.demandAnalyses[0]?.status).toBe('AI_DRAFT');
    expect(migrated.receiptAllocations[0]?.amount).toBe('600.00');
    expect(migrated.purchaseRequisitions[0]?.id).toBe('PR-V1');
    expect(migrated.purchaseRequisitions[0]?.status).toBe('DRAFT');
    expect(migrated.writeOffItems[0]?.kind).toBe('CUSTOMER_BALANCE');
    expect(migrated.documentRelations.length).toBeGreaterThan(0);
  });

  it('tolerates malformed storage and falls back to a fresh seed', () => {
    expect(parseStoredJson('{bad-json')).toBeUndefined();
    const resolution = resolvePrototypeSnapshot({ schemaVersion: 2 }, 'bad');
    expect(resolution.source).toBe('seed');
    expect(isTradePrototypeState(resolution.snapshot)).toBe(true);

    const nestedMalformed = createTradePrototypeSeed() as unknown as Record<
      string,
      unknown
    >;
    nestedMalformed.customers = [null];
    expect(isTradePrototypeState(nestedMalformed)).toBe(false);
  });
});
