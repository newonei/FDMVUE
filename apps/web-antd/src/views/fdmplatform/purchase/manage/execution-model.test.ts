import type { BusinessRecord } from '#/api/fdmplatform';

import { describe, expect, it } from 'vitest';

import {
  canRecordOrderArrival,
  canReturnOrderArrival,
  orderArrivalProgress,
  orderMoney,
  orderPaymentProgress,
} from './model';

const line = (
  unit: string,
  quantity = '10',
  arrived = '4',
): BusinessRecord => ({
  id: unit,
  unit,
  quantity,
  arrivedQuantity: arrived,
  cancelledQuantity: '0',
  returnedQuantity: '0',
});
const order = (
  lines: BusinessRecord[],
  status = 'PARTIALLY_RECEIVED',
): BusinessRecord => ({ id: 'po-1', status, lines });

describe('采购执行事实与金额展示', () => {
  it('不同计量单位分别表达，同单位用精确十进制合计', () => {
    const groups = orderArrivalProgress(
      order([
        line('件', '0.1', '0.1'),
        line('件', '0.2', '0.1'),
        line('箱', '2', '1'),
      ]),
    );
    expect(groups).toHaveLength(2);
    expect(groups[0]).toMatchObject({
      unit: '件',
      ordered: '0.3',
      arrived: '0.2',
      remaining: '0.1',
    });
    expect(groups[1]).toMatchObject({
      unit: '箱',
      ordered: '2',
      arrived: '1',
      remaining: '1',
      percent: 50,
    });
  });
  it('缺失单位不将多个产品误合并，采购快照单位优先', () => {
    const groups = orderArrivalProgress(
      order([
        line(''),
        line(''),
        { ...line('件'), specificationSnapshot: { unit: '箱' } },
      ]),
    );
    expect(groups.map((group) => group.unit)).toEqual([
      '单位待补齐',
      '单位待补齐',
      '箱',
    ]);
  });
  it('取消量扣除待到货范围，退回（作废入库/退货）后按净到货算进度并可再收货', () => {
    const entry = order([
      {
        ...line('件', '10', '6'),
        cancelledQuantity: '2',
        returnedQuantity: '1',
      },
    ]);
    expect(orderArrivalProgress(entry)[0]).toMatchObject({
      ordered: '8',
      arrived: '5',
      remaining: '3',
      returned: '1',
      percent: 62.5,
    });
    expect(canRecordOrderArrival(entry)).toBe(true);
    expect(canReturnOrderArrival(entry)).toBe(true);
  });
  it('入库单全部作废后入库比例归零，可重新入库', () => {
    const entry = order(
      [{ ...line('件', '10', '10'), returnedQuantity: '10' }],
      'ORDERED',
    );
    expect(orderArrivalProgress(entry)[0]).toMatchObject({
      arrived: '0',
      remaining: '10',
      percent: 0,
    });
    expect(canRecordOrderArrival(entry)).toBe(true);
    expect(canReturnOrderArrival(entry)).toBe(false);
  });
  it('未知或矛盾执行量不伪装成零/完成，也不显示到货主动作', () => {
    for (const item of [
      { ...line('件'), arrivedQuantity: undefined },
      { ...line('件'), cancelledQuantity: null },
      line('件', '10', '11'),
    ]) {
      const entry = order([item]);
      expect(orderArrivalProgress(entry)[0]).toMatchObject({
        known: false,
        percent: undefined,
        remaining: undefined,
      });
      expect(canRecordOrderArrival(entry)).toBe(false);
    }
    expect(canRecordOrderArrival(order([line('件', '10', '10')]))).toBe(false);
    expect(canRecordOrderArrival(order([line('件')], 'CANCELLED'))).toBe(false);
  });
  it('可退数量为零或未知时不启用采购退货', () => {
    expect(
      canReturnOrderArrival(order([{ ...line('件'), returnedQuantity: '4' }])),
    ).toBe(false);
    expect(
      canReturnOrderArrival(
        order([{ ...line('件'), returnedQuantity: undefined }]),
      ),
    ).toBe(false);
  });
  it('未知金额不默认为零，真实零仍显示币种和金额', () => {
    for (const value of [undefined, null, '', 'NaN', '-1'])
      expect(orderMoney(value, 'CNY')).toBe('待核实');
    expect(orderMoney('0', 'USD')).toBe('USD 0.00');
    expect(orderMoney('1234.5', 'CNY')).toBe('CNY 1,234.50');
    expect(orderMoney('1', undefined)).toBe('币种未注明 1.00');
  });
  it('付款百分比仅从独立资金事实计算，未知或零应付不生成完成进度', () => {
    expect(orderPaymentProgress({ orderAmount: '100', paidAmount: '25' })).toBe(
      25,
    );
    expect(
      orderPaymentProgress({ orderAmount: '100', paidAmount: '110' }),
    ).toBe(100);
    expect(orderPaymentProgress({ orderAmount: '100' })).toBeUndefined();
    expect(
      orderPaymentProgress({ orderAmount: '0', paidAmount: '0' }),
    ).toBeUndefined();
  });
});
