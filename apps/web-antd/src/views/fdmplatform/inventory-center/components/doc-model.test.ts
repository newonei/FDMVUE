import type { StockIn, StockOut } from '#/api/fdmplatform/warehouse';

import { describe, expect, it } from 'vitest';

import {
  inKind,
  inSubject,
  otherInErrors,
  otherInLines,
  outSalesAmount,
  outSubject,
  pageSum,
} from './doc-model';

const stockIn = (patch: Partial<StockIn>): StockIn =>
  ({
    id: 'in-1',
    code: 'RK20261027001',
    status: 'RECEIVED',
    warehouseId: 'wh',
    warehouseName: '黄石仓库',
    contractId: '',
    contractCode: '',
    orderId: 'po',
    orderCode: 'CG-001',
    supplierName: '康美',
    receivedDate: '2026-10-27',
    directShip: false,
    lines: [],
    createdBy: 1,
    createdAt: '2026-10-27T01:00:00Z',
    ...patch,
  }) as StockIn;

const stockOut = (patch: Partial<StockOut>): StockOut =>
  ({
    id: 'out-1',
    code: 'CK20261027001',
    status: 'SHIPPED',
    kind: 'SALES',
    warehouseId: 'wh',
    warehouseName: '武汉仓库',
    contractCode: 'JXS365-1N',
    customerName: 'Henry Liu',
    shippedDate: '2026-10-27',
    lines: [],
    createdBy: 1,
    createdAt: '2026-10-27T01:00:00Z',
    ...patch,
  }) as StockOut;

describe('inventory documents', () => {
  it('names documents like 金智: 【类型】对应单据 对方', () => {
    expect(inSubject(stockIn({}))).toBe('【采购入库】CG-001 康美');
    expect(inSubject(stockIn({ kind: 'OTHER', source: '客户退回' }))).toBe(
      '【常规入库】客户退回',
    );
    expect(outSubject(stockOut({}))).toBe('【销售出库】JXS365-1N Henry Liu');
    expect(
      outSubject(
        stockOut({ kind: 'OTHER', contractCode: null, destination: '样品' }),
      ),
    ).toBe('【其它出库】样品');
  });

  it('groups self-made production in with factory deliveries', () => {
    expect(inKind(stockIn({}))).toBe('PURCHASE');
    expect(inKind(stockIn({ kind: 'FACTORY_MADE' }))).toBe('PRODUCTION');
    expect(inKind(stockIn({ kind: 'OTHER' }))).toBe('OTHER');
  });

  it('adds up sales value from contract prices and skips voided rows in page totals', () => {
    const priced = stockOut({
      lines: [
        { quantity: '2', salesUnitPrice: '150' },
        { quantity: '1', salesUnitPrice: '50' },
      ],
    });
    expect(outSalesAmount(priced)).toBe('350.00');
    expect(outSalesAmount(stockOut({ lines: [{ quantity: '1' }] }))).toBe(
      undefined,
    );
    const voided = { ...priced, status: 'VOIDED' as const };
    expect(pageSum([priced, voided], outSalesAmount)).toBe('350');
  });

  it('checks 常规入库 before saving', () => {
    const row = {
      productId: 'p1',
      productName: '瑜伽垫',
      productCode: 'DZ1',
      specification: '',
      unit: '条',
    };
    expect(otherInErrors({ source: '', warehouseId: 'wh' }, [row]).sheet).toBe(
      '请填写入库来源',
    );
    expect(
      otherInErrors({ source: '期初', warehouseId: 'wh' }, [row]).lines.p1,
    ).toBe('数量须大于 0');
    const filled = { ...row, quantity: '5', unitCost: ' ' };
    expect(
      otherInErrors({ source: '期初', warehouseId: 'wh' }, [filled]),
    ).toEqual({ lines: {}, sheet: '' });
    expect(otherInLines([filled])).toEqual([
      { productId: 'p1', quantity: '5', unitCost: undefined },
    ]);
  });
});
