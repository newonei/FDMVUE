/* eslint-disable vue/one-component-per-file -- Small adapters exercise the actual attachment panel. */
import type { PropType } from 'vue';

import type { ContractAttachment } from '#/api/fdmplatform';

import { createApp, defineComponent, h, nextTick, ref } from 'vue';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import AttachmentPanel from './AttachmentPanel.vue';

interface DownloadOptions {
  onDownloadProgress: (event: { loaded: number; total: number }) => void;
  signal: AbortSignal;
}

type DownloadAttachment = (
  contractId: string,
  fileId: string,
  options: DownloadOptions,
) => Promise<Blob>;

const mocks = vi.hoisted(() => ({
  closePreview: vi.fn(),
  confirm: vi.fn<(options: { onOk: () => Promise<void> }) => void>(),
  deleteAttachment: vi.fn(),
  downloadAttachment: vi.fn<DownloadAttachment>(),
  key: 0,
  saveBlob: vi.fn<(options: { fileName: string; source: Blob }) => void>(),
  showPreview: vi.fn<(blob: Blob, fileName: string) => void>(),
  success: vi.fn(),
  upload: vi.fn(),
}));
vi.mock('#/api/fdmplatform', () => ({
  uploadAttachment: mocks.upload,
  deleteAttachment: mocks.deleteAttachment,
  downloadAttachment: mocks.downloadAttachment,
  renameAttachment: vi.fn(),
  newIdempotencyKey: () => `upload-key-${++mocks.key}`,
}));
vi.mock(
  '#/api/fdmplatform/submission-files',
  () => import('../../../api/fdmplatform/submission-files'),
);
vi.mock('@vben/icons', () => ({
  Upload: defineComponent({ render: () => null }),
}));
vi.mock('@vben/stores', () => ({
  useUserStore: () => ({ userInfo: { id: 1 } }),
}));
vi.mock('@vben/utils', () => ({ downloadFileFromBlobPart: mocks.saveBlob }));
vi.mock('../data', () => ({ errorText: (error: Error) => error.message }));
vi.mock('../directory', () => ({ personLabel: () => '用户' }));
vi.mock('./attachment-preview', () => ({
  attachmentTime: () => '',
  previewMimeType: (name: string) =>
    name.endsWith('.pdf') ? 'application/pdf' : undefined,
}));
vi.mock('./AttachmentPreview.vue', () => ({
  default: defineComponent({
    setup: (_, { expose }) => {
      expose({ close: mocks.closePreview, show: mocks.showPreview });
      return () => null;
    },
  }),
}));
vi.mock('./RenameFileDialog.vue', () => ({
  default: defineComponent({ render: () => null }),
}));
vi.mock('ant-design-vue', () => {
  const Wrap = defineComponent({
    setup: (_, ctx) => () => h('div', ctx.slots.default?.()),
  });
  return {
    Alert: defineComponent({
      props: ['message'],
      setup: (props) => () => h('div', { role: 'alert' }, props.message),
    }),
    Button: defineComponent({
      props: ['disabled', 'loading'],
      setup: (props, ctx) => () =>
        h(
          'button',
          { ...ctx.attrs, disabled: props.disabled || props.loading },
          ctx.slots.default?.(),
        ),
    }),
    Dropdown: defineComponent({
      setup: (_, ctx) => () =>
        h('div', [ctx.slots.default?.(), ctx.slots.overlay?.()]),
    }),
    Menu: Object.assign(Wrap, {
      Item: defineComponent({
        props: ['disabled'],
        setup: (props, ctx) => () =>
          h('button', { disabled: props.disabled }, ctx.slots.default?.()),
      }),
    }),
    Modal: { confirm: mocks.confirm },
    Empty: Wrap,
    Space: Wrap,
    Table: defineComponent({
      props: {
        columns: { type: Array as PropType<{ key: string }[]>, required: true },
        dataSource: {
          type: Array as PropType<ContractAttachment[]>,
          required: true,
        },
      },
      setup(props, { slots }) {
        return () => {
          const rows = props.dataSource.map((record) => {
            const cells = props.columns.map((column) =>
              h(
                'td',
                { key: column.key },
                slots.bodyCell?.({ column, record }),
              ),
            );
            return h(
              'tr',
              { 'data-row-key': record.id, key: record.id },
              cells,
            );
          });
          return h('table', [h('tbody', rows)]);
        };
      },
    }),
    Select: defineComponent({
      props: ['value', 'options', 'disabled'],
      emits: ['update:value', 'change'],
      setup: (props, ctx) => () =>
        h(
          'select',
          {
            value: props.value,
            disabled: props.disabled,
            onChange: (event: Event) => {
              const value = (event.target as HTMLSelectElement).value;
              ctx.emit('update:value', value);
              ctx.emit('change', value);
            },
          },
          (props.options ?? []).map(
            (option: { label: string; value: string }) =>
              h('option', { value: option.value }, option.label),
          ),
        ),
    }),
    message: { success: mocks.success },
  };
});

