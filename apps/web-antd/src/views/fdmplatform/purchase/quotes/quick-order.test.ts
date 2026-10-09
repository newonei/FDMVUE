import type { BusinessRecord, Contract } from '#/api/fdmplatform';

import { describe, expect, it } from 'vitest';

import {
  dueBadge,
  mainlineStates,
  shortTitle,
  visibleStages,
} from '../tasks/model';
import {
  addDays,
  cheaperQuote,
  createdOrders,
  daysBetween,
  newQuoteForm,
  orderLines,
  quotableTasks,
  quoteFormErrors,
  quotePayload,
  taskContext,
} from './quick-order';

const today = '2026-10-08';
function quote(overrides: Partial<BusinessRecord> = {}): BusinessRecord {
  return {
    id: 'quote-a',
    seriesId: 'series-a',
    version: 1,
    assignmentId: 'task-a',
    supplierId: 'supplier-a',
    supplierName: '工厂甲',
    currency: 'CNY',
    unit: '件',
    unitPrice: '10',
    confirmed: true,
    validUntil: '2026-10-20',
    promisedDate: '2026-10-15',
    taxIncluded: true,
    freightIncluded: false,
    packagingIncluded: true,
    ...overrides,
  };
}
function task(id: string, item: string, quantity: number): BusinessRecord {
  return {
    id,
    requestId: 'request',
    requestItemId: `line-${item}`,
    contractItemId: item,
    method: 'BUY',
    quantity,
    status: 'ASSIGNED',
  };
}
function fixture(quotes: BusinessRecord[] = [quote()]): Contract {
  return {
    id: 'contract-a',
    code: 'HT-1',
    name: '订单',
    companyId: 1,
    departmentId: 1,
    ownerUserId: 1,
    customerId: 'customer',
    customerName: '客户',
    currency: 'USD',
    businessType: 'FOREIGN',
    status: 'EXECUTING',
    version: 3,
    businessVersion: 1,
    allowedActions: ['CREATE_QUOTE', 'ORDER_FROM_QUOTE'],
    items: [
      {
        id: 'a',
        skuId: 'sku-a',
        skuName: '瑜伽垫',
        specVersion: 'v1',
        specification: '183*61',
        unit: '件',
        quantity: 100,
      },
      {
        id: 'b',
        skuId: 'sku-b',
        skuName: '瑜伽砖',
        specVersion: 'v1',
        specification: '23*15',
        unit: '件',
        quantity: 40,
      },
    ],
    requests: [
      {
        id: 'request',
        status: 'ACTIVE',
        items: [
          {
            id: 'line-a',
            contractItemId: 'a',
            quantity: 100,
            requiredDate: '2026-10-12',
            specificationSnapshot: {
              skuName: '瑜伽垫',
              unit: '件',
              specification: '183*61',
            },
          },
          {
            id: 'line-b',
            contractItemId: 'b',
            quantity: 40,
            specificationSnapshot: { skuName: '瑜伽砖', unit: '件' },
          },
        ],
      },
    ],
    assignments: [task('task-a', 'a', 100), task('task-b', 'b', 40)],
    quotes,
    plans: [],
    purchaseOrders: [],
  };
}

describe('dates', () => {
  it('adds days across month ends and counts days between dates', () => {
    expect(addDays('2026-10-25', 15)).toBe('2026-11-09');
    expect(daysBetween('2026-10-12', '2026-10-15')).toBe(3);
    expect(daysBetween('2026-10-15', '2026-10-12')).toBe(-3);
    expect(daysBetween('bad', '2026-10-12')).toBeUndefined();
  });
});

describe('quote entry', () => {
  it('takes the unit and quantity from the request and defaults to CNY for 15 days', () => {
    const context = taskContext(fixture(), 'task-a')!;
    expect(context).toMatchObject({
      title: '瑜伽垫',
      unit: '件',
      requiredDate: '2026-10-12',
      plannable: '100',
    });
    expect(newQuoteForm(context, today)).toMatchObject({
      currency: 'CNY',
      unit: '件',
      validUntil: '2026-10-23',
      taxIncluded: false,
    });
  });
  it('lists every open BUY task for the stand-alone entry', () => {
    const contract = fixture();
    contract.assignments!.push(
      { ...task('task-c', 'a', 5), method: 'MAKE' },
      { ...task('task-d', 'b', 5), status: 'CANCELLED' },
    );
    expect(quotableTasks(contract).map((entry) => entry.assignment.id)).toEqual(
      ['task-a', 'task-b'],
    );
  });
  it('requires supplier, price, promised date, a future validity and evidence', () => {
    const form = newQuoteForm(taskContext(fixture(), 'task-a'), today);
    expect(Object.keys(quoteFormErrors(form, 0, today)).toSorted()).toEqual([
      'evidence',
      'promisedDate',
      'supplierId',
      'unitPrice',
    ]);
    const filled = {
      ...form,
      supplierId: 's',
      unitPrice: '12.5',
      promisedDate: '2026-10-20',
      validUntil: '2026-10-01',
    };
    expect(quoteFormErrors(filled, 1, today)).toEqual({
      validUntil: '有效期不能早于今天',
    });
    expect(
      quoteFormErrors(
        { ...filled, validUntil: today, evidenceIds: ['f'] },
        0,
        today,
      ),
    ).toEqual({});
    expect(
      quoteFormErrors(
        { ...filled, validUntil: today, minQuantity: '50', maxQuantity: '10' },
        1,
        today,
      ),
    ).toEqual({ maxQuantity: '最高数量不能小于最低数量' });
  });
  it('always sends explicit price terms and a confirmed quote, leaving optional fields out', () => {
    const form = {
      ...newQuoteForm(taskContext(fixture(), 'task-a'), today),
      supplierId: 's',
      supplierName: '工厂',
      unitPrice: '12',
      promisedDate: '2026-10-20',
      taxIncluded: true,
    };
    const payload = quotePayload('task-a', form);
    expect(payload).toMatchObject({
      assignmentId: 'task-a',
      taxIncluded: true,
      freightIncluded: false,
      packagingIncluded: false,
      confirmed: true,
      unit: '件',
    });
    expect(payload).not.toHaveProperty('minQuantity');
    expect(payload).not.toHaveProperty('previousQuoteId');
    expect(
      quotePayload('task-a', {
        ...form,
        remark: '  核对过  ',
        previousQuoteId: 'q',
      }),
    ).toMatchObject({ remark: '核对过', previousQuoteId: 'q' });
  });
});

