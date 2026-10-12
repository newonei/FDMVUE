import type { ProcurementSetting } from '#/api/fdmplatform/procurement';
import type { InboundLine, OutboundItem } from '#/api/fdmplatform/warehouse';

import { describe, expect, it } from 'vitest';

import {
  averageCost,
  defaultWarehouse,
  inboundRows,
  linesTitle,
  outboundRows,
  stockInErrors,
  stockInPayload,
  stockOutErrors,
  stockOutPayload,
} from './model';

const warehouse = (
  id: string,
  extra: Partial<ProcurementSetting> = {},
): ProcurementSetting => ({ id, version: 0, name: id, active: true, ...extra });

const line = (orderLineId: string, remaining: number): InboundLine => ({
  contractId: 'c',
  contractCode: 'HT-1',
  orderId: 'o',
  orderLineId,
  contractItemId: `item-${orderLineId}`,
  productName: '瑜伽垫',
  unit: '条',
  quantity: 100,
  arrivedQuantity: 100 - remaining,
  remainingQuantity: remaining,
});

describe('仓库与采购入库', () => {
  it('picks the default warehouse, else the only active one', () => {
    expect(
      defaultWarehouse([warehouse('a'), warehouse('b', { isDefault: true })]),
    ).toBe('b');
    expect(
      defaultWarehouse([warehouse('a'), warehouse('b', { active: false })]),
    ).toBe('a');
    expect(defaultWarehouse([warehouse('a'), warehouse('b')])).toBeUndefined();
  });

  it('prefills the remaining quantity as received and accepted', () => {
    const rows = inboundRows([line('l1', 60)]);
    expect(rows[0]).toMatchObject({
      quantity: '60',
      acceptedQuantity: '60',
      remaining: '60',
    });
  });

  it('asks for a reason when fewer pass and stops over-receiving', () => {
    const rows = inboundRows([line('l1', 60), line('l2', 10)]);
    rows[0]!.acceptedQuantity = '58';
    rows[1]!.quantity = '11';
    const errors = stockInErrors({ warehouseId: 'w' }, rows);
    expect(errors.lines).toEqual({
      l1: '有不合格，请填原因',
      l2: '超过未入库数量 10',
    });
    expect(stockInErrors({}, rows).sheet).toBe('请选择入库仓库');
  });

  it('submits only rows with a received quantity', () => {
    const rows = inboundRows([line('l1', 60), line('l2', 10)]);
    rows[1]!.quantity = undefined;
    const payload = stockInPayload(
      { warehouseId: 'w', directShip: true, deliveryNo: ' SH1 ' },
      rows,
      { contractId: 'c', orderId: 'o', idempotencyKey: 'key-12345' },
    );
    expect(payload.lines).toEqual([
      {
        orderLineId: 'l1',
        quantity: '60',
        acceptedQuantity: '60',
        exceptionReason: undefined,
        batchNo: undefined,
      },
    ]);
    expect(payload).toMatchObject({ directShip: true, deliveryNo: 'SH1' });
  });
});

describe('销售出库', () => {
  const item = (remaining: number, onHand: number): OutboundItem => ({
    contractItemId: `i${remaining}`,
    productName: '瑜伽砖',
    itemQuantity: 100,
    shippedQuantity: 100 - remaining,
    remainingQuantity: remaining,
    onHand,
  });

  it('prefills the smaller of contract remaining and stock on hand', () => {
    expect(outboundRows([item(30, 8), item(5, 20), item(5, 0)])).toMatchObject([
      { quantity: '8' },
      { quantity: '5' },
      { quantity: undefined },
    ]);
  });

  it('rejects shipping more than the contract or the stock allows', () => {
    const rows = outboundRows([item(30, 8)]);
    rows[0]!.quantity = '9';
    expect(stockOutErrors({ warehouseId: 'w' }, rows).lines).toEqual({
      i30: '超过仓库现存 8',
    });
    rows[0]!.quantity = '31';
    expect(stockOutErrors({ warehouseId: 'w' }, rows).lines).toEqual({
      i30: '超过合同未出 30',
    });
    expect(
      stockOutPayload({ warehouseId: 'w' }, outboundRows([item(30, 8)]), {
        contractId: 'c',
        idempotencyKey: 'key-12345',
      }).lines,
    ).toEqual([{ contractItemId: 'i30', quantity: '8' }]);
  });

  it('summarises lines and average cost', () => {
    expect(linesTitle([{ productName: '瑜伽垫' }, { productName: '砖' }])).toBe(
      '瑜伽垫 等 2 项',
    );
    expect(
      averageCost({ costAmount: '570', costKnown: true, onHand: '38' }),
    ).toBe('15');
    expect(
      averageCost({ costAmount: '0', costKnown: false, onHand: '38' }),
    ).toBeUndefined();
  });
});