const quote: ContractAttachment = {
  category: 'PROCUREMENT',
  createdAt: 0,
  id: 'existing-file',
  name: '供应商报价.pdf',
  sha256: '',
  size: 8192,
  type: 'application/pdf',
  uploadedBy: 1,
};

const cleanup: (() => void)[] = [];
beforeEach(() => {
  vi.clearAllMocks();
  mocks.downloadAttachment.mockReset();
  mocks.key = 0;
  mocks.upload.mockResolvedValue({});
});
afterEach(() => {
  cleanup.splice(0).forEach((dispose) => dispose());
  vi.useRealTimers();
});
async function settle() {
  for (let i = 0; i < 8; i++) {
    await Promise.resolve();
    await nextTick();
  }
}
async function mount(
  options: {
    categories?: string[];
    defaultCategory?: string;
    items?: ContractAttachment[];
    variant?: 'purchase';
  } = {},
) {
  const categories = options.categories ?? ['PROCUREMENT'];
  const state = ref({
    contractId: 'contract-1',
    target: { targetKind: 'purchaseOrders', targetId: 'order-1' },
  });
  const view = ref({
    enabled: true,
    uploadCategories: categories,
    items: options.items ?? [quote],
  });
  const refresh = vi.fn();
  const busy = vi.fn();
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp({
    render: () =>
      h(AttachmentPanel, {
        ...state.value,
        view: view.value,
        categories,
        defaultCategory: options.defaultCategory,
        variant: options.variant,
        error: '',
        loading: false,
        onRefresh: refresh,
        onBusy: busy,
      }),
  });
  app.mount(host);
  cleanup.push(() => {
    app.unmount();
    host.remove();
  });
  await settle();
  return { host, state, view, refresh, busy };
}
async function choose(host: HTMLElement, names: string[]) {
  const input = host.querySelector<HTMLInputElement>('input[type=file]')!;
  Object.defineProperty(input, 'files', {
    configurable: true,
    value: names.map((name) => new File(['data'], name, { lastModified: 100 })),
  });
  input.dispatchEvent(new Event('change'));
  await settle();
}
function uploadButton(host: HTMLElement) {
  return [...host.querySelectorAll('button')].find((button) =>
    /^上传[（(]/.test(button.textContent!.trim()),
  )!;
}

function attachmentRow(host: HTMLElement, file: ContractAttachment) {
  const row = host.querySelector<HTMLTableRowElement>(
    `tr[data-row-key="${file.id}"]`,
  );
  if (!row) throw new Error(`找不到附件行：${file.name}`);
  return row;
}

function rowAction(row: HTMLElement, label: string) {
  return [...row.querySelectorAll('button')].find(
    (button) => button.textContent?.trim() === label,
  );
}

function clickRowAction(row: HTMLElement, label: string) {
  const button = rowAction(row, label);
  if (!button) throw new Error(`找不到附件操作：${label}`);
  expect(button.disabled).toBe(false);
  button.click();
}

function mockStalledDownload() {
  mocks.downloadAttachment.mockImplementationOnce(
    (_contractId, _fileId, { signal }) =>
      new Promise((_resolve, reject) => {
        signal.addEventListener(
          'abort',
          () => reject(new DOMException('读取已取消', 'AbortError')),
          { once: true },
        );
      }),
  );
}

it('confirms deletion of the permitted file and refreshes its attachment list', async () => {
  const removable = { ...quote, id: 'removable', canDelete: true };
  const { host, refresh } = await mount({ items: [quote, removable] });

  expect(rowAction(attachmentRow(host, quote), '删除')).toBeUndefined();
  const row = attachmentRow(host, removable);
  expect(row.querySelector('[aria-haspopup="menu"]')).toBeTruthy();
  clickRowAction(row, '删除');
  expect(mocks.deleteAttachment).not.toHaveBeenCalled();

  await mocks.confirm.mock.calls[0]![0].onOk();
  expect(mocks.deleteAttachment).toHaveBeenCalledExactlyOnceWith(
    'contract-1',
    'removable',
  );
  expect(refresh).toHaveBeenCalledTimes(1);
  expect(mocks.success).toHaveBeenCalledWith('附件已删除');
});

describe('attachment transfers', () => {
  it('shows preview progress and passes the original blob and file name to the preview', async () => {
    const read = Promise.withResolvers<Blob>();
    mocks.downloadAttachment.mockReturnValueOnce(read.promise);
    const { host } = await mount();
    const row = attachmentRow(host, quote);

    clickRowAction(row, '预览');
    await nextTick();
    expect(mocks.downloadAttachment).toHaveBeenCalledExactlyOnceWith(
      'contract-1',
      quote.id,
      {
        onDownloadProgress: expect.any(Function),
        signal: expect.any(AbortSignal),
      },
    );
    expect(row.textContent).toContain('正在读取');
    expect(mocks.showPreview).not.toHaveBeenCalled();

    const { onDownloadProgress } = mocks.downloadAttachment.mock.calls[0]![2];
    onDownloadProgress({ loaded: 1024, total: quote.size });
    await nextTick();
    expect(row.textContent).toContain('正在读取 1.0 KB / 8.0 KB');

    const blob = new Blob(['quote'], { type: 'application/octet-stream' });
    read.resolve(blob);
    await settle();
    expect(mocks.showPreview).toHaveBeenCalledExactlyOnceWith(blob, quote.name);
    expect(mocks.showPreview.mock.calls[0]![0]).toBe(blob);
    expect(rowAction(row, '预览')?.disabled).toBe(false);
    expect(row.textContent).not.toContain('正在读取');
  });

  it('shows download status and saves the retrieved blob with its attachment file name', async () => {
    const read = Promise.withResolvers<Blob>();
    mocks.downloadAttachment.mockReturnValueOnce(read.promise);
    const { host } = await mount();
    const row = attachmentRow(host, quote);

    clickRowAction(row, '下载');
    await nextTick();
    expect(mocks.downloadAttachment).toHaveBeenCalledExactlyOnceWith(
      'contract-1',
      quote.id,
      {
        onDownloadProgress: expect.any(Function),
        signal: expect.any(AbortSignal),
      },
    );
    expect(row.textContent).toContain('正在下载');
    expect(mocks.saveBlob).not.toHaveBeenCalled();

    const blob = new Blob(['quote']);
    read.resolve(blob);
    await settle();
    expect(mocks.saveBlob).toHaveBeenCalledExactlyOnceWith({
      fileName: quote.name,
      source: blob,
    });
    expect(mocks.saveBlob.mock.calls[0]![0].source).toBe(blob);
    expect(rowAction(row, '下载')?.disabled).toBe(false);
    expect(row.textContent).not.toContain('正在下载');
  });

  it('shows a download failure and lets the user retry the same file', async () => {
    const blob = new Blob(['quote']);
    mocks.downloadAttachment
      .mockRejectedValueOnce(new Error('网络中断'))
      .mockResolvedValueOnce(blob);
    const { host } = await mount();
    const row = attachmentRow(host, quote);

    clickRowAction(row, '下载');
    await settle();
    expect(host.querySelector('[role="alert"]')?.textContent).toContain(
      '网络中断',
    );
    expect(mocks.saveBlob).not.toHaveBeenCalled();

    clickRowAction(row, '下载');
    await settle();
    expect(mocks.downloadAttachment).toHaveBeenCalledTimes(2);
    expect(mocks.saveBlob).toHaveBeenCalledExactlyOnceWith({
      fileName: quote.name,
      source: blob,
    });
    expect(host.querySelector('[role="alert"]')).toBeNull();
  });

  it('aborts a stalled preview after 45 seconds without new data and allows a retry', async () => {
    vi.useFakeTimers();
    mockStalledDownload();
    const blob = new Blob(['quote']);
    mocks.downloadAttachment.mockResolvedValueOnce(blob);
    const { host } = await mount();
    const row = attachmentRow(host, quote);

    clickRowAction(row, '预览');
    const { onDownloadProgress, signal } =
      mocks.downloadAttachment.mock.calls[0]![2];
    await vi.advanceTimersByTimeAsync(30_000);
    onDownloadProgress({ loaded: 1024, total: quote.size });
    await vi.advanceTimersByTimeAsync(44_999);
    expect(signal.aborted).toBe(false);
    expect(row.textContent).toContain('正在读取');
    expect(host.querySelector('[role="alert"]')).toBeNull();

    await vi.advanceTimersByTimeAsync(1);
    await settle();
    expect(signal.aborted).toBe(true);
    expect(host.querySelector('[role="alert"]')?.textContent).toContain(
      '长时间未收到数据，请重试。',
    );
    expect(mocks.showPreview).not.toHaveBeenCalled();

    clickRowAction(row, '预览');
    await settle();
    expect(mocks.downloadAttachment).toHaveBeenCalledTimes(2);
    expect(mocks.showPreview).toHaveBeenCalledExactlyOnceWith(blob, quote.name);
  });

  it('keeps the first row locked while starting and cancelling a transfer on another row', async () => {
    const drawing = { ...quote, id: 'drawing', name: '图纸.pdf' };
    const { host } = await mount({ items: [quote, drawing] });
    const firstRow = attachmentRow(host, quote);
    const secondRow = attachmentRow(host, drawing);
    const firstRead = Promise.withResolvers<Blob>();
    mocks.downloadAttachment.mockReturnValueOnce(firstRead.promise);
    mockStalledDownload();

    clickRowAction(firstRow, '预览');
    await nextTick();
    clickRowAction(secondRow, '下载');
    await nextTick();
    expect(rowAction(firstRow, '预览')?.disabled).toBe(true);
    expect(rowAction(firstRow, '下载')?.disabled).toBe(true);
    expect(firstRow.textContent).toContain('正在读取');
    expect(secondRow.textContent).toContain('正在下载');
    const firstSignal = mocks.downloadAttachment.mock.calls[0]![2].signal;
    const secondSignal = mocks.downloadAttachment.mock.calls[1]![2].signal;

    clickRowAction(secondRow, '取消');
    await settle();
    expect(secondSignal.aborted).toBe(true);
    expect(firstSignal.aborted).toBe(false);
    expect(rowAction(secondRow, '下载')?.disabled).toBe(false);
    expect(rowAction(firstRow, '下载')?.disabled).toBe(true);
    expect(mocks.saveBlob).not.toHaveBeenCalled();
    expect(host.querySelector('[role="alert"]')).toBeNull();

    const blob = new Blob(['quote']);
    firstRead.resolve(blob);
    await settle();
    expect(mocks.showPreview).toHaveBeenCalledExactlyOnceWith(blob, quote.name);
    expect(rowAction(firstRow, '下载')?.disabled).toBe(false);
  });

  it('closes the preview on a target change and ignores a late result for the same attachment ID', async () => {
    const previous = new Blob(['previous quote']);
    const oldRead = Promise.withResolvers<Blob>();
    const newRead = Promise.withResolvers<Blob>();
    // The old request can still resolve after abort if its response was already queued.
    mocks.downloadAttachment
      .mockResolvedValueOnce(previous)
      .mockReturnValueOnce(oldRead.promise)
      .mockReturnValueOnce(newRead.promise);
    const { host, state } = await mount();
    const row = attachmentRow(host, quote);
    clickRowAction(row, '预览');
    await settle();
    expect(mocks.showPreview).toHaveBeenCalledExactlyOnceWith(
      previous,
      quote.name,
    );

    clickRowAction(row, '预览');
    await nextTick();
    const oldSignal = mocks.downloadAttachment.mock.calls[1]![2].signal;
    state.value.target = { targetKind: 'purchaseOrders', targetId: 'order-2' };
    await nextTick();
    expect(mocks.closePreview).toHaveBeenCalledOnce();
    expect(oldSignal.aborted).toBe(true);

    const currentRow = attachmentRow(host, quote);
    clickRowAction(currentRow, '预览');
    oldRead.resolve(new Blob(['stale quote']));
    await settle();
    expect(mocks.showPreview).toHaveBeenCalledOnce();
    expect(currentRow.textContent).toContain('正在读取');
    expect(rowAction(currentRow, '预览')?.disabled).toBe(true);

    const current = new Blob(['current quote']);
    newRead.resolve(current);
    await settle();
    expect(mocks.showPreview).toHaveBeenCalledTimes(2);
    expect(mocks.showPreview.mock.calls[1]![0]).toBe(current);
    expect(rowAction(currentRow, '预览')?.disabled).toBe(false);
  });
});

describe('contract purchase attachment queue', () => {
  it('shows all chosen design files and visible uploaded count, removes only the requested file', async () => {
    const { host } = await mount();
    const input = host.querySelector<HTMLInputElement>('input[type=file]')!;
    expect(input.multiple).toBe(true);
    expect(input.accept).toContain('.ai,.plt');
    await choose(host, ['原稿.ai', '裁切.plt']);
    expect(host.textContent).toContain('待上传 2 个文件');
    expect(host.textContent).toContain('已上传附件：1 个');
    expect(host.querySelectorAll('.attachment-pending > li')).toHaveLength(2);
    host
      .querySelector<HTMLButtonElement>('button[aria-label="移除 原稿.ai"]')!
      .click();
    await settle();
    expect(host.textContent).toContain('待上传 1 个文件');
    expect(host.textContent).toContain('裁切.plt');
    expect(host.querySelector('button[aria-label="移除 原稿.ai"]')).toBeNull();
  });

  it('keeps failed files for retry with their original key and never uploads successful files again', async () => {
    const { host, refresh, busy } = await mount();
    mocks.upload
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(new Error('网络中断'))
      .mockResolvedValueOnce({});
    await choose(host, ['原稿.ai', '裁切.plt']);
    uploadButton(host).click();
    await settle();
    expect(mocks.upload).toHaveBeenCalledTimes(2);
    const firstRetryKey = mocks.upload.mock.calls[1]![3];
    expect(mocks.upload.mock.calls[0]!.slice(0, 3)).toEqual([
      'contract-1',
      expect.any(File),
      'PROCUREMENT',
    ]);
    expect(mocks.upload.mock.calls[0]![4]).toEqual({
      targetKind: 'purchaseOrders',
      targetId: 'order-1',
    });
    expect(host.textContent).toContain('成功 1 个，失败 1 个');
    expect(host.querySelectorAll('.attachment-pending > li')).toHaveLength(1);
    expect(host.textContent).toContain('网络中断');
    uploadButton(host).click();
    await settle();
    expect(mocks.upload).toHaveBeenCalledTimes(3);
    expect(mocks.upload.mock.calls[2]![1].name).toBe('裁切.plt');
    expect(mocks.upload.mock.calls[2]![3]).toBe(firstRetryKey);
    expect(host.querySelector('.attachment-pending')).toBeNull();
    expect(refresh).toHaveBeenCalledTimes(2);
    expect(busy).toHaveBeenLastCalledWith(false);
  });

  it('adds every dropped file, deduplicates an accidental re-selection and rejects excessive batches', async () => {
    const { host } = await mount();
    await choose(host, ['原稿.ai']);
    await choose(host, ['原稿.ai']);
    expect(host.querySelectorAll('.attachment-pending > li')).toHaveLength(1);
    const drop = new Event('drop', { bubbles: true, cancelable: true });
    Object.defineProperty(drop, 'dataTransfer', {
      value: {
        files: [new File(['x'], '裁切.plt'), new File(['y'], '打包.zip')],
      },
    });
    host.querySelector('.attachment-toolbar')!.dispatchEvent(drop);
    await settle();
    expect(host.querySelectorAll('.attachment-pending > li')).toHaveLength(3);
    await choose(
      host,
      Array.from({ length: 11 }, (_, i) => `${i}.ai`),
    );
    expect(host.textContent).toContain('每次最多添加 10 个附件');
    expect(host.querySelectorAll('.attachment-pending > li')).toHaveLength(3);
  });

  it('does not send remaining files or refresh the new order when identity changes during an upload', async () => {
    let resolve!: (value: object) => void;
    mocks.upload.mockReturnValueOnce(
      new Promise((done) => {
        resolve = done;
      }),
    );
    const { host, state, refresh } = await mount();
    await choose(host, ['原稿.ai', '裁切.plt']);
    uploadButton(host).click();
    await settle();
    expect(mocks.upload).toHaveBeenCalledTimes(1);
    state.value = {
      contractId: 'contract-2',
      target: { targetKind: 'purchaseOrders', targetId: 'order-2' },
    };
    await settle();
    resolve({});
    await settle();
    expect(mocks.upload).toHaveBeenCalledTimes(1);
    expect(refresh).not.toHaveBeenCalled();
    expect(host.querySelector('.attachment-pending')).toBeNull();
  });
});

describe('purchase attachment panel', () => {
  const purchaseOptions = {
    categories: ['SALES', 'PROCUREMENT', 'SPECIFICATION'],
    defaultCategory: 'PROCUREMENT',
    variant: 'purchase' as const,
  };

  it('preserves selected files when the parent supplies a new target object for the same order', async () => {
    const { host, state } = await mount(purchaseOptions);
    await choose(host, ['供应商报价.pdf', '生产图纸.ai']);
    const previousTarget = state.value.target;
    state.value.target = { ...previousTarget };
    expect(state.value.target).not.toBe(previousTarget);
    await settle();
    expect(host.querySelectorAll('.attachment-pending > li')).toHaveLength(2);
    expect(host.textContent).toContain('供应商报价.pdf');
    expect(host.textContent).toContain('生产图纸.ai');
    expect(uploadButton(host).disabled).toBe(false);
    expect(mocks.key).toBe(2);
    expect(mocks.upload).not.toHaveBeenCalled();
  });

  it('continues the batch and retains retry keys when busy updates rerender the same order target', async () => {
    let rejectFirst!: (error: Error) => void;
    mocks.upload.mockReturnValueOnce(
      new Promise((_resolve, reject) => {
        rejectFirst = reject;
      }),
    );
    const { busy, host, refresh, state } = await mount(purchaseOptions);
    busy.mockImplementation(() => {
      // The parent constructs an inline target object during ordinary renders.
      state.value.target = { ...state.value.target };
    });
    await choose(host, ['供应商报价.pdf', '生产图纸.ai']);
    uploadButton(host).click();
    await settle();
    expect(mocks.upload).toHaveBeenCalledTimes(1);
    const originalRequest = mocks.upload.mock.calls[0]!;
    expect(busy.mock.calls.map(([value]) => value)).toEqual([true]);
    expect(host.querySelectorAll('.attachment-pending > li')).toHaveLength(2);
    expect(
      host.querySelector<HTMLButtonElement>('.purchase-dropzone')!.disabled,
    ).toBe(true);
    expect(refresh).not.toHaveBeenCalled();
    rejectFirst(new Error('网络中断'));
    await settle();
    expect(mocks.upload).toHaveBeenCalledTimes(2);
    expect(mocks.upload.mock.calls[1]![1].name).toBe('生产图纸.ai');
    expect(mocks.upload.mock.calls[1]![3]).toBe('upload-key-2');
    expect(mocks.upload.mock.calls[1]![4]).toEqual(originalRequest[4]);
    expect(host.textContent).toContain('成功 1 个，失败 1 个');
    expect(host.querySelectorAll('.attachment-pending > li')).toHaveLength(1);
    expect(host.textContent).toContain('供应商报价.pdf');
    expect(busy.mock.calls.map(([value]) => value)).toEqual([true, false]);
    uploadButton(host).click();
    await settle();
    expect(mocks.upload).toHaveBeenCalledTimes(3);
    expect(mocks.upload.mock.calls[2]).toEqual(originalRequest);
    expect(mocks.key).toBe(2);
    expect(host.querySelector('.attachment-pending')).toBeNull();
    expect(busy.mock.calls.map(([value]) => value)).toEqual([
      true,
      false,
      true,
      false,
    ]);
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it('defaults to procurement among permitted categories and shows the upload action after choosing files', async () => {
    const { host } = await mount(purchaseOptions);
    expect(host.textContent).toContain('补充附件');
    expect(host.textContent).toContain(
      '报价、图纸、沟通资料等，统一保存在本采购单下。',
    );
    expect(host.querySelector<HTMLSelectElement>('select')!.value).toBe(
      'PROCUREMENT',
    );
    expect(uploadButton(host)).toBeUndefined();
    const input = host.querySelector<HTMLInputElement>('input[type=file]')!;
    expect(input.getAttribute('aria-label')).toBe('选择采购单补充附件');
    expect(input.multiple).toBe(true);
    const click = vi.spyOn(input, 'click');
    host.querySelector<HTMLButtonElement>('.purchase-dropzone')!.click();
    expect(click).toHaveBeenCalledOnce();
    await choose(host, ['供应商报价.pdf', '生产图纸.ai']);
    expect(host.textContent).toContain('待上传 2 个文件');
    expect(uploadButton(host).disabled).toBe(false);
    expect(mocks.upload).not.toHaveBeenCalled();
    uploadButton(host).click();
    await settle();
    expect(mocks.upload).toHaveBeenCalledTimes(2);
    for (const call of mocks.upload.mock.calls) {
      expect(call[2]).toBe('PROCUREMENT');
      expect(call[4]).toEqual({
        targetKind: 'purchaseOrders',
        targetId: 'order-1',
      });
    }
    expect(host.querySelector('.attachment-pending')).toBeNull();
    expect(uploadButton(host)).toBeUndefined();
  });

  it('accepts multiple dropped files and uploads each selected file only once', async () => {
    const { host } = await mount(purchaseOptions);
    await choose(host, ['供应商报价.pdf']);
    const duplicate = new File(['data'], '供应商报价.pdf', {
      lastModified: 100,
    });
    const drawing = new File(['drawing'], '生产图纸.ai', { lastModified: 100 });
    const drop = new Event('drop', { bubbles: true, cancelable: true });
    Object.defineProperty(drop, 'dataTransfer', {
      value: { files: [duplicate, drawing, drawing] },
    });
    host.querySelector('.purchase-dropzone')!.dispatchEvent(drop);
    await settle();
    expect(drop.defaultPrevented).toBe(true);
    expect(host.querySelectorAll('.attachment-pending > li')).toHaveLength(2);
    expect(host.textContent).toContain('待上传 2 个文件');
    uploadButton(host).click();
    await settle();
    expect(mocks.upload.mock.calls.map((call) => call[1].name)).toEqual([
      '供应商报价.pdf',
      '生产图纸.ai',
    ]);
  });

  it('keeps only failed purchase files and retries with the same category, target and idempotency key', async () => {
    mocks.upload
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(new Error('响应丢失'))
      .mockResolvedValueOnce({});
    const { busy, host, refresh } = await mount(purchaseOptions);
    await choose(host, ['供应商报价.pdf', '生产图纸.ai']);
    uploadButton(host).click();
    expect(busy).toHaveBeenLastCalledWith(true);
    await settle();
    const originalRequest = mocks.upload.mock.calls[1]!;
    expect(mocks.upload).toHaveBeenCalledTimes(2);
    expect(host.textContent).toContain('成功 1 个，失败 1 个');
    expect(host.textContent).toContain('响应丢失');
    expect(host.querySelectorAll('.attachment-pending > li')).toHaveLength(1);
    expect(busy).toHaveBeenLastCalledWith(false);
    uploadButton(host).click();
    await settle();
    expect(mocks.upload).toHaveBeenCalledTimes(3);
    expect(mocks.upload.mock.calls[2]).toEqual(originalRequest);
    expect(originalRequest[2]).toBe('PROCUREMENT');
    expect(host.querySelector('.attachment-pending')).toBeNull();
    expect(refresh).toHaveBeenCalledTimes(2);
  });
});
