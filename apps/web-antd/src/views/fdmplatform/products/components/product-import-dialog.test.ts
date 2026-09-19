/* eslint-disable vue/one-component-per-file -- Small UI adapters exercise the real file and request lifecycle. */
import type { PropType } from 'vue';

import type { ProductImportResult } from '#/api/fdmplatform/products';

import { createApp, defineComponent, h, nextTick, ref } from 'vue';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import ProductImportDialog from './ProductImportDialog.vue';

const api = vi.hoisted(() => ({
  preview: vi.fn(),
  submit: vi.fn(),
  template: vi.fn(),
  download: vi.fn(),
  key: vi.fn(),
}));
vi.mock('#/api/fdmplatform', () => ({ newIdempotencyKey: api.key }));
vi.mock('#/api/fdmplatform/products', () => ({
  previewProductImport: api.preview,
  importProducts: api.submit,
  downloadProductImportTemplate: api.template,
}));
vi.mock('@vben/utils', () => ({ downloadFileFromBlobPart: api.download }));
vi.mock('ant-design-vue', () => {
  const block = defineComponent({
    setup(_, { slots }) {
      return () => h('div', slots.default?.());
    },
  });
  return {
    Alert: defineComponent({
      props: { message: { type: String, default: '' } },
      setup(props) {
        return () => h('p', { role: 'alert' }, props.message);
      },
    }),
    Button: defineComponent({
      props: { disabled: Boolean, loading: Boolean },
      setup(props, { attrs, slots }) {
        return () =>
          h(
            'button',
            {
              ...attrs,
              type: 'button',
              disabled: props.disabled || props.loading,
            },
            slots.default?.(),
          );
      },
    }),
    Checkbox: defineComponent({
      props: { checked: Boolean },
      emits: ['update:checked'],
      setup(props, { emit, slots }) {
        return () =>
          h('label', [
            h('input', {
              type: 'checkbox',
              checked: props.checked,
              onChange: (event: Event) =>
                emit(
                  'update:checked',
                  (event.target as HTMLInputElement).checked,
                ),
            }),
            slots.default?.(),
          ]);
      },
    }),
    Modal: defineComponent({
      props: { open: Boolean },
      setup(props, { slots }) {
        return () =>
          props.open
            ? h('section', [slots.default?.(), slots.footer?.()])
            : null;
      },
    }),
    Space: block,
    Table: defineComponent({
      props: {
        dataSource: {
          type: Array as PropType<ProductImportResult['rows']>,
          default: () => [],
        },
      },
      setup(props) {
        return () =>
          h(
            'div',
            props.dataSource.map((row) =>
              h(
                'div',
                { 'data-row': row.rowNumber },
                `${row.code} ${row.message}`,
              ),
            ),
          );
      },
    }),
    Tag: block,
    Upload: {
      Dragger: defineComponent({
        props: {
          beforeUpload: { type: Function, required: true },
          disabled: Boolean,
        },
        setup(props, { slots }) {
          return () =>
            h('div', [
              h('input', {
                type: 'file',
                disabled: props.disabled,
                onChange: (event: Event) => {
                  const file = (event.target as HTMLInputElement).files?.[0];
                  if (file) props.beforeUpload(file);
                },
              }),
              slots.default?.(),
            ]);
        },
      }),
    },
  };
});

function previewResult(): ProductImportResult {
  return {
    fileName: 'products.xlsx',
    previewHash: 'verified-bytes',
    totalCount: 3,
    readyCount: 1,
    createdCount: 0,
    skippedCount: 1,
    errorCount: 1,
    warnings: [],
    rows: [
      {
        rowNumber: 3,
        code: 'A',
        name: '产品 A',
        status: 'READY',
        message: '可以新增',
        values: { specification: '10 cm', unit: '件', active: true },
      },
      {
        rowNumber: 5,
        code: 'B',
        name: '产品 B',
        status: 'SKIPPED',
        message: '产品编号已存在',
        values: {},
      },
      {
        rowNumber: 7,
        code: 'C',
        name: '产品 C',
        status: 'ERROR',
        message: '请填写产品单位',
        values: {},
      },
    ],
  };
}
const cleanup: (() => void)[] = [];
async function mountDialog() {
  const open = ref(true);
  const imported = vi.fn();
  const host = document.createElement('div');
  const app = createApp({
    render: () =>
      h(ProductImportDialog, {
        companyId: 0,
        open: open.value,
        onClose: () => {
          open.value = false;
        },
        onImported: imported,
      }),
  });
  app.mount(host);
  cleanup.push(() => app.unmount());
  await nextTick();
  const button = (label: string) =>
    [...host.querySelectorAll<HTMLButtonElement>('button')].find(
      (item) => item.textContent?.trim() === label,
    )!;
  const choose = async (file: File) => {
    const input = host.querySelector<HTMLInputElement>('input[type="file"]')!;
    Object.defineProperty(input, 'files', {
      configurable: true,
      value: [file],
    });
    input.dispatchEvent(new Event('change'));
    await nextTick();
  };
  return { host, button, choose, open, imported };
}
beforeEach(() => {
  vi.clearAllMocks();
  let key = 0;
  api.key.mockImplementation(() => `import-key-${++key}`);
  api.preview.mockResolvedValue(previewResult());
  api.submit.mockResolvedValue({
    ...previewResult(),
    readyCount: 0,
    createdCount: 1,
  });
});
afterEach(() => cleanup.splice(0).forEach((dispose) => dispose()));

