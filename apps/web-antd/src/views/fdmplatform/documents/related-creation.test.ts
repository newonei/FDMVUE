import type { Contract } from '#/api/fdmplatform';

import { describe, expect, it } from 'vitest';

import { initialFormValues, settleSources } from './formDefaults';
import { relatedActionDefinition } from './related-creation';

function fixture(): Contract {
  return {
    id: 'c',
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
    allowedActions: [],
    items: [
      {
        id: 'item',
        skuId: 'sku',
        skuName: '瑜伽垫',
        specVersion: 'v1',
        specification: '标准',
        unit: '套',
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
    quotes: [
      {
        id: 'quote',
        assignmentId: 'task',
        seriesId: 'series',
        version: 1,
        unit: '套',
        currency: 'CNY',
        supplierName: '工厂',
      },
    ],
    purchaseOrders: [
      {
        id: 'order',
        status: 'ORDERED',
        lines: [
          {
            id: 'line',
            contractItemId: 'item',
            assignmentId: 'task',
            planLineId: 'plan-line',
            quantity: 30,
            arrivedQuantity: 20,
            returnedQuantity: 2,
            cancelledQuantity: 1,
          },
        ],
      },
      {
        id: 'other-order',
        status: 'ORDERED',
        lines: [{ id: 'other-line', quantity: 10 }],
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
    arrivals: [
      {
        id: 'arrival',
        orderId: 'order',
        quantity: 20,
        acceptedQuantity: 18,
        returnedAcceptedQuantity: 2,
        exceptionQuantity: 2,
        returnedExceptionQuantity: 2,
      },
      {
        id: 'other-arrival',
        orderId: 'other-order',
        quantity: 5,
        acceptedQuantity: 5,
      },
    ],
  };
}

describe('creation from an authoritative related document', () => {
  it('creates a new quote tied to its BUY task without treating the task as a quote revision', () => {
    const definition = relatedActionDefinition(
      fixture(),
      'quotes',
      'CREATE_QUOTE',
      { kind: 'tasks', id: 'task' },
      [],
      [],
    );
    expect(definition.initialValues).toMatchObject({
      assignmentId: 'task',
      unit: '套',
    });
    expect(definition.initialValues).not.toHaveProperty('previousQuoteId');
    expect(
      definition.fields.find((field) => field.key === 'assignmentId'),
    ).toMatchObject({ disabled: true, options: [{ value: 'task' }] });
  });

  it('rejects stale or wrong-kind source records and a BUY task used to create production', () => {
    expect(() =>
      relatedActionDefinition(
        fixture(),
        'quotes',
        'CREATE_QUOTE',
        { kind: 'tasks', id: 'missing' },
        [],
        [],
      ),
    ).toThrow('当前单据');
    expect(() =>
      relatedActionDefinition(
        fixture(),
        'production',
        'UPDATE_PRODUCTION',
        { kind: 'tasks', id: 'task' },
        [],
        [],
      ),
    ).toThrow('不支持');
  });

  it('prefills a fresh plan with the source quote and unallocated balance after existing orders and plans', () => {
    const definition = relatedActionDefinition(
      fixture(),
      'plans',
      'SAVE_PLAN',
      { kind: 'quotes', id: 'quote' },
      [],
      [],
    );
    expect(definition.initialValues).toMatchObject({
      requestId: 'request',
      lines: [{ assignmentId: 'task', quoteId: 'quote', quantity: '50' }],
    });
    expect(definition.initialValues).not.toHaveProperty('id');
    expect(
      definition.fields.find((field) => field.key === 'requestId')?.disabled,
    ).toBe(true);
  });

  it('does not offer another plan when the task is fully occupied, or use superseded quotes', () => {
    const contract = fixture();
    contract.plans![0]!.lines = [
      { id: 'plan-line', assignmentId: 'task', quantity: 100 },
    ];
    expect(() =>
      relatedActionDefinition(
        contract,
        'plans',
        'SAVE_PLAN',
        { kind: 'quotes', id: 'quote' },
        [],
        [],
      ),
    ).toThrow('全部编入方案');
    const changed = fixture();
    changed.quotes!.push({ id: 'new-quote', seriesId: 'series', version: 2 });
    expect(() =>
      relatedActionDefinition(
        changed,
        'plans',
        'SAVE_PLAN',
        { kind: 'quotes', id: 'quote' },
        [],
        [],
      ),
    ).toThrow('新版本');
  });

  it('locks the current order while selecting only its available lines and pre-filling remaining arrival quantities', () => {
    const definition = relatedActionDefinition(
      fixture(),
      'arrivals',
      'RECORD_ARRIVAL',
      { kind: 'orders', id: 'order' },
      [],
      [],
    );
    const state = initialFormValues(
      definition.fields,
      definition.initialValues,
    );
    settleSources(definition.fields, state.values, {}, state.auto);
    expect(state.values).toMatchObject({
      orderId: 'order',
      orderLineId: 'line',
      quantity: '11',
      acceptedQuantity: '11',
    });
    expect(
      definition.fields.find((field) => field.key === 'orderId')?.disabled,
    ).toBe(true);
  });

  it('restricts order-based returns to its own arrivals, and excludes exhausted return categories', () => {
    const definition = relatedActionDefinition(
      fixture(),
      'purchaseReturns',
      'RETURN_ARRIVAL',
      { kind: 'orders', id: 'order' },
      [],
      [],
    );
    const state = initialFormValues(
      definition.fields,
      definition.initialValues,
    );
    settleSources(definition.fields, state.values, {}, state.auto);
    expect(state.values).toMatchObject({
      arrivalId: 'arrival',
      kind: 'ACCEPTED',
      quantity: '16',
    });
    expect(
      definition.fields
        .find((field) => field.key === 'arrivalId')
        ?.options?.map((option) => option.value),
    ).toEqual(['arrival']);
  });

  it('locks the original arrival when creating a return and rejects closed orders', () => {
    const contract = fixture();
    const definition = relatedActionDefinition(
      contract,
      'purchaseReturns',
      'RETURN_ARRIVAL',
      { kind: 'arrivals', id: 'arrival' },
      [],
      [],
    );
    expect(definition.initialValues).toMatchObject({ arrivalId: 'arrival' });
    expect(
      definition.fields.find((field) => field.key === 'arrivalId')?.disabled,
    ).toBe(true);
    contract.purchaseOrders![0]!.status = 'CLOSED';
    expect(() =>
      relatedActionDefinition(
        contract,
        'purchaseReturns',
        'RETURN_ARRIVAL',
        { kind: 'arrivals', id: 'arrival' },
        [],
        [],
      ),
    ).toThrow('已结束');
  });

  it('requires approval for production and keeps the latest cumulative progress', () => {
    const contract = fixture();
    contract.assignments![0]!.method = 'MAKE';
    expect(() =>
      relatedActionDefinition(
        contract,
        'production',
        'UPDATE_PRODUCTION',
        { kind: 'tasks', id: 'task' },
        [],
        [],
      ),
    ).toThrow('生效');
    contract.plans![0]!.approvals = [
      {
        id: 'approval',
        approved: true,
        invalidated: false,
        planVersion: 2,
        scopes: [{ planLineId: 'plan-line', quantity: 50 }],
      },
    ];
    contract.productionProgress = [
      {
        id: 'progress',
        assignmentId: 'task',
        completedQuantity: 30,
        status: 'IN_PROGRESS',
      },
    ];
    const definition = relatedActionDefinition(
      contract,
      'production',
      'UPDATE_PRODUCTION',
      { kind: 'tasks', id: 'task' },
      [],
      [],
    );
    expect(definition.initialValues).toMatchObject({
      assignmentId: 'task',
      completedQuantity: 30,
      status: 'IN_PROGRESS',
    });
  });

  it('locks the approved plan version and refuses to generate an empty purchase order', () => {
    const contract = fixture();
    contract.plans![0]!.lines = [
      { id: 'plan-line', assignmentId: 'task', method: 'BUY', quantity: 50 },
    ];
    contract.plans![0]!.approvals = [
      {
        id: 'approval',
        approved: true,
        invalidated: false,
        planVersion: 2,
        scopes: [{ planLineId: 'plan-line', quantity: 50 }],
      },
    ];
    const definition = relatedActionDefinition(
      contract,
      'orders',
      'GENERATE_ORDERS',
      { kind: 'plans', id: 'plan' },
      [],
      [],
    );
    expect(definition.initialValues).toMatchObject({
      planId: 'plan',
      planVersion: 2,
    });
    contract.purchaseOrders![0]!.lines = [
      { id: 'line', planLineId: 'plan-line', quantity: 50 },
    ];
    expect(() =>
      relatedActionDefinition(
        contract,
        'orders',
        'GENERATE_ORDERS',
        { kind: 'plans', id: 'plan' },
        [],
        [],
      ),
    ).toThrow('已无可下单');
  });
});
