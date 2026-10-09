import type { BusinessRecord } from '#/api/fdmplatform';
import type {
  ProcurementSetting,
  SupplierContact,
} from '#/api/fdmplatform/procurement';

import { describe, expect, it } from 'vitest';

import {
  activeContacts,
  compatibleClauses,
  orderDetailsPayload,
  orderSteps,
  preferredContact,
  purchaseRowLabels,
  snapshotShape,
  sumAmounts,
} from './model';
const contact = (
  id: string,
  active = true,
  defaultContact = false,
): SupplierContact => ({
  id,
  supplierId: 'factory',
  version: 0,
  name: id,
  phone: '001234',
  active,
  defaultContact,
});
const clause = (id: string, groupCode: string): ProcurementSetting => ({
  id,
  version: 0,
  name: id,
  active: true,
  groupCode,
});
describe('采购下单资料', () => {
  it('编号与供应商分别保留，兼容独立原生行的顶层名称', () => {
    expect(
      purchaseRowLabels({
        id: 'po',
        supplierName: '温州供应商',
        supplierId: 'supplier-1',
        contractName: '真实合同标题',
        record: { code: 'CG20251014224052' },
      }),
    ).toEqual({
      order: 'CG20251014224052',
      supplier: '温州供应商',
      supplierId: 'supplier-1',
      contract: '真实合同标题',
    });
  });
  it('空名称不会生成空蓝色合同链接，也不把采购单号当合同编号', () => {
    expect(
      purchaseRowLabels({
        id: 'po',
        contractId: 'contract-1',
        contractCode: ' ',
        record: { code: 'CG-1' },
      }).contract,
    ).toBe('查看关联合同');
    expect(purchaseRowLabels({ id: 'po', record: {} }).contract).toBe(
      '尚未关联合同',
    );
  });
  it('只从启用联系人选择默认，不改变电话文本', () => {
    const data = [
      contact('disabled', false, true),
      contact('main', true, true),
    ];
    expect(preferredContact(data)?.id).toBe('main');
    expect(activeContacts(data)[0]?.phone).toBe('001234');
  });
  it('历史联系人停用后仍保留显式选择，不替换为新默认', () => {
    expect(
      preferredContact(
        [contact('old', false), contact('new', true, true)],
        'old',
      )?.id,
    ).toBe('old');
  });
  it('无默认联系人时让用户明确选择', () => {
    expect(preferredContact([contact('one')])).toBeUndefined();
  });
  it('没有维护形状的历史明细明确展示未维护', () => {
    expect(
      snapshotShape({
        id: 'old',
        specificationSnapshot: { shape: ' ' },
      } as BusinessRecord),
    ).toBe('未维护');
  });
  it('优先采购快照形状，不用当前可变产品替代', () => {
    expect(
      snapshotShape({
        id: 'line',
        shape: '方形',
        specificationSnapshot: { shape: '圆角' },
      } as BusinessRecord),
    ).toBe('圆角');
  });
  it('同组条款互斥，必选组必须齐全', () => {
    const all = [clause('a', '包装'), clause('b', '包装'), clause('c', '付款')];
    expect(compatibleClauses(all, ['a', 'b'], [])).toBe(
      '同一条款组只能选择一项',
    );
    expect(compatibleClauses(all, ['a'], ['付款'])).toBe(
      '请选择必要条款：付款',
    );
    expect(compatibleClauses(all, ['a', 'c'], ['付款'])).toBe('');
  });
  it('空必选组的模板可保存，不虚构法律条款', () => {
    expect(compatibleClauses([], [], [])).toBe('');
  });
  it('下单资料请求不允许修改原数量价格供应商和规格', () => {
    expect(
      orderDetailsPayload({
        contactId: 'person',
        clauseIds: ['term'],
        quantity: 100,
        unitPrice: 20,
        supplierId: 'other',
        specificationSnapshot: { shape: 'other' },
        version: 0,
      }),
    ).toEqual({ contactId: 'person', clauseIds: ['term'] });
  });
  it('清空交期发送null而不是无效日期字符串', () => {
    expect(orderDetailsPayload({ deliveryDate: '' })).toEqual({
      deliveryDate: null,
    });
  });
  it('多行十进制合计不引入浮点残差', () => {
    expect(sumAmounts(['0.1', '0.2'])).toBe('0.3');
  });
});

describe('orderSteps', () => {
  const order = (overrides: Record<string, unknown> = {}) => ({
    id: 'po',
    status: 'ORDERED',
    createdAt: '2026-10-08T03:00:00Z',
    lines: [
      {
        quantity: 10,
        arrivedQuantity: 0,
        cancelledQuantity: 0,
        returnedQuantity: 0,
        specificationSnapshot: { unit: '件' },
      },
    ],
    ...overrides,
  });
  it('starts with the order details and walks to payment', () => {
    const fresh = orderSteps(
      { details: { status: 'DRAFT' }, files: [], exports: [], order: order() },
      { orderAmount: '100', paidAmount: '0', unpaidAmount: '100' },
    );
    expect(fresh.current?.key).toBe('details');
    expect(fresh.steps.map((step) => step.done)).toEqual([
      true,
      false,
      false,
      false,
      false,
      false,
    ]);
    const signed = orderSteps(
      {
        details: { status: 'CONFIRMED', deliveryDate: '2026-10-20' },
        files: [{ kind: 'SIGNED' }],
        exports: [{}],
        order: order(),
      },
      { orderAmount: '100', paidAmount: '30', unpaidAmount: '70' },
    );
    expect(signed.current?.key).toBe('arrival');
    expect(signed.steps[1]?.summary).toBe('已确认 · 交期 2026-10-20');
    expect(signed.steps[3]?.summary).toBe('0 / 10 件');
    expect(signed.steps[4]?.summary).toBe('已付 30%');
  });
  it('finishes when everything arrived and is paid, and stops for cancelled orders', () => {
    const finished = orderSteps(
      {
        details: { status: 'CONFIRMED' },
        files: [{ kind: 'SIGNED' }],
        order: order({ status: 'RECEIVED' }),
      },
      { orderAmount: '100', paidAmount: '100', unpaidAmount: '0' },
    );
    expect(finished.current).toBeUndefined();
    expect(finished.steps.every((step) => step.done)).toBe(true);
    const cancelled = orderSteps(
      { details: { status: 'DRAFT' }, order: order({ status: 'CANCELLED' }) },
      {},
    );
    expect(cancelled.current).toBeUndefined();
    expect(cancelled.steps.at(-1)?.summary).toBe('采购单已取消');
  });
  it('reports an exported but unsigned contract', () => {
    const steps = orderSteps(
      {
        details: { status: 'CONFIRMED' },
        files: [{ kind: 'EXPORT' }],
        exports: [{}],
        order: order(),
      },
      {},
    );
    expect(steps.current?.key).toBe('contract');
    expect(steps.current?.summary).toBe('已导出，等待签回');
  });
});
