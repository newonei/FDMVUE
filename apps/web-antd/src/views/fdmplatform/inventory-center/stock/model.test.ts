import type {
  InventoryWarehouse,
  StockBalance,
} from '#/api/fdmplatform/warehouse';

import { describe, expect, it } from 'vitest';

import {
  groupByProduct,
  idleDays,
  matchesKeyword,
  matchesStatus,
  overview,
  share,
  stockCsv,
  stockFlags,
  warehouseGroups,
} from './model';

const today = '2026-11-08';

function stock(overrides: Partial<StockBalance> = {}): StockBalance {
  return {
    id: 's1',
    warehouseId: 'w1',
    warehouseName: '武汉仓',
    skuId: 'sku-a',
    specVersion: '1',
    productName: '杯垫',
    productCode: 'CB-01',
    specification: '10cm',
    unit: '个',
    onHand: '10',
    costAmount: '50',
    costKnown: true,
    lastInDate: '2026-11-01',
    lastOutDate: '2026-11-05',
    ...overrides,
  };
}

const warehouse = (
  overrides: Partial<InventoryWarehouse> = {},
): InventoryWarehouse => ({
  id: 'w1',
  name: '武汉仓',
  isDefault: true,
  writable: true,
  ...overrides,
});

describe('stock flags', () => {
  it('counts idle days from the last outbound, else the last inbound', () => {
    expect(idleDays(stock(), today)).toBe(3);
    expect(idleDays(stock({ lastOutDate: undefined }), today)).toBe(7);
    expect(
      idleDays(stock({ lastInDate: undefined, lastOutDate: undefined }), today),
    ).toBeUndefined();
  });

  it('flags negative, zero, stagnant and unknown-cost stock', () => {
    expect(stockFlags(stock({ onHand: '-2' }), today)).toMatchObject({
      negative: true,
      inStock: true,
      stagnant: false,
    });
    expect(
      stockFlags(stock({ onHand: '0', costKnown: false }), today),
    ).toMatchObject({
      zero: true,
      inStock: false,
      costUnknown: false,
    });
    expect(
      stockFlags(stock({ lastOutDate: '2026-08-01' }), today).stagnant,
    ).toBe(true);
    expect(stockFlags(stock({ costKnown: false }), today).costUnknown).toBe(
      true,
    );
  });

  it('filters by status and keyword', () => {
    const rows = [
      stock(),
      stock({ id: 's2', onHand: '0' }),
      stock({ id: 's3', onHand: '-1' }),
    ];
    expect(
      rows.filter((row) => matchesStatus(row, 'IN_STOCK', today)),
    ).toHaveLength(2);
    expect(
      rows.filter((row) => matchesStatus(row, 'ZERO', today)),
    ).toHaveLength(1);
    expect(
      rows.filter((row) => matchesStatus(row, 'NEGATIVE', today)),
    ).toHaveLength(1);
    expect(rows.filter((row) => matchesStatus(row, 'ALL', today))).toHaveLength(
      3,
    );
    expect(matchesKeyword(stock(), 'cb-01')).toBe(true);
    expect(matchesKeyword(stock(), '武汉')).toBe(true);
    expect(matchesKeyword(stock(), '托盘')).toBe(false);
  });
});

describe('overview', () => {
  it('sums known cost and counts each kind of attention', () => {
    const result = overview(
      [
        stock(),
        stock({ id: 's2', costKnown: false, costAmount: '0' }),
        stock({ id: 's3', onHand: '0', costAmount: '0' }),
        stock({ id: 's4', costAmount: '20.5', lastOutDate: '2026-01-01' }),
        stock({ id: 's5', onHand: '-3', costAmount: '0' }),
      ],
      today,
    );
    expect(result).toEqual({
      items: 4,
      amount: '70.50',
      costUnknown: 1,
      negative: 1,
      stagnant: 1,
      stagnantAmount: '20.50',
      zero: 1,
    });
  });
});

describe('warehouse groups', () => {
  it('puts company warehouses first, groups factory ones and keeps retired ones', () => {
    const groups = warehouseGroups(
      [
        warehouse(),
        warehouse({
          id: 'f1',
          name: '原料仓',
          isDefault: false,
          factoryId: 3,
          factoryName: '一厂',
        }),
        warehouse({
          id: 'f2',
          name: '成品仓',
          isDefault: false,
          factoryId: 3,
          factoryName: '一厂',
        }),
      ],
      [
        stock(),
        stock({
          id: 's2',
          warehouseId: 'f1',
          warehouseName: '原料仓',
          onHand: '-1',
        }),
        stock({
          id: 's3',
          warehouseId: 'old',
          warehouseName: '旧仓',
          costAmount: '7',
        }),
      ],
      today,
    );
    expect(groups.map((group) => group.label)).toEqual([
      '公司仓库',
      '一厂',
      '其他仓库',
    ]);
    expect(groups[0]?.warehouses[0]).toMatchObject({
      id: 'w1',
      items: 1,
      amount: '50.00',
    });
    expect(
      groups[1]?.warehouses.map((entry) => [entry.name, entry.negative]),
    ).toEqual([
      ['原料仓', 1],
      ['成品仓', 0],
    ]);
    expect(groups[2]?.warehouses[0]).toMatchObject({
      id: 'old',
      name: '旧仓',
      amount: '7.00',
    });
  });
});

describe('group by product', () => {
  it('merges the same SKU across warehouses', () => {
    const [group, other] = groupByProduct([
      stock(),
      stock({
        id: 's2',
        warehouseId: 'w2',
        warehouseName: '上海仓',
        onHand: '25',
        costAmount: '100',
        lastInDate: '2026-11-07',
        lastOutDate: undefined,
      }),
      stock({ id: 's3', skuId: 'sku-b', productName: '托盘' }),
    ]);
    expect(group).toMatchObject({
      onHand: '35',
      costAmount: '150.00',
      costKnown: true,
      lastInDate: '2026-11-07',
      lastOutDate: '2026-11-05',
    });
    expect(group?.stocks.map((row) => row.warehouseName)).toEqual([
      '上海仓',
      '武汉仓',
    ]);
    expect(other?.productName).toBe('托盘');
  });

  it('marks the product cost unknown only when stock on hand lacks cost', () => {
    const [known] = groupByProduct([
      stock(),
      stock({ id: 's2', onHand: '0', costKnown: false }),
    ]);
    expect(known?.costKnown).toBe(true);
    const [unknown] = groupByProduct([
      stock(),
      stock({ id: 's2', costKnown: false }),
    ]);
    expect(unknown?.costKnown).toBe(false);
  });
});

describe('export', () => {
  it('writes a BOM, guards formulas and quotes commas', () => {
    expect(share('25', '100')).toBe(25);
    expect(share('25', '0')).toBe(0);
    const csv = stockCsv(
      [stock({ productName: '=杯垫,大', onHand: '-2', costKnown: false })],
      today,
    );
    expect(csv.startsWith(`${String.fromCodePoint(65_279)}仓库,`)).toBe(true);
    expect(csv.split('\n')[1]).toBe(
      `武汉仓,"'=杯垫,大",CB-01,10cm,个,-2,,,2026-11-01,2026-11-05,3,负库存、成本未知`,
    );
  });
});
