import { describe, expect, it } from 'vitest';

import { documentActionDataNeeds } from './data-needs';

describe('原生单据办理按需读取', () => {
  it('财务与申请办理不读取全量供应商和库存流水', () => {
    for (const action of [
      'CREATE_RECEIPT',
      'CREATE_INVOICE',
      'CREATE_COST',
      'BIND_ALLOCATION',
      'CREATE_REQUEST',
      'ASSIGN_FULFILLMENT',
      'CANCEL_REQUEST',
      'SAVE_PLAN',
    ]) {
      expect(documentActionDataNeeds(action)).toEqual({
        stock: false,
        suppliers: false,
        warehouses: false,
      });
    }
  });
  it('供应商报价使用远程选择，不预加载全部供应商', () => {
    expect(documentActionDataNeeds('CREATE_QUOTE')).toEqual({
      stock: false,
      suppliers: false,
      warehouses: false,
    });
  });
  it('到货和出入库保留库存池及仓库选择，采购退货沿原到货ID办理', () => {
    for (const action of [
      'RECORD_ARRIVAL',
      'STOCK_RECEIVE',
      'STOCK_RESERVE',
      'STOCK_RELEASE',
      'STOCK_SHIP',
      'STOCK_RETURN',
    ]) {
      expect(documentActionDataNeeds(action)).toEqual({
        stock: true,
        suppliers: false,
        warehouses: false,
      });
    }
    expect(documentActionDataNeeds('RETURN_ARRIVAL').stock).toBe(false);
  });
});
