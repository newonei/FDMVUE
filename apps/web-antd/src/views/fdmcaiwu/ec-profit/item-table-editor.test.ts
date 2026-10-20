import type { Component } from 'vue';
import type { FdmcaiwuEcProfitApi as Api } from '#/api/fdmcaiwu/ec-profit';
import type { LeafRow } from './tree-model';

import { createApp, defineComponent, h, nextTick, reactive } from 'vue';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  itemDraft,
  itemDraftChanged,
  itemSaveRequest,
  validateItemDraft,
} from './item-edit-model';
import ItemTableEditor from './modules/item-table-editor.vue';

const mocks = vi.hoisted(() => ({ save: vi.fn(), confirm: vi.fn() }));
vi.mock('#/api/fdmcaiwu/ec-profit', () => ({ saveEcProfitItem: mocks.save }));
vi.mock('ant-design-vue', () => {
  const input = defineComponent({
    props: ['value', 'disabled'],
    emits: ['update:value'],
    setup: (props, ctx) => () =>
      h('input', {
        ...ctx.attrs,
        value: props.value ?? '',
        disabled: props.disabled,
        onInput: (event: Event) =>
          ctx.emit('update:value', (event.target as HTMLInputElement).value),
      }),
  });
  return {
    Input: input,
    InputNumber: input,
    Button: defineComponent({
      props: ['disabled', 'loading'],
      setup: (props, ctx) => () =>
        h(
          'button',
          { ...ctx.attrs, disabled: props.disabled || props.loading },
          ctx.slots.default?.(),
        ),
    }),
    Alert: defineComponent({
      props: ['message'],
      setup: (props) => () => h('div', { role: 'alert' }, props.message),
    }),
    Tag: defineComponent({
      setup: (_, ctx) => () => h('span', ctx.slots.default?.()),
    }),
    Segmented: defineComponent({ setup: () => () => null }),
    Modal: { confirm: mocks.confirm },
    Table: defineComponent({
      props: ['columns', 'dataSource'],
      setup: (props, ctx) => () =>
        h(
          'table',
          props.dataSource.map((record: LeafRow) =>
            h(
              'tr',
              { key: record.key },
              props.columns.map((column: unknown) =>
                h('td', ctx.slots.bodyCell?.({ record, column })),
              ),
            ),
          ),
        ),
    }),
  };
});

const cleanups: (() => void)[] = [];
async function settle() {
  for (let i = 0; i < 3; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
    await nextTick();
  }
}
const first: Api.Item = {
  id: 1,
  shopId: '1',
  shopName: '店铺甲',
  lineType: 'SHOP',
  dataStatus: 'IMPORTED',
  salesAmount: '12345678.123456',
  purchaseCost: '20.000001',
  freightCost: 4,
  promotionCost: 5,
  platformFee: '8.123456',
  platformFeeBill: null,
  platformFeeAdjustment: null,
  taxFee: null,
  remark: '保留备注',
  platformFeeAdjustmentReason: '保留原因',
};
const second: Api.Item = {
  ...first,
  id: 2,
  shopId: '2',
  shopName: '费用乙',
  lineType: 'ADJUSTMENT',
  taxFee: '5',
};
function row(item: Api.Item): LeafRow {
  return {
    key: String(item.id),
    name: item.shopName,
    groupKey: 'group',
    groupLabel: '财务小组',
    item,
  } as LeafRow;
}
function mount(component: Component = ItemTableEditor) {
  const host = document.createElement('div');
  document.body.append(host);
  const props = reactive({
    month: '2026-09',
    reportVersion: 7,
    rows: [row(first), row(second)],
    visibleRows: [row(first), row(second)],
  });
  const saved = vi.fn();
  const cancel = vi.fn();
  const app = createApp({
    render: () => h(component, { ...props, onSaved: saved, onCancel: cancel }),
  });
  app.mount(host);
  cleanups.push(() => {
    app.unmount();
    host.remove();
  });
  return { host, props, saved, cancel };
}
function input(host: Element, name: string, value: string) {
  const element = host.querySelector<HTMLInputElement>(
    `input[aria-label="${name}"]`,
  )!;
  expect(element).not.toBeNull();
  element.value = value;
  element.dispatchEvent(new Event('input', { bubbles: true }));
}
function click(host: Element, text: string) {
  const element = [...host.querySelectorAll<HTMLButtonElement>('button')].find(
    (button) =>
      button.textContent?.replaceAll(/\s/g, '') === text.replaceAll(/\s/g, ''),
  );
  expect(element).toBeDefined();
  element!.click();
}
beforeEach(() => {
  vi.resetAllMocks();
  mocks.save.mockResolvedValue(1);
});
afterEach(() => cleanups.splice(0).forEach((cleanup) => cleanup()));

