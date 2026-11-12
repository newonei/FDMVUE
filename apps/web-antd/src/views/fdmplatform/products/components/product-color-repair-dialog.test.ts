import type { ProductColorRepairRow } from '#/api/fdmplatform/product-color-repair';

import { createApp, defineComponent, h, nextTick } from 'vue';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import ProductColorRepairDialog from './ProductColorRepairDialog.vue';

const api = vi.hoisted(() => ({
  preview: vi.fn(),
  apply: vi.fn(),
  rollback: vi.fn(),
  options: vi.fn(),
  key: 0,
}));
vi.mock('#/api/fdmplatform', () => ({
  newIdempotencyKey: () => `repair-${++api.key}`,
}));
vi.mock('#/api/fdmplatform/product-color-repair', () => ({
  previewProductColorRepair: api.preview,
  applyProductColorRepair: api.apply,
  rollbackProductColorRepair: api.rollback,
}));
vi.mock('#/api/fdmplatform/products', () => ({
  getProductAttributeOptions: api.options,
}));
vi.mock('ant-design-vue', () => {
  const block = defineComponent({
    setup:
      (_, { slots }) =>
      () =>
        h('div', [slots.default?.(), slots.footer?.(), slots.description?.()]),
  });
  return {
    Modal: block,
    Spin: block,
    Alert: defineComponent({
      props: ['message', 'description'],
      setup:
        (props, { slots }) =>
        () =>
          h('div', [props.message, props.description, slots.description?.()]),
    }),
    Button: defineComponent({
      props: ['disabled', 'loading'],
      setup:
        (props, { attrs, slots }) =>
        () =>
          h(
            'button',
            { ...attrs, disabled: props.disabled || props.loading },
            slots.default?.(),
          ),
    }),
    Input: defineComponent({
      props: ['value'],
      emits: ['update:value'],
      setup:
        (props, { attrs, emit }) =>
        () =>
          h('input', {
            ...attrs,
            value: props.value,
            onInput: (event: Event) =>
              emit('update:value', (event.target as HTMLInputElement).value),
          }),
    }),
    Select: defineComponent({
      props: ['value', 'options', 'disabled'],
      emits: ['update:value', 'change'],
      setup:
        (props, { attrs, emit }) =>
        () =>
          h(
            'select',
            {
              ...attrs,
              value: props.value ?? '',
              disabled: props.disabled,
              onChange: (event: Event) => {
                const value = (event.target as HTMLSelectElement).value;
                emit('update:value', value);
                emit('change', value);
              },
            },
            [
              h('option', { value: '' }, '请选择'),
              ...props.options.map((option: { label: string; value: string }) =>
                h('option', { value: option.value }, option.label),
              ),
            ],
          ),
    }),
    Checkbox: defineComponent({
      props: ['checked', 'disabled'],
      emits: ['update:checked', 'change'],
      setup:
        (props, { attrs, emit }) =>
        () =>
          h('input', {
            ...attrs,
            type: 'checkbox',
            checked: props.checked,
            disabled: props.disabled,
            onChange: (event: Event) => {
              emit(
                'update:checked',
                (event.target as HTMLInputElement).checked,
              );
              emit('change');
            },
          }),
    }),
  };
});
const ready: ProductColorRepairRow = {
  productId: 'p1',
  version: 4,
  code: 'TEST',
  name: '测试垫',
  model: '正面紫色+反面灰色',
  active: true,
  current: { colorMode: 'UNKNOWN' },
  suggested: { colorMode: 'DUAL', frontColor: 'P', backColor: 'G' },
  frontText: '紫色',
  backText: '灰色',
  status: 'READY',
  reasons: [],
  canApply: true,
};
let unmount: (() => void) | undefined;
const flush = async () => {
  for (let index = 0; index < 6; index++) {
    await Promise.resolve();
    await nextTick();
  }
};
async function mount(row = ready) {
  api.preview.mockResolvedValue({ list: [row], total: 1, ruleVersion: 'v1' });
  const host = document.createElement('div');
  document.body.append(host);
  const updated = vi.fn();
  const app = createApp(ProductColorRepairDialog, {
    companyId: 2,
    open: true,
    onUpdated: updated,
  });
  app.mount(host);
  unmount = () => app.unmount();
  await flush();
  return updated;
}
async function click(text: string) {
  const button = [...document.querySelectorAll('button')].find((element) =>
    element.textContent?.includes(text),
  );
  expect(button).toBeTruthy();
  button!.click();
  await flush();
}
beforeEach(() => {
  api.options.mockResolvedValue({
    colors: [
      { value: 'P', label: '紫色' },
      { value: 'G', label: '灰色' },
    ],
  });
  api.apply.mockResolvedValue({
    batchId: 'batch1',
    updatedCount: 1,
    items: [{ productId: 'p1', version: 5 }],
  });
  api.rollback.mockResolvedValue({
    batchId: 'batch1',
    updatedCount: 1,
    items: [{ productId: 'p1', version: 6 }],
  });
});
afterEach(() => {
  unmount?.();
  document.body.innerHTML = '';
  vi.clearAllMocks();
});
describe('历史颜色补录对话框', () => {
  it.each(['preview', 'apply', 'rollback'] as const)(
    '请求 %s 失败时显示错误并恢复操作',
    async (operation) => {
      api[operation].mockRejectedValueOnce(new Error('颜色服务暂不可用'));
      const updated = await mount();
      if (operation !== 'preview') {
        document
          .querySelector<HTMLInputElement>('input[type=checkbox]')!
          .click();
        await flush();
        await click('补录已核对');
      }
      if (operation === 'rollback') await click('撤销本批');
      expect(document.body.textContent).toContain('颜色服务暂不可用');
      expect(updated).toHaveBeenCalledTimes(operation === 'rollback' ? 1 : 0);
      expect(
        document.querySelector<HTMLButtonElement>('button')!.disabled,
      ).toBe(false);
    },
  );
  it('识别为 READY 仍须人工勾选，按版本提交审核结果并可撤销本批', async () => {
    const updated = await mount();
    const checkbox = document.querySelector<HTMLInputElement>(
      'input[type=checkbox]',
    )!;
    expect(checkbox.checked).toBe(false);
    expect(checkbox.disabled).toBe(false);
    await click('补录已核对');
    expect(api.apply).not.toHaveBeenCalled();
    checkbox.checked = true;
    checkbox.dispatchEvent(new Event('change', { bubbles: true }));
    await flush();
    await click('补录已核对');
    expect(api.apply).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId: 2,
        items: [
          {
            productId: 'p1',
            expectedVersion: 4,
            colorMode: 'DUAL',
            colorCode: undefined,
            frontColor: 'P',
            backColor: 'G',
            reviewed: true,
          },
        ],
      }),
    );
    expect(updated).toHaveBeenCalledTimes(1);
    expect(document.body.textContent).toContain('本批已补录 1 个产品');
    expect(
      document.querySelector<HTMLInputElement>('input[type=checkbox]')!.checked,
    ).toBe(false);
    await click('撤销本批');
    expect(api.rollback).toHaveBeenCalledWith(
      expect.objectContaining({ companyId: 2, batchId: 'batch1' }),
    );
    expect(updated).toHaveBeenCalledTimes(2);
    expect(document.body.textContent).toContain('本批颜色补录已撤销');
  });
  it('缺少字典色号时不造候选、不允许提交，人工改选后仍须重新核对', async () => {
    await mount({
      ...ready,
      code: 'JZ339',
      model: '正面深蓝5036+反面浅蓝5035',
      suggested: { colorMode: 'DUAL' },
      status: 'NEEDS_COLOR',
      canApply: false,
      frontText: '深蓝5036',
      backText: '浅蓝5035',
      reasons: ['颜色字典未维护'],
    });
    expect(document.body.textContent).toContain('深蓝5036');
    expect(
      [...document.querySelectorAll('option')].some((option) =>
        option.value.includes('5036'),
      ),
    ).toBe(false);
    expect(
      document.querySelector<HTMLInputElement>('input[type=checkbox]')!
        .disabled,
    ).toBe(true);
    await click('补录已核对');
    expect(api.apply).not.toHaveBeenCalled();
  });
  it('已有颜色冲突必须回普通编辑核实', async () => {
    await mount({
      ...ready,
      status: 'CONFLICT',
      current: { colorMode: 'DUAL', frontColor: 'G' },
      canApply: false,
    });
    expect(
      document.querySelector<HTMLInputElement>('input[type=checkbox]')!
        .disabled,
    ).toBe(true);
    expect(document.body.textContent).toContain('打开产品核实');
  });
});
