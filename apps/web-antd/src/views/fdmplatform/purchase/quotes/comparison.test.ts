import type { BusinessRecord, Contract } from '#/api/fdmplatform';

import { describe, expect, it } from 'vitest';

import {
  compareTaskQuotes,
  latestTaskQuotes,
  quotePlanDefault,
  quoteQuantityRange,
  quoteStatus,
} from './comparison';

function quote(overrides: Partial<BusinessRecord> = {}): BusinessRecord {
  return {
    id: 'quote-a',
    seriesId: 'series-a',
    version: 1,
    assignmentId: 'task',
    supplierId: 'supplier-a',
    supplierName: '工厂甲',
    currency: 'CNY',
    unit: '件',
    unitPrice: '0.1',
    minQuantity: 1,
    maxQuantity: 100,
    confirmed: true,
    validUntil: '2026-09-18',
    promisedDate: '2026-10-01',
    taxIncluded: true,
    freightIncluded: false,
    packagingIncluded: true,
    ...overrides,
  };
}
function fixture(quotes = [quote()]): Contract {
  return {
    id: 'contract-a',
    code: 'HT-1',
    name: '订单',
    companyId: 1,
    departmentId: 1,
    ownerUserId: 1,
    customerId: 'customer',
    customerName: '客户',
    currency: 'CNY',
    businessType: 'FOREIGN',
    status: 'CONFIRMED',
    version: 3,
    businessVersion: 1,
    allowedActions: ['SAVE_PLAN', 'CREATE_QUOTE'],
    items: [
      {
        id: 'item',
        skuId: 'sku',
        skuName: '瑜伽垫',
        specVersion: 'v1',
        specification: '标准',
        unit: '件',
        quantity: 100,
      },
    ],
    requests: [
      {
        id: 'request',
        name: '采购申请',
        status: 'ACTIVE',
        items: [{ id: 'request-line', contractItemId: 'item', quantity: 100 }],
      },
    ],
    assignments: [
      {
        id: 'task',
        requestId: 'request',
        requestItemId: 'request-line',
        contractItemId: 'item',
        method: 'BUY',
        quantity: 100,
        status: 'ASSIGNED',
      },
    ],
    quotes,
    purchaseOrders: [
      {
        id: 'order',
        status: 'ORDERED',
        lines: [
          {
            id: 'line',
            assignmentId: 'task',
            planLineId: 'plan-line',
            quantity: 30,
          },
        ],
      },
    ],
    plans: [
      {
        id: 'plan',
        requestId: 'request',
        status: 'APPROVED',
        version: 2,
        lines: [{ id: 'plan-line', assignmentId: 'task', quantity: 50 }],
      },
    ],
  };
}
const today = '2026-09-18';