describe('毛利表完整行草稿', () => {
  it('保存隐藏字段的六位精度、备注和历史平台费用，空白与零分开', () => {
    const original = itemDraft(first);
    expect(itemDraftChanged(original, itemDraft(first))).toBe(false);
    const draft = { ...original, taxFee: '0' };
    const request = itemSaveRequest(first, draft, '2026-09', 7);
    expect(request).toMatchObject({
      salesAmount: '12345678.123456',
      purchaseCost: '20.000001',
      platformFeeBill: '8.123456',
      taxFee: '0',
      dropshipPurchaseCost: null,
      remark: '保留备注',
      platformFeeAdjustmentReason: '保留原因',
      reportVersion: 7,
    });
    expect(itemDraftChanged(draft, original)).toBe(true);
    expect(itemDraftChanged({ ...draft, taxFee: '0.000000' }, draft)).toBe(
      false,
    );
  });
  it('非零平台调整必须有原因，零调整也必须有账单费用', () => {
    expect(
      validateItemDraft({
        ...itemDraft(first),
        platformFeeAdjustment: '-2',
        platformFeeAdjustmentReason: '',
      }),
    ).toContain('调整原因');
    expect(
      validateItemDraft({
        ...itemDraft(first),
        platformFeeAdjustment: '0',
        platformFeeBill: null,
      }),
    ).toContain('账单费用');
    expect(
      validateItemDraft({ ...itemDraft(first), taxFee: '100000000000000' }),
    ).toContain('14 位');
  });
});

describe('真实表格编辑组件', () => {
  it('连续填写多行，按月报版本串行保存完整行，不提交未改动行', async () => {
    const { host, saved } = mount();
    input(host, '店铺甲 税费', '0');
    input(host, '费用乙 代发采购', '-12.123456');
    await settle();
    click(host, '保存 2 行');
    await settle();
    expect(
      mocks.save.mock.calls.map(([request]) => [
        request.id,
        request.reportVersion,
      ]),
    ).toEqual([
      [1, 7],
      [2, 8],
    ]);
    expect(mocks.save.mock.calls[0]![0]).toMatchObject({
      salesAmount: first.salesAmount,
      taxFee: '0',
      platformFeeBill: first.platformFee,
    });
    expect(saved).toHaveBeenCalledOnce();
  });
  it('筛选隐藏的草稿仍保存，清空金额发送 null', async () => {
    const { host, props } = mount();
    input(host, '店铺甲 税费', '0');
    input(host, '费用乙 税费', '');
    props.visibleRows = [row(second)];
    await settle();
    expect(host.querySelector('[aria-label="店铺甲 税费"]')).toBeNull();
    click(host, '保存 2 行');
    await settle();
    expect(mocks.save).toHaveBeenCalledTimes(2);
    expect(mocks.save.mock.calls[0]![0]).toMatchObject({
      id: 1,
      taxFee: '0',
      estimatedFreight: null,
    });
    expect(mocks.save.mock.calls[1]![0]).toMatchObject({ id: 2, taxFee: null });
  });
  it('先验证全部草稿，调整原因缺失时一行都不提交', async () => {
    const { host } = mount();
    input(host, '店铺甲 税费', '0');
    input(host, '费用乙 平台费用调整', '-2');
    input(host, '费用乙 平台调整原因', '');
    await settle();
    click(host, '保存 2 行');
    await settle();
    expect(mocks.save).not.toHaveBeenCalled();
    expect(host.textContent).toContain('调整原因');
  });
  it('部分成功后停止，失败行保留；重试只提交剩余行并沿用下一版本', async () => {
    mocks.save
      .mockResolvedValueOnce(1)
      .mockRejectedValueOnce(new Error('版本冲突'))
      .mockResolvedValueOnce(2);
    const { host, saved } = mount();
    input(host, '店铺甲 税费', '0');
    input(host, '费用乙 税费', '1');
    await settle();
    click(host, '保存 2 行');
    await settle();
    expect(saved).not.toHaveBeenCalled();
    expect(host.textContent).toContain('已保存 1 行');
    expect(
      host.querySelector<HTMLInputElement>('[aria-label="费用乙 税费"]')!.value,
    ).toBe('1');
    click(host, '保存 1 行');
    await settle();
    expect(
      mocks.save.mock.calls.map(([request]) => [
        request.id,
        request.reportVersion,
      ]),
    ).toEqual([
      [1, 7],
      [2, 8],
      [2, 8],
    ]);
    expect(saved).toHaveBeenCalledOnce();
  });
  it('保存中禁止再次提交及退出；未保存时取消退出保留输入', async () => {
    let finish!: () => void;
    mocks.save.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
    );
    const { host, cancel } = mount();
    input(host, '店铺甲 税费', '2');
    await settle();
    click(host, '退出编辑');
    await settle();
    expect(mocks.confirm).toHaveBeenCalledOnce();
    mocks.confirm.mock.calls[0]![0].onCancel();
    await settle();
    expect(cancel).not.toHaveBeenCalled();
    click(host, '保存 1 行');
    await settle();
    expect(
      [...host.querySelectorAll<HTMLButtonElement>('button')].every(
        (button) => button.disabled,
      ),
    ).toBe(true);
    expect(host.querySelector<HTMLInputElement>('input')!.disabled).toBe(true);
    finish();
    await settle();
  });
});
