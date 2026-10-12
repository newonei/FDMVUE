import type { Contract } from '#/api/fdmplatform';

import { describe, expect, it } from 'vitest';

import { newQuoteForm } from '../quotes/quick-order';
import {
  assignErrors,
  assignPayload,
  assignRows,
  batchQuoteErrors,
  batchQuotePayload,
  requestQuoteRows,
  splitRow,
} from './request-batch';

const today = '2026-10-11';

function contract(): Contract {
  return {
    id: 'c1',
    version: 3,
    code: 'HT-001',
    items: [
      { id: 'item-a', skuName: '瑜伽垫', unit: '件' },
      { id: 'item-b', skuName: '瑜伽砖', unit: '个' },
      { id: 'item-c', skuName: '拉力带', unit: '条' },
    ],
    requests: [
      {
        id: 'r1',
        status: 'ACTIVE',
        items: [
          { id: 'ri-a', contractItemId: 'item-a', quantity: '30' },
          {
            id: 'ri-b',
            contractItemId: 'item-b',
            quantity: '10',
            ownerUserId: 9,
          },
          {
            id: 'ri-c',
            contractItemId: 'item-c',
            quantity: '5',
            openingAssignedQuantity: '5',
          },
        ],
      },
    ],
    assignments: [
      {
        id: 't1',
        requestId: 'r1',
        requestItemId: 'ri-a',
        contractItemId: 'item-a',
        method: 'BUY',
        quantity: '12',
      },
      {
        id: 't2',
        requestId: 'r1',
        requestItemId: 'ri-b',
        contractItemId: 'item-b',
        method: 'BUY',
        quantity: '10',
      },
      {
        id: 't3',
        requestId: 'r1',
        requestItemId: 'ri-a',
        contractItemId: 'item-a',
        method: 'MAKE',
        quantity: '3',
        status: 'CANCELLED',
      },
    ],
    quotes: [
      {
        id: 'q1',
        seriesId: 'q1',
        version: 1,
        assignmentId: 't2',
        supplierName: '乙厂',
        currency: 'CNY',
        unitPrice: '8',
        confirmed: true,
        validUntil: '2026-12-31',
      },
    ],
    plans: [],
    purchaseOrders: [],
  } as unknown as Contract;
}

describe('按单分派', () => {
  it('每个还有余量的产品一行，默认整笔外采，沿用路由经办人', () => {
    const rows = assignRows(contract(), 'r1', 7);
    expect(
      rows.map((row) => [row.title, row.remaining, row.ownerUserId]),
    ).toEqual([['瑜伽垫', '18', 7]]);
    expect(rows[0]).toMatchObject({ method: 'BUY', quantity: '18' });
    expect(assignRows(contract(), 'missing')).toEqual([]);
  });

  it('拆分行取剩余数量，合计超量和自产缺工厂逐行提示', () => {
    const rows = assignRows(contract(), 'r1', 7);
    rows[0]!.quantity = '10';
    const split = splitRow(rows, rows[0]!);
    expect(split).toMatchObject({ split: true, method: 'MAKE', quantity: '8' });
    const all = [...rows, split];
    expect(assignErrors(all)).toEqual({ [split.key]: '自产请填写承接工厂' });
    split.factoryId = '一车间';
    split.quantity = '9';
    expect(assignErrors(all)[rows[0]!.key]).toContain('超过待分派 18');
    split.quantity = '8';
    expect(assignErrors(all)).toEqual({});
    expect(assignPayload('r1', all)).toEqual({
      requestId: 'r1',
      lines: [
        {
          requestId: 'r1',
          requestItemId: 'ri-a',
          method: 'BUY',
          quantity: '10',
          ownerUserId: 7,
        },
        {
          requestId: 'r1',
          requestItemId: 'ri-a',
          method: 'MAKE',
          quantity: '8',
          ownerUserId: 7,
          factoryId: '一车间',
        },
      ],
    });
  });

  it('数量留空的行不提交', () => {
    const rows = assignRows(contract(), 'r1', 7);
    rows[0]!.quantity = undefined;
    expect(assignErrors(rows)).toEqual({});
    expect(assignPayload('r1', rows).lines).toEqual([]);
  });
});

describe('按单报价', () => {
  it('列出申请里未下单的外采任务并附现有最低报价', () => {
    const rows = requestQuoteRows(contract(), 'r1', today);
    expect(
      rows.map((row) => [row.assignmentId, row.quantity, row.unit]),
    ).toEqual([
      ['t1', '12', '件'],
      ['t2', '10', '个'],
    ]);
    expect(rows[1]!.best).toEqual({
      supplierName: '乙厂',
      currency: 'CNY',
      unitPrice: '8',
    });
  });

  it('整单条件共用，只提交填了单价的行，行交期覆盖整单交期', () => {
    const rows = requestQuoteRows(contract(), 'r1', today);
    const form = {
      ...newQuoteForm(undefined, today),
      supplierId: 's1',
      supplierName: '甲厂',
    };
    let errors = batchQuoteErrors(form, rows, 0, today);
    expect(errors.sheet).toMatchObject({
      lines: '至少填写一个产品的单价',
      evidence: expect.any(String),
      promisedDate: expect.any(String),
    });
    rows[0]!.unitPrice = '15';
    rows[0]!.promisedDate = '2026-10-20';
    errors = batchQuoteErrors(form, rows, 1, today);
    expect(errors).toEqual({ sheet: {}, lines: {} });
    rows[1]!.unitPrice = '-1';
    expect(batchQuoteErrors(form, rows, 1, today).lines).toEqual({
      t2: '单价需为不小于 0 的数字',
    });
    rows[1]!.unitPrice = '9';
    form.promisedDate = '2026-10-25';
    const payload = batchQuotePayload(form, rows);
    expect(payload).toMatchObject({
      supplierId: 's1',
      promisedDate: '2026-10-25',
      confirmed: true,
      lines: [
        {
          assignmentId: 't1',
          unitPrice: '15',
          unit: '件',
          promisedDate: '2026-10-20',
        },
        { assignmentId: 't2', unitPrice: '9', unit: '个' },
      ],
    });
  });
});
