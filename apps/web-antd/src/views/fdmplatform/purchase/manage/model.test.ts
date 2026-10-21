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
  orderCopySource,
  orderDetailsPayload,
  orderRowDue,
  orderRowFlags,
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
});

describe('采购单列表状态图标（金智式）', () => {
  const names = { NONE: '未入库', PARTIAL: '部分入库', ALL: '已入齐' };
  const row = (extra: Record<string, unknown>) =>
    ({ id: 'o', record: {}, ...extra }) as unknown as Parameters<
      typeof orderRowFlags
    >[0];
  it('入库、付款、收票、盖章、附件分别按办完 / 部分 / 未办着色', () => {
    const flags = orderRowFlags(
      row({
        receivedState: 'PARTIAL',
        orderAmount: '100',
        paidAmount: '100',
        unpaidAmount: '0',
        invoicedAmount: '40',
        signed: true,
        attached: true,
      }),
      names,
    );
    expect(flags.map((flag) => [flag.text, flag.tone])).toEqual([
      ['入', 'part'],
      ['付', 'done'],
      ['票', 'part'],
      ['章', 'done'],
      ['附', 'done'],
    ]);
  });
  it('无需收票显示为跳过，未付款与未收票为灰', () => {
    const flags = orderRowFlags(
      row({
        orderAmount: '100',
        paidAmount: '0',
        unpaidAmount: '100',
        noInvoice: true,
      }),
      names,
    );
    expect(flags.map((flag) => flag.tone)).toEqual([
      'none',
      'none',
      'skip',
      'none',
      'none',
    ]);
    expect(flags[2]!.title).toBe('无需收票');
  });
});

describe('采购单列表「⋯」菜单复制', () => {
  it('合同采购单与新系统独立单可复制，金智历史独立单不能', () => {
    const row = (extra: Record<string, unknown>) =>
      ({ id: 'o1', contractId: 'c1', ...extra }) as never;
    expect(orderCopySource(row({}))).toEqual({
      contractId: 'c1',
      orderId: 'o1',
    });
    expect(
      orderCopySource(
        row({ contractId: '', standaloneId: 's1', nativeStandalone: true }),
      ),
    ).toEqual({ contractId: 'standalone', orderId: 's1' });
    expect(
      orderCopySource(row({ contractId: '', standaloneId: 's2' })),
    ).toBeUndefined();
  });
});