describe('产品 Excel 导入交互', () => {
  it('校验当前文件并保留原始 Excel 行号，问题筛选不改变提交文件', async () => {
    const { host, button, choose, imported } = await mountDialog();
    const file = new File(['xlsx'], 'products.xlsx');
    expect(button('校验并预览').disabled).toBe(true);
    await choose(file);
    button('校验并预览').click();
    await vi.waitFor(() => expect(button('导入 1 个有效产品')).toBeTruthy());
    expect(api.preview).toHaveBeenCalledWith(file, 0);
    const checkbox = host.querySelector<HTMLInputElement>(
      'input[type="checkbox"]',
    )!;
    checkbox.checked = true;
    checkbox.dispatchEvent(new Event('change'));
    await nextTick();
    expect(
      [...host.querySelectorAll<HTMLElement>('[data-row]')].map(
        (row) => row.dataset.row,
      ),
    ).toEqual(['5', '7']);
    button('导入 1 个有效产品').click();
    await vi.waitFor(() => expect(imported).toHaveBeenCalledOnce());
    expect(api.submit).toHaveBeenCalledWith({
      file,
      companyId: 0,
      previewHash: 'verified-bytes',
      idempotencyKey: 'import-key-1',
    });
    expect(host.textContent).toContain('导入完成：新增 1 个产品');
    expect(button('导入 1 个有效产品')).toBeUndefined();
  });

  it('替换或移除文件后必须重新校验，不能提交旧预览', async () => {
    const { button, choose, host } = await mountDialog();
    await choose(new File(['old'], 'old.xlsx'));
    button('校验并预览').click();
    await vi.waitFor(() => expect(button('导入 1 个有效产品')).toBeTruthy());
    const newest = new File(['latest'], 'latest.xlsx');
    await choose(newest);
    expect(button('导入 1 个有效产品')).toBeUndefined();
    expect(host.querySelector('[data-row]')).toBeNull();
    button('校验并预览').click();
    await vi.waitFor(() =>
      expect(api.preview).toHaveBeenLastCalledWith(newest, 0),
    );
    await nextTick();
    button('移除文件').click();
    await nextTick();
    expect(button('校验并预览').disabled).toBe(true);
    expect(host.textContent).not.toContain('latest.xlsx');
    expect(api.submit).not.toHaveBeenCalled();
  });

  it('请求中锁定文件和关闭按钮，失败后关闭重开仍以相同文件及幂等键重试', async () => {
    const { button, choose, host, open } = await mountDialog();
    const file = new File(['same'], 'same.xlsx');
    await choose(file);
    button('校验并预览').click();
    await vi.waitFor(() => expect(button('导入 1 个有效产品')).toBeTruthy());
    let reject!: (error: Error) => void;
    api.submit.mockImplementationOnce(
      () =>
        new Promise((_resolve, rejectRequest) => {
          reject = rejectRequest;
        }),
    );
    button('导入 1 个有效产品').click();
    await nextTick();
    expect(button('关闭').disabled).toBe(true);
    expect(button('移除文件').disabled).toBe(true);
    expect(
      host.querySelector<HTMLInputElement>('input[type="file"]')!.disabled,
    ).toBe(true);
    button('导入 1 个有效产品').click();
    expect(api.submit).toHaveBeenCalledTimes(1);
    reject(new Error('网络中断'));
    await vi.waitFor(() => expect(host.textContent).toContain('网络中断'));
    button('关闭').click();
    await nextTick();
    expect(host.querySelector('section')).toBeNull();
    open.value = true;
    await nextTick();
    button('导入 1 个有效产品').click();
    await vi.waitFor(() => expect(api.submit).toHaveBeenCalledTimes(2));
    expect(api.submit.mock.calls[1]![0]).toEqual(api.submit.mock.calls[0]![0]);
    expect(api.submit.mock.calls[1]![0].file).toBe(file);
  });

  it('拒绝非 Excel 与超大文件，清除旧文件避免误导入', async () => {
    const { button, choose, host } = await mountDialog();
    await choose(new File(['valid'], 'valid.xlsx'));
    await choose(new File(['invalid'], 'invalid.csv'));
    expect(button('校验并预览').disabled).toBe(true);
    expect(host.textContent).toContain('请选择 .xls 或 .xlsx');
    const large = new File(['large'], 'large.xlsx');
    Object.defineProperty(large, 'size', { value: 10 * 1024 * 1024 + 1 });
    await choose(large);
    expect(button('校验并预览').disabled).toBe(true);
    expect(host.textContent).toContain('不能超过 10 MB');
    expect(api.preview).not.toHaveBeenCalled();
  });

  it('没有可导入行时禁用提交，并下载后端模板', async () => {
    api.preview.mockResolvedValue({ ...previewResult(), readyCount: 0 });
    const blob = new Blob(['template']);
    api.template.mockResolvedValue(blob);
    const { button, choose } = await mountDialog();
    button('下载 Excel 模板').click();
    await vi.waitFor(() =>
      expect(api.download).toHaveBeenCalledWith({
        source: blob,
        fileName: '产品信息导入模板.xlsx',
      }),
    );
    expect(api.template).toHaveBeenCalledWith(0);
    await choose(new File(['empty'], 'empty.xlsx'));
    button('校验并预览').click();
    await vi.waitFor(() => expect(button('导入 0 个有效产品')).toBeTruthy());
    expect(button('导入 0 个有效产品').disabled).toBe(true);
    button('导入 0 个有效产品').click();
    expect(api.submit).not.toHaveBeenCalled();
  });
});
