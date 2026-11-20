/* eslint-disable vue/one-component-per-file -- Small UI adapters exercise the real file and request lifecycle. */
import type { PropType } from 'vue';

import type {
  ProductAttributeOption,
  ProductImportResult,
} from '#/api/fdmplatform/products';

import { createApp, defineComponent, h, nextTick, ref } from 'vue';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import ProductImportDialog from './ProductImportDialog.vue';

const api = vi.hoisted(() => ({
  preview: vi.fn(),
  submit: vi.fn(),
  template: vi.fn(),
  download: vi.fn(),
  options: vi.fn(),
  categories: vi.fn(),
  key: vi.fn(),
}));
vi.mock('#/api/fdmplatform', () => ({ newIdempotencyKey: api.key }));
vi.mock('#/api/fdmplatform/products', () => ({
  previewProductImport: api.preview,
  importProducts: api.submit,
  downloadProductImportTemplate: api.template,
  getProductAttributeOptions: api.options,
  getProductCategoryList: api.categories,
}));
vi.mock('@vben/utils', () => ({ downloadFileFromBlobPart: api.download }));
vi.mock('ant-design-vue', () => {
  const block = defineComponent({
    setup(_, { slots }) {
      return () => h('div', slots.default?.());
    },
  });
  const input = defineComponent({
    props: { value: String },
    emits: ['update:value'],
    setup(props, { attrs, emit }) {
      return () =>
        h('input', {
          ...attrs,
          value: props.value ?? '',
          onInput: (event: Event) =>
            emit('update:value', (event.target as HTMLInputElement).value),
        });
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
    Form: Object.assign(block, { Item: block }),
    Input: Object.assign(input, { TextArea: input }),
    Modal: defineComponent({
      props: { open: Boolean, okText: String },
      emits: ['ok'],
      setup(props, { emit, slots }) {
        return () =>
          props.open
            ? h(
                'section',
                { 'data-row-editor': props.okText ? '' : undefined },
                [
                  slots.default?.(),
                  slots.footer?.(),
                  props.okText &&
                    h('button', { onClick: () => emit('ok') }, props.okText),
                ],
              )
            : null;
      },
    }),
    Select: defineComponent({
      props: {
        value: String,
        options: {
          type: Array as PropType<
            Array<ProductAttributeOption & { disabled?: boolean }>
          >,
          default: () => [],
        },
      },
      emits: ['update:value'],
      setup(props, { attrs, emit }) {
        return () =>
          h(
            'select',
            {
              ...attrs,
              value: props.value ?? '',
              onChange: (event: Event) =>
                emit('update:value', (event.target as HTMLSelectElement).value),
            },
            [
              h('option', { value: '' }),
              ...props.options.map(({ value, label, disabled }) =>
                h('option', { value, disabled }, label),
              ),
            ],
          );
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
      setup(props, { slots }) {
        return () =>
          h(
            'div',
            props.dataSource.map((row) =>
              h('div', { 'data-row': row.rowNumber }, [
                `${row.code} ${row.message}`,
                slots.bodyCell?.({
                  column: { key: 'configuration' },
                  record: row,
                }),
                slots.bodyCell?.({ column: { key: 'action' }, record: row }),
              ]),
            ),
          );
      },
    }),
    Tabs: Object.assign(block, { TabPane: block }),
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
        rawCells: { 正面颜色: 'Excel 原来写错的颜色', 产品编号: 'C' },
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
  api.options.mockResolvedValue({
    colors: [{ value: 'BLACK6C', label: 'Black 6C' }],
    matTypes: [],
    stages: [],
    textures: [],
  });
  api.categories.mockResolvedValue([]);
  api.preview.mockResolvedValue(previewResult());
  api.submit.mockResolvedValue({
    ...previewResult(),
    readyCount: 0,
    createdCount: 1,
  });
});
afterEach(() => cleanup.splice(0).forEach((dispose) => dispose()));

describe('产品 Excel 导入交互', () => {
  it('外采行允许生产参数为空，预览和导入结果都不标为待补齐', async () => {
    const original = previewResult();
    const row = { ...original.rows[0]!, productSource: '外采' };
    const preview: ProductImportResult = {
      ...original,
      totalCount: 1,
      errorCount: 0,
      skippedCount: 0,
      rows: [row],
    };
    api.preview.mockResolvedValue(preview);
    api.submit.mockResolvedValue({
      ...preview,
      readyCount: 0,
      createdCount: 1,
      rows: [{ ...row, status: 'IMPORTED' }],
    });
    const { button, choose, host, imported } = await mountDialog();
    await choose(new File(['external'], 'external.xlsx'));
    await vi.waitFor(() => expect(button('导入 1 个有效产品')).toBeTruthy());
    expect(host.textContent).toContain('长宽厚按需维护');
    expect(
      host.querySelector('.import-results div:last-child strong')?.textContent,
    ).toBe('0');
    button('导入 1 个有效产品').click();
    await vi.waitFor(() => expect(imported).toHaveBeenCalledOnce());
    expect(
      host.querySelector('.import-results div:last-child strong')?.textContent,
    ).toBe('0');
  });

  it('完整配置命中已有 SKU 时允许仅复用批次提交，不把复用统计为新增', async () => {
    const reused = {
      ...previewResult(),
      totalCount: 1,
      readyCount: 0,
      skippedCount: 0,
      errorCount: 0,
      rows: [
        {
          rowNumber: 3,
          code: 'OLD',
          name: '完整产品',
          status: 'REUSE' as const,
          productId: 'existing',
          message: '配置相同，复用已有SKU',
          values: {
            lengthMm: 1830,
            widthMm: 610,
            finishedThicknessMm: 6,
            colorMode: 'SINGLE' as const,
            frontColor: 'P',
            backColor: 'P',
            textureFront: 'NONE',
            textureBack: 'NONE',
            patternMode: 'NONE' as const,
          },
        },
      ],
    };
    api.preview.mockResolvedValue(reused);
    api.submit.mockResolvedValue({
      ...reused,
      reusedCount: 1,
      createdCount: 0,
      rows: reused.rows.map((row) => ({ ...row, status: 'REUSED' })),
    });
    const { button, choose, imported, host } = await mountDialog();
    await choose(new File(['same-sku'], 'same.xlsx'));
    await vi.waitFor(() => expect(button('导入 1 个有效产品')).toBeTruthy());
    expect(button('导入 1 个有效产品').disabled).toBe(false);
    button('导入 1 个有效产品').click();
    await vi.waitFor(() => expect(imported).toHaveBeenCalledOnce());
    expect(host.textContent).toContain('新增 0 个产品，复用 1 个 SKU');
  });
  it('校验当前文件并保留原始 Excel 行号，问题筛选不改变提交文件', async () => {
    const { host, button, choose, imported } = await mountDialog();
    const file = new File(['xlsx'], 'products.xlsx');
    expect(button('校验并预览').disabled).toBe(true);
    await choose(file);
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
    await vi.waitFor(() => expect(button('导入 1 个有效产品')).toBeTruthy());
    const newest = new File(['latest'], 'latest.xlsx');
    let resolvePreview!: (result: ProductImportResult) => void;
    api.preview.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolvePreview = resolve;
        }),
    );
    await choose(newest);
    expect(button('导入 1 个有效产品')).toBeUndefined();
    expect(host.querySelector('[data-row]')).toBeNull();
    await vi.waitFor(() =>
      expect(api.preview).toHaveBeenLastCalledWith(newest, 0),
    );
    resolvePreview(previewResult());
    await vi.waitFor(() => expect(button('导入 1 个有效产品')).toBeTruthy());
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
    await vi.waitFor(() => expect(button('导入 1 个有效产品')).toBeTruthy());
    await choose(new File(['invalid'], 'invalid.csv'));
    expect(button('校验并预览').disabled).toBe(true);
    expect(host.textContent).toContain('请选择 .xls 或 .xlsx');
    const large = new File(['large'], 'large.xlsx');
    Object.defineProperty(large, 'size', { value: 10 * 1024 * 1024 + 1 });
    await choose(large);
    expect(button('校验并预览').disabled).toBe(true);
    expect(host.textContent).toContain('不能超过 10 MB');
    expect(api.preview).toHaveBeenCalledTimes(1);
  });

  it('没有可导入行时禁用提交，自产和外采下载各自的后端模板', async () => {
    api.preview.mockResolvedValue({ ...previewResult(), readyCount: 0 });
    const blob = new Blob(['template']);
    api.template.mockResolvedValue(blob);
    const { button, choose } = await mountDialog();
    button('下载自产模板').click();
    await vi.waitFor(() =>
      expect(api.download).toHaveBeenNthCalledWith(1, {
        source: blob,
        fileName: '自产产品导入模板.xlsx',
      }),
    );
    button('下载外采模板').click();
    await vi.waitFor(() =>
      expect(api.download).toHaveBeenNthCalledWith(2, {
        source: blob,
        fileName: '外采产品导入模板.xlsx',
      }),
    );
    expect(api.template.mock.calls).toEqual([
      [0, '自产'],
      [0, '外采'],
    ]);
    await choose(new File(['empty'], 'empty.xlsx'));
    await vi.waitFor(() => expect(button('导入 0 个有效产品')).toBeTruthy());
    expect(button('导入 0 个有效产品').disabled).toBe(true);
    button('导入 0 个有效产品').click();
    expect(api.submit).not.toHaveBeenCalled();
  });

  it('从色号下拉修正颜色并填写雕刻图案，重新校验前禁止用旧预览导入', async () => {
    const { button, choose, host } = await mountDialog();
    const file = new File(['wrong-color'], 'products.xlsx');
    await choose(file);
    await vi.waitFor(() => expect(button('修改')).toBeTruthy());
    button('修改').click();
    await nextTick();
    const editor = host.querySelector('[data-row-editor]')!;
    const frontColor = editor.querySelector<HTMLSelectElement>(
      'select[aria-label="正面色号"]',
    )!;
    expect(frontColor.value).toBe('Excel 原来写错的颜色');
    expect(frontColor.selectedOptions[0]?.disabled).toBe(true);
    expect(editor.querySelector('select[aria-label="反面色号"]')).toBeTruthy();
    expect(editor.querySelector('select[aria-label="色号"]')).toBeTruthy();
    await vi.waitFor(() =>
      expect(frontColor.querySelector('option[value="BLACK6C"]')).toBeTruthy(),
    );
    frontColor.value = 'BLACK6C';
    frontColor.dispatchEvent(new Event('change', { bubbles: true }));
    const pattern = editor.querySelector<HTMLInputElement>(
      'input[aria-label="激光图案"]',
    )!;
    expect(pattern.maxLength).toBe(32);
    pattern.value = '客户山水-A';
    pattern.dispatchEvent(new Event('input', { bubbles: true }));
    const unit = editor.querySelector<HTMLInputElement>(
      'input[aria-label="单位"]',
    )!;
    unit.value = '件';
    unit.dispatchEvent(new Event('input', { bubbles: true }));
    await nextTick();
    button('保存修改').click();
    await nextTick();
    expect(button('导入 1 个有效产品').disabled).toBe(true);
    expect(host.textContent).toContain('已修改 1 行');
    expect(api.submit).not.toHaveBeenCalled();

    api.preview.mockRejectedValueOnce(new Error('网络中断'));
    button('重新校验').click();
    await vi.waitFor(() => expect(host.textContent).toContain('网络中断'));
    expect(button('导入 1 个有效产品').disabled).toBe(true);

    api.preview.mockResolvedValueOnce({
      ...previewResult(),
      previewHash: 'verified-corrections',
      readyCount: 2,
      errorCount: 0,
    });
    button('重新校验').click();
    const corrections = {
      7: { 正面颜色: 'BLACK6C', 激光图案: '客户山水-A', 单位: '件' },
    };
    await vi.waitFor(() => expect(button('导入 2 个有效产品')).toBeTruthy());
    expect(api.preview).toHaveBeenLastCalledWith(file, 0, corrections);
    button('导入 2 个有效产品').click();
    await vi.waitFor(() =>
      expect(api.submit).toHaveBeenCalledWith({
        file,
        companyId: 0,
        corrections,
        previewHash: 'verified-corrections',
        idempotencyKey: 'import-key-2',
      }),
    );
  });
});
