import type {
  InventoryWarehouse,
  StockBalance,
} from '#/api/fdmplatform/warehouse';

import { describe, expect, it } from 'vitest';

import {
  countDiff,
  countErrors,
  countPayload,
  countRows,
  firstWarehouse,
  pickErrors,
  pickLines,
  pickRows,
  stageOf,
  writableWarehouses,
} from './model';

const warehouse = (
  id: string,
  extra: Partial<InventoryWarehouse> = {},
): InventoryWarehouse => ({
  id,
  name: id,
  isDefault: false,
  writable: true,
  ...extra,
});

const stock = (id: string, onHand: number | string): StockBalance => ({
  id,
  warehouseId: 'wh',
  warehouseName: '武汉仓库',
  productName: '瑜伽垫',
  productCode: 'DZ1',
  unit: '条',
  onHand,
  costAmount: 0,
  costKnown: true,
});

describe('库存中心', () => {
  it('only offers warehouses the keeper may operate, default first', () => {
    const list = [
      warehouse('wh', { isDefault: true, writable: false }),
      warehouse('hs', { factoryId: 1 }),
    ];
    expect(writableWarehouses(list).map((entry) => entry.id)).toEqual(['hs']);
    expect(firstWarehouse(list)).toBe('hs');
    expect(
      firstWarehouse([warehouse('a'), warehouse('b', { isDefault: true })]),
    ).toBe('b');
    expect(firstWarehouse([warehouse('a'), warehouse('b')])).toBeUndefined();
  });

  it('picks stock rows with quantity within on hand', () => {
    const rows = pickRows([stock('s1', '10'), stock('s0', 0)]);
    expect(rows.map((row) => row.stockId)).toEqual(['s1']);
    expect(pickErrors({ warehouseId: 'wh' }, rows).sheet).toBe(
      '至少填写一行出库数量',
    );
    rows[0]!.quantity = '11';
    expect(pickErrors({ warehouseId: 'wh' }, rows, '调拨').lines.s1).toBe(
      '超过现存 10',
    );
    rows[0]!.quantity = '4';
    expect(pickErrors({ warehouseId: 'wh' }, rows)).toEqual({
      lines: {},
      sheet: '',
    });
    expect(pickLines(rows)).toEqual([{ stockId: 's1', quantity: '4' }]);
    expect(pickErrors({}, rows).sheet).toBe('请选择仓库');
  });

  it('counts only the rows with an actual quantity and keeps the book seen', () => {
    const rows = countRows([stock('s1', '95'), stock('s2', 0)]);
    expect(countErrors({ warehouseId: 'wh' }, rows).sheet).toBe(
      '至少录入一行实盘数',
    );
    rows[0]!.actual = '93';
    rows[1]!.actual = '0';
    expect(countDiff(rows[0]!)).toBe('-2');
    expect(countDiff(rows[1]!)).toBe('0');
    expect(
      countPayload({ warehouseId: 'wh', remark: ' 月底 ' }, rows, 'key-12345'),
    ).toEqual({
      idempotencyKey: 'key-12345',
      warehouseId: 'wh',
      countedDate: undefined,
      remark: '月底',
      lines: [
        { stockId: 's1', bookQuantity: '95', actualQuantity: '93' },
        { stockId: 's2', bookQuantity: '0', actualQuantity: '0' },
      ],
    });
    rows[0]!.actual = '-1';
    expect(countErrors({ warehouseId: 'wh' }, rows).lines.s1).toBe(
      '实盘数不能小于 0',
    );
  });

  it('names factory stages like the backend', () => {
    expect(stageOf('PACKED')).toMatchObject({
      label: '已包装成品',
      unit: '件',
    });
    expect(stageOf('NOPE')).toBeUndefined();
  });
});
