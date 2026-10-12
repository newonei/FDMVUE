import type { ProcurementOrderRow } from '#/api/fdmplatform/procurement';

import { describe, expect, it } from 'vitest';

import {
  batchOrders,
  batchProblem,
  batchSelectable,
  requestFormProblem,
  requestPayloads,
} from './batch-model';

function row(extra: Partial<ProcurementOrderRow> = {}): ProcurementOrderRow {
  return {
    id: 'o1',
    contractId: 'c1',
    orderCode: 'CG001',
    unpaidAmount: '100',
    operationStatus: 'IN_PROGRESS',
    record: {
      id: 'o1',
      supplierId: 's1',
      supplierName: '工厂甲',
      currency: 'CNY',
    },
    ...extra,
  } as ProcurementOrderRow;
}

describe('采购单批量操作', () => {
  it('skips 金智 history orders and keys standalone orders by their document', () => {
    expect(batchSelectable(row({ standaloneId: 'jz-1' }))).toBe(false);
    expect(
      batchSelectable(row({ standaloneId: 'n-1', nativeStandalone: true })),
    ).toBe(true);
    const [standalone] = batchOrders([
      row({
        standaloneId: 'n-1',
        nativeStandalone: true,
        contractId: undefined,
      }),
    ]);
    expect(standalone).toMatchObject({
      key: 'n-1',
      contractId: '',
      orderId: 'n-1',
    });
  });

  it('pays and receives one supplier at a time, but ends anything', () => {
    const a = batchOrders([row()]);
    const b = batchOrders([
      row({
        id: 'o2',
        record: {
          id: 'o2',
          supplierId: 's2',
          supplierName: '工厂乙',
          currency: 'CNY',
        },
      }),
    ]);
    expect(batchProblem([...a, ...b], 'request')).toBe(
      '一次只能办理同一家供应商的采购单',
    );
    expect(batchProblem([...a, ...b], 'end')).toBe('');
    expect(
      batchProblem(batchOrders([row({ unpaidAmount: '0' })]), 'request'),
    ).toBe('选中的采购单都已付清');
    expect(batchProblem([], 'stockIn')).toBe('请先勾选采购单');
  });

  it('builds one approved request per order with the shared payee and evidence', () => {
    const orders = batchOrders([row(), row({ id: 'o2', orderCode: 'CG002' })]);
    const form = {
      payerEntityId: 'pay',
      payeeName: '工厂甲',
      payeeAccount: '6222',
      remark: '货款',
      evidence: 'DZ-1',
    };
    expect(
      requestFormProblem({ ...form, evidence: '' }, { o1: '50' }),
    ).toContain('凭据');
    const payloads = requestPayloads(orders, { o1: '50', o2: '' }, form);
    expect(payloads).toHaveLength(1);
    expect(payloads[0]!.payload).toMatchObject({
      orderId: 'o1',
      amount: '50',
      name: 'CG001 货款',
      evidenceRefs: ['external:DZ-1'],
    });
  });
});