describe('supplier quote comparison using the complete task', () => {
  it('keeps only latest versions per series and isolates tasks while retaining independent unversioned quotes', () => {
    const contract = fixture([
      quote(),
      quote({ id: 'quote-a2', version: 2 }),
      quote({
        id: 'other-task',
        assignmentId: 'other',
        seriesId: 'series-other',
      }),
      quote({ id: 'independent-1', seriesId: undefined }),
      quote({ id: 'independent-2', seriesId: undefined }),
      quote({ id: 'second-price-tier', seriesId: 'series-tier' }),
    ]);
    expect(latestTaskQuotes(contract, 'task').map((entry) => entry.id)).toEqual(
      ['quote-a2', 'independent-1', 'independent-2', 'second-price-tier'],
    );
    expect(latestTaskQuotes(contract, '')).toEqual([]);
  });
  it('uses decimal arithmetic for the subtotal and explicitly excludes unquoted freight', () => {
    const result = compareTaskQuotes(fixture(), 'task', 3, today);
    expect(result.entries[0]).toMatchObject({
      subtotal: '0.3',
      costNotes: ['小计未含运费'],
      canPlan: true,
      planQuantity: '50',
    });
    expect(result.comparable).toBe(false);
  });
  it('reuses the existing remaining plan quantity after both purchase plans and orders', () => {
    const contract = fixture();
    expect(quotePlanDefault(contract, contract.quotes![0]!)).toEqual({
      quantity: '50',
    });
    contract.plans![0]!.lines = [
      { id: 'plan-line', assignmentId: 'task', quantity: 100 },
    ];
    expect(
      compareTaskQuotes(contract, 'task', 10, today).entries[0],
    ).toMatchObject({
      canPlan: false,
      planReason: expect.stringContaining('全部编入方案'),
    });
  });
  it.each([
    ['currency', 'USD', '币种不同'],
    ['unit', '套', '计价单位不同'],
    ['taxIncluded', false, '税费口径不同'],
    ['freightIncluded', true, '运费口径不同'],
    ['packagingIncluded', false, '包装口径不同'],
  ])('does not compare subtotals when %s differs', (key, value, reason) => {
    const result = compareTaskQuotes(
      fixture([
        quote(),
        quote({ id: 'quote-b', seriesId: 'series-b', [key]: value }),
      ]),
      'task',
      10,
      today,
    );
    expect(result.comparable).toBe(false);
    expect(result.differences).toContain(reason);
  });
  it('allows equivalent quote subtotal comparison without ranking suppliers or changing the quote selection', () => {
    const result = compareTaskQuotes(
      fixture([
        quote(),
        quote({ id: 'quote-b', seriesId: 'series-b', unitPrice: '0.11' }),
      ]),
      'task',
      10,
      today,
    );
    expect(result.comparable).toBe(true);
    expect(result.entries.map((entry) => entry.subtotal)).toEqual(['1', '1.1']);
    expect(result).not.toHaveProperty('recommended');
  });
  it.each([
    [{ confirmed: false }, '报价尚未核实'],
    [{ validUntil: '2026-09-17' }, '报价已过期'],
    [{ validUntil: '2026-02-31' }, '有效期待补齐'],
    [{ promisedDate: undefined }, '承诺到货日待补齐'],
    [{ minQuantity: 11 }, '比较数量低于起订量'],
    [{ maxQuantity: 9 }, '比较数量超过适用上限'],
    [{ taxIncluded: undefined }, '税费口径待补齐'],
    [{ unit: '套' }, '计价单位与采购需求单位不同'],
    [{ unitPrice: null }, '单价待核实'],
  ])(
    'blocks misleading selection with incomplete or inapplicable quotes %j',
    (override, reason) => {
      const result = compareTaskQuotes(
        fixture([quote(override)]),
        'task',
        10,
        today,
      );
      expect(result.entries[0]?.canPlan).toBe(false);
      expect(result.entries[0]?.issues).toContain(reason);
    },
  );
  it('treats missing quantity and price as unknown instead of a free quote', () => {
    const result = compareTaskQuotes(
      fixture([quote({ unitPrice: undefined })]),
      'task',
      undefined,
      today,
    );
    expect(result.entries[0]?.subtotal).toBeUndefined();
    expect(result.entries[0]?.canPlan).toBe(false);
  });
  it('keeps missing-series suppliers visible but blocks a nullable-series collision rejected by the server', () => {
    const contract = fixture([
      quote({ id: 'legacy-a', seriesId: undefined, version: 1 }),
      quote({
        id: 'legacy-b',
        seriesId: null,
        supplierName: '另一供应商',
        version: 2,
      }),
    ]);
    const result = compareTaskQuotes(contract, 'task', 10, today);
    expect(result.entries).toHaveLength(2);
    expect(result.entries[0]).toMatchObject({
      canPlan: false,
      planReason: '历史报价版本关联待核实，请重新登记报价',
    });
    expect(result.entries[1]?.canPlan).toBe(true);
    expect(result.comparable).toBe(false);
  });
  it('validates units against the immutable purchase request snapshot, as the server does', () => {
    const contract = fixture();
    contract.items[0]!.unit = '套';
    contract.requests![0]!.items = [
      { id: 'request-line', specificationSnapshot: { unit: '件' } },
    ];
    const result = compareTaskQuotes(contract, 'task', 10, today);
    expect(result.sourceUnit).toBe('件');
    expect(result.entries[0]?.canPlan).toBe(true);
    contract.requests![0]!.items = [
      { id: 'request-line', specificationSnapshot: { unit: '箱' } },
    ];
    expect(
      compareTaskQuotes(contract, 'task', 10, today).entries[0]?.issues,
    ).toContain('计价单位与采购需求单位不同');
  });
  it('keeps comparison useful without mutation permission or with a cancelled source', () => {
    const contract = fixture();
    contract.allowedActions = [];
    expect(
      compareTaskQuotes(contract, 'task', 10, today).entries[0],
    ).toMatchObject({
      subtotal: '1',
      canPlan: false,
      planReason: '当前合同状态或权限不支持此操作，请刷新合同后核对',
    });
    contract.allowedActions = ['SAVE_PLAN'];
    contract.assignments![0]!.status = 'CANCELLED';
    expect(
      compareTaskQuotes(contract, 'task', 10, today).entries[0]?.canPlan,
    ).toBe(false);
  });
  it('reuses contract action restrictions even when action permissions remain available', () => {
    const contract = fixture();
    contract.status = 'DRAFT';
    expect(
      compareTaskQuotes(contract, 'task', 10, today).entries[0],
    ).toMatchObject({
      canPlan: false,
      planReason: expect.stringContaining('订单生效'),
    });
    contract.status = 'CONFIRMED';
    contract.blockReasons = ['资料尚不完整'];
    expect(
      compareTaskQuotes(contract, 'task', 10, today).entries[0]?.planReason,
    ).toContain('资料尚不完整');
  });
  it('considers the expiry day valid and keeps unknown dates visibly unknown', () => {
    expect(quoteStatus(quote(), today).label).toBe('已核实 · 有效');
    expect(quoteStatus(quote({ validUntil: undefined }), today).label).toBe(
      '有效期待补齐',
    );
    expect(
      quoteQuantityRange(
        quote({ minQuantity: undefined, maxQuantity: undefined }),
      ),
    ).toBe('未限定数量 · 件');
  });
});