describe('选价下单', () => {
  it('needs a reason only when a like-for-like valid quote is cheaper', () => {
    const cheap = quote({
      id: 'cheap',
      seriesId: 'cheap',
      supplierId: 's2',
      supplierName: '工厂乙',
      unitPrice: '9',
    });
    const otherTerms = quote({
      id: 'other',
      seriesId: 'other',
      supplierId: 's3',
      unitPrice: '1',
      freightIncluded: true,
    });
    const expired = quote({
      id: 'old',
      seriesId: 'old',
      supplierId: 's4',
      unitPrice: '2',
      validUntil: '2026-10-01',
    });
    const contract = fixture([quote(), cheap, otherTerms, expired]);
    expect(cheaperQuote(contract, quote(), 100, today)?.id).toBe('cheap');
    expect(cheaperQuote(contract, cheap, 100, today)).toBeUndefined();
    expect(
      cheaperQuote(
        fixture([quote(), { ...cheap, maxQuantity: 50 }]),
        quote(),
        100,
        today,
      ),
    ).toBeUndefined();
  });
  it('orders the remaining task quantity and offers the same supplier for the other products', () => {
    const forB = quote({
      id: 'quote-b',
      seriesId: 'b',
      assignmentId: 'task-b',
      unitPrice: '3',
    });
    const otherSupplier = quote({
      id: 'quote-c',
      seriesId: 'c',
      assignmentId: 'task-b',
      supplierId: 'supplier-z',
      unitPrice: '1',
    });
    const contract = fixture([quote(), forB, otherSupplier]);
    contract.purchaseOrders = [
      { id: 'po', lines: [{ id: 'l', assignmentId: 'task-a', quantity: 30 }] },
    ];
    const result = orderLines(contract, 'quote-a', today);
    expect(result.reason).toBeUndefined();
    expect(result.primary?.quantity).toBe('70');
    expect(
      result.companions.map((line) => [line.quote.id, line.quantity]),
    ).toEqual([['quote-b', '40']]);
  });
  it('explains why a quote cannot be ordered', () => {
    expect(
      orderLines(
        fixture([quote({ validUntil: '2026-10-01' })]),
        'quote-a',
        today,
      ).reason,
    ).toContain('已过期');
    expect(
      orderLines(fixture([quote({ confirmed: false })]), 'quote-a', today)
        .reason,
    ).toBe('报价尚未核实');
    expect(
      orderLines(fixture([quote({ unit: '套' })]), 'quote-a', today).reason,
    ).toContain('需求单位「件」');
    const full = fixture();
    full.plans = [
      {
        id: 'p',
        status: 'DRAFT',
        lines: [{ id: 'pl', assignmentId: 'task-a', quantity: 100 }],
      },
    ];
    expect(orderLines(full, 'quote-a', today).reason).toContain('已全部编入');
    expect(orderLines(fixture(), 'missing', today).reason).toContain('不存在');
  });
  it('finds the purchase orders the action created', () => {
    const before = fixture();
    before.purchaseOrders = [{ id: 'old' }];
    const after = {
      ...before,
      purchaseOrders: [{ id: 'old' }, { id: 'new', code: 'CG1' }],
    };
    expect(createdOrders(before, after).map((order) => order.id)).toEqual([
      'new',
    ]);
  });
});

describe('workbench helpers', () => {
  it('counts down to the expected arrival date', () => {
    expect(dueBadge(undefined, today)).toEqual({
      text: '未约定',
      tone: 'muted',
    });
    expect(dueBadge('2026-09-07', today)).toEqual({
      text: '超期 31 天',
      tone: 'danger',
    });
    expect(dueBadge(today, today)).toEqual({ text: '今天到期', tone: 'warn' });
    expect(dueBadge('2026-10-11', today)).toEqual({
      text: '3 天后到期',
      tone: 'warn',
    });
    expect(dueBadge('2026-10-12', today)).toEqual({
      text: '2026-10-12',
      tone: '',
    });
  });
  it('maps stages onto the five-step main line', () => {
    expect(mainlineStates('intake')).toEqual([
      'active',
      'todo',
      'todo',
      'todo',
      'todo',
    ]);
    expect(mainlineStates('plan')).toEqual([
      'done',
      'done',
      'active',
      'todo',
      'todo',
    ]);
  });
  it('hides retired stages and shows old-style plan stages only when they have work', () => {
    expect(
      visibleStages({ order: 0, review: 0 }).map((stage) => stage.key),
    ).toEqual(['all', 'intake', 'quote', 'plan']);
    expect(visibleStages({ order: 2 }).map((stage) => stage.key)).toContain(
      'order',
    );
  });
  it('shortens multi-product titles', () => {
    expect(shortTitle('瑜伽垫')).toBe('瑜伽垫');
    expect(shortTitle('甲、乙、丙')).toBe('甲 等 3 项');
  });
});
