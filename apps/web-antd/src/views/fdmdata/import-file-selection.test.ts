import type { Component } from 'vue';

import { createApp, nextTick, toRaw } from 'vue';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import DouyinImport from './ecshopdaily/modules/douyin-import-modal.vue';
import JdImport from './ecshopdaily/modules/jd-import-modal.vue';
import Reconcile from './expressreconbatch/modules/reconcile-modal.vue';
import ImportOrders from './expressreconperiod/modules/import-orders-modal.vue';

const state = vi.hoisted(() => ({
  api: vi.fn(),
  options: undefined as
    | {
        onConfirm: () => Promise<void>;
        onOpenChange: (open: boolean) => Promise<void> | void;
      }
    | undefined,
}));

vi.mock('#/api/fdmdata/ecshopdaily', () => ({
  importDouyinEcShopDailyExcel: state.api,
  importJdEcShopDailyExcel: state.api,
}));
vi.mock('#/api/fdmdata/expressreconbatch', () => ({
  downloadExpressBillTemplate: vi.fn(),
  reconcileCarrierExpress: state.api,
}));
vi.mock('#/api/fdmdata/expressreconperiod', () => ({
  importExpressReconOrders: state.api,
}));
vi.mock('#/api/fdmdata/expressfeetemplate', () => ({
  getExpressFeeTemplateOptions: vi.fn().mockResolvedValue([]),
}));
vi.mock('@vben/icons', () => ({ IconifyIcon: { render: () => null } }));
vi.mock('@vben/utils', () => ({ downloadFileFromBlobPart: vi.fn() }));
vi.mock('@vben/common-ui', async () => {
  const { defineComponent, h } = await import('vue');
  return {
    useVbenModal: (options: typeof state.options) => {
      state.options = options;
      return [
        defineComponent({
          props: ['confirmDisabled'],
          setup(props, { slots }) {
            return () => h('section', [
              slots.default?.(),
              h('button', { 'data-confirm': '', disabled: props.confirmDisabled }),
            ]);
          },
        }),
        {
          close: () => options?.onOpenChange(false),
          getData: () => ({ periodId: 7 }),
          lock: vi.fn(),
          unlock: vi.fn(),
        },
      ];
    },
  };
});
vi.mock('ant-design-vue', async () => {
  const { defineComponent, h, ref } = await import('vue');
  return {
    Button: defineComponent({
      setup(_props, { attrs, slots }) {
        return () => h('button', attrs, slots.default?.());
      },
    }),
    Input: defineComponent({
      props: ['value'],
      emits: ['update:value'],
      setup(props, { emit }) {
        return () => h('input', {
          value: props.value,
          onInput: (event: Event) => emit('update:value', (event.target as HTMLInputElement).value),
        });
      },
    }),
    Select: { render: () => null },
    Upload: defineComponent({
      props: ['beforeUpload', 'disabled', 'fileList'],
      emits: ['update:fileList'],
      setup(props, { emit }) {
        const internalFiles = ref<Array<{ name: string; originFileObj: File }>>([]);
        const change = (files: typeof internalFiles.value) => {
          internalFiles.value = files;
          emit('update:fileList', files);
        };
        return () => h('div', [
          h('input', {
            type: 'file',
            disabled: props.disabled,
            onChange: (event: Event) => {
              const file = (event.target as HTMLInputElement).files?.[0];
              if (!file) return;
              props.beforeUpload(file);
              change([{ name: file.name, originFileObj: file }]);
            },
          }),
          ...(props.fileList ?? internalFiles.value).map((file: { name: string }) =>
            h('button', {
              'data-remove': '',
              disabled: props.disabled,
              onClick: () => change([]),
            }, file.name),
          ),
        ]);
      },
    }),
    message: { success: vi.fn(), warning: vi.fn() },
  };
});

const cleanup: Array<() => void> = [];
const cases = [
  { name: '京东', component: JdImport, fileKey: undefined },
  { name: '抖音', component: DouyinImport, fileKey: undefined },
  { name: '发货订单', component: ImportOrders, fileKey: 'orderFile' },
  { name: '快递账单', component: Reconcile, fileKey: 'billFile' },
];

async function mount(component: Component) {
  const container = document.createElement('div');
  const app = createApp(component);
  app.mount(container);
  cleanup.push(() => app.unmount());
  await state.options!.onOpenChange(true);
  const fill = async () => {
    for (const input of container.querySelectorAll<HTMLInputElement>('input:not([type="file"])')) {
      input.value = '2026-05';
      input.dispatchEvent(new Event('input'));
    }
    await nextTick();
  };
  const select = async (file: File) => {
    const input = container.querySelector<HTMLInputElement>('input[type="file"]')!;
    Object.defineProperty(input, 'files', { configurable: true, value: [file] });
    input.dispatchEvent(new Event('change'));
    await nextTick();
  };
  await fill();
  return { container, fill, select };
}

beforeEach(() => {
  state.api.mockReset().mockResolvedValue({ total: 1, created: 1, updated: 0, skipped: 0 });
});
afterEach(() => cleanup.splice(0).forEach((dispose) => dispose()));

describe.each(cases)('$name 导入文件生命周期', ({ component, fileKey }) => {
  it('移除文件后禁用确认，即使触发确认也不发送旧文件', async () => {
    const { container, select } = await mount(component);
    await select(new File(['a'], 'removed.xlsx'));
    container.querySelector<HTMLButtonElement>('[data-remove]')!.click();
    await nextTick();
    expect(container.textContent).not.toContain('removed.xlsx');
    expect(container.querySelector<HTMLButtonElement>('[data-confirm]')!.disabled).toBe(true);
    await state.options!.onConfirm();
    expect(state.api).not.toHaveBeenCalled();
  });

  it('替换文件后只提交最新文件，关闭重开不会恢复旧文件', async () => {
    const { container, fill, select } = await mount(component);
    await select(new File(['a'], 'old.xlsx'));
    const latest = new File(['b'], 'latest.xlsx');
    await select(latest);
    await state.options!.onConfirm();
    const request = state.api.mock.calls[0]![0];
    expect(toRaw(fileKey ? request[fileKey] : request)).toBe(latest);
    await state.options!.onOpenChange(true);
    await fill();
    expect(container.querySelector('[data-remove]')).toBeNull();
    await state.options!.onConfirm();
    expect(state.api).toHaveBeenCalledTimes(1);
  });

  it('提交中禁止重复请求与替换，失败后保留当前文件供重试', async () => {
    const { container, select } = await mount(component);
    const file = new File(['a'], 'retry.xlsx');
    await select(file);
    let rejectRequest!: (error: Error) => void;
    state.api.mockImplementationOnce(() => new Promise((_resolve, reject) => { rejectRequest = reject; }));
    const pending = state.options!.onConfirm();
    const failed = expect(pending).rejects.toThrow('network');
    await nextTick();
    expect(container.querySelector<HTMLInputElement>('input[type="file"]')!.disabled).toBe(true);
    expect(container.querySelector<HTMLButtonElement>('[data-remove]')!.disabled).toBe(true);
    await state.options!.onConfirm();
    expect(state.api).toHaveBeenCalledTimes(1);
    rejectRequest(new Error('network'));
    await failed;
    await nextTick();
    expect(container.querySelector<HTMLInputElement>('input[type="file"]')!.disabled).toBe(false);
    expect(container.textContent).toContain('retry.xlsx');
    await state.options!.onConfirm();
    expect(state.api).toHaveBeenCalledTimes(2);
    const request = state.api.mock.calls[1]![0];
    expect(toRaw(fileKey ? request[fileKey] : request)).toBe(file);
  });
});
