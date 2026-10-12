import type { StockIn } from '#/api/fdmplatform/warehouse';

import { describe, expect, it } from 'vitest';

import {
  canReturn,
  canVoidStockIn,
  returnErrors,
  returnPayload,
  returnRows,
  txnLabel,
} from './return-model';

const stockIn = (lines: Partial<StockIn['lines'][number]>[]): StockIn => ({
  id: 'in-1',
  code: 'RK20261012001',
  status: 'RECEIVED',
  warehouseId: 'wh',
  warehouseName: '武汉仓库',
  contractId: 'c',
  contractCode: 'HT-1',
  orderId: 'o',
  orderCode: 'CG20261012001',
  receivedDate: '2026-10-12',
  directShip: false,
  createdBy: 1,
  createdAt: '2026-10-12T00:00:00Z',
  lines: lines.map((line, index) => ({
    orderLineId: `l${index}`,
    productName: `产品${index}`,
    quantity: '0',
    acceptedQuantity: '0',
    exceptionQuantity: '0',
    ...line,
  })),
});

describe('purchase return model', () => {
  it('lists returnable accepted and exception quantities, minus what was already returned', () => {
    const rows = returnRows(
      stockIn([
        {
          quantity: '40',
          acceptedQuantity: '38',
          exceptionQuantity: '2',
          returnedAcceptedQuantity: '5',
        },
        {
          quantity: '10',
          acceptedQuantity: '10',
          returnedAcceptedQuantity: '10',
        },
      ]),
    );
    expect(rows.map((row) => [row.key, row.available])).toEqual([
      ['l0:ACCEPTED', '33'],
      ['l0:EXCEPTION', '2'],
    ]);
  });

  it('only voids untouched stock-ins and only returns when something is left', () => {
    const fresh = stockIn([{ acceptedQuantity: '5' }]);
    expect(canVoidStockIn(fresh)).toBe(true);
    expect(canReturn(fresh)).toBe(true);
    const returned = stockIn([
      { acceptedQuantity: '5', returnedAcceptedQuantity: '5' },
    ]);
    expect(canVoidStockIn(returned)).toBe(false);
    expect(canReturn(returned)).toBe(false);
    expect(canVoidStockIn({ ...fresh, status: 'VOIDED' })).toBe(false);
    expect(canReturn({ ...fresh, status: 'VOIDED' })).toBe(false);
  });

  it('validates quantities and reason, then submits only filled rows', () => {
    const rows = returnRows(
      stockIn([{ acceptedQuantity: '8', exceptionQuantity: '2' }]),
    );
    expect(returnErrors({ reason: '' }, rows).sheet).toBe(
      '至少填写一行退货数量',
    );
    rows[0]!.quantity = '9';
    expect(returnErrors({ reason: '色差' }, rows).lines).toEqual({
      'l0:ACCEPTED': '最多可退 8',
    });
    rows[0]!.quantity = '3';
    expect(returnErrors({ reason: ' ' }, rows).sheet).toBe('请填写退货原因');
    expect(
      returnPayload(
        { noReplacement: true, reason: ' 色差 ', returnedDate: '' },
        rows,
        { idempotencyKey: 'k', stockInId: 'in-1' },
      ),
    ).toEqual({
      idempotencyKey: 'k',
      stockInId: 'in-1',
      returnedDate: undefined,
      reason: '色差',
      noReplacement: true,
      remark: undefined,
      lines: [{ orderLineId: 'l0', kind: 'ACCEPTED', quantity: '3' }],
    });
  });

  it('names ledger rows by action, falling back to direction for old rows', () => {
    expect(txnLabel({ type: 'OUT', action: 'PURCHASE_RETURN' })).toBe(
      '采购退货',
    );
    expect(txnLabel({ type: 'IN', action: 'VOID_STOCK_OUT' })).toBe('作废出库');
    expect(txnLabel({ type: 'IN' })).toBe('采购入库');
  });
});
