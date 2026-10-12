import type { BusinessRecord } from '#/api/fdmplatform';
import type {
  ProcurementSetting,
  SupplierContact,
} from '#/api/fdmplatform/procurement';

import { describe, expect, it } from 'vitest';

import {
  activeContacts,
  compatibleClauses,
  detailsChecklist,
  onlyChoice,
  orderDetailsPayload,
  orderRowDue,
  orderRowProducts,
  orderRowSteps,
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

describe('下单资料确认前检查', () => {
  const template = {
    ...clause('t', ''),
    requiredClauseGroups: ['PAYMENT', 'DELIVERY'],
  };
  const entity = {
    ...clause('e', ''),
    legalName: '武汉某公司',
    address: '',
  };
  it('lists everything the backend needs before confirming', () => {
    const checks = detailsChecklist({
      clauseIds: ['pay'],
      clauses: [clause('pay', 'PAYMENT'), clause('del', 'DELIVERY')],
      contact: { phone: '' },
      entity,
      template,
    });
    expect(
      checks.filter((check) => !check.ok).map((check) => check.key),
    ).toEqual(['phone', 'entity', 'clauses']);
    expect(checks.find((check) => check.key === 'entity')?.hint).toBe(
      '签约公司缺地址，请在采购设置里补齐',
    );
    expect(checks.find((check) => check.key === 'clauses')?.hint).toBe(
      '还差交货条款',
    );
  });
  it('passes once contact, company, template and required clauses are set', () => {
    const checks = detailsChecklist({
      clauseIds: ['pay', 'del'],
      clauses: [clause('pay', 'PAYMENT'), clause('del', 'DELIVERY')],
      contact: { phone: '138' },
      entity: { ...entity, address: '武汉' },
      template,
    });
    expect(checks.every((check) => check.ok)).toBe(true);
  });
  it('preselects only when exactly one active option exists', () => {
    expect(onlyChoice([clause('a', 'X')])).toBe('a');
    expect(onlyChoice([clause('a', 'X'), clause('b', 'X')])).toBeUndefined();
    expect(
      onlyChoice([clause('a', 'X'), { ...clause('b', 'X'), active: false }]),
    ).toBe('a');
  });
});

describe('采购单列表行', () => {
  const record = (status = 'ORDERED') => ({
    id: 'po',
    status,
    lines: [
      {
        quantity: 1000,
        arrivedQuantity: 0,
        cancelledQuantity: 0,
        specificationSnapshot: { skuName: 'TPE瑜伽垫', unit: '条' },
      },
      {
        quantity: 200,
        arrivedQuantity: 0,
        cancelledQuantity: 0,
        specificationSnapshot: { skuName: 'PU瑜伽垫', unit: '条' },
      },
    ],
  });
  it('names the first product and sums quantities per unit', () => {
    expect(orderRowProducts(record())).toEqual({
      title: 'TPE瑜伽垫 等 2 项',
      names: ['TPE瑜伽垫', 'PU瑜伽垫'],
      quantity: '1200 条',
    });
  });
  it('counts down to the delivery date and stops once everything arrived', () => {
    expect(
      orderRowDue({ dueDate: '2026-10-11', record: record() }, '2026-10-12'),
    ).toEqual({ main: '10-11', sub: '超期 1 天', tone: 'late' });
    expect(
      orderRowDue({ dueDate: '2026-10-14', record: record() }, '2026-10-12')
        .tone,
    ).toBe('soon');
    expect(orderRowDue({ record: record() }, '2026-10-12').main).toBe('未约定');
    expect(
      orderRowDue(
        { dueDate: '2026-10-01', record: record('RECEIVED') },
        '2026-10-12',
      ).sub,
    ).toBe('已到齐');
  });
  it('shows the four buyer steps and what comes next', () => {
    const draft = orderRowSteps({
      details: { status: 'DRAFT' },
      record: record(),
      orderAmount: '100',
      unpaidAmount: '100',
    });
    expect(draft.steps.map((step) => step.label)).toEqual([
      '资料',
      '合同',
      '到货',
      '付款',
    ]);
    expect(draft.next).toBe('待确认下单资料');
    const signed = orderRowSteps({
      details: { status: 'CONFIRMED' },
      signed: true,
      record: record(),
      orderAmount: '100',
      unpaidAmount: '100',
    });
    expect(signed.next).toBe('等到货');
    expect(signed.steps.filter((step) => step.done)).toHaveLength(2);
  });
});
