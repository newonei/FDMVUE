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
