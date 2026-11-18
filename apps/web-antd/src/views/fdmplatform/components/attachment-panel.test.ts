/* eslint-disable vue/one-component-per-file -- Small adapters exercise the actual upload queue. */
import { createApp, defineComponent, h, nextTick, ref } from 'vue';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import AttachmentPanel from './AttachmentPanel.vue';

const mocks = vi.hoisted(() => ({ upload: vi.fn(), success: vi.fn(), key: 0 }));
vi.mock('#/api/fdmplatform', () => ({
  uploadAttachment: mocks.upload,
  downloadAttachment: vi.fn(),
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
vi.mock('../data', () => ({ errorText: (error: Error) => error.message }));
vi.mock('../directory', () => ({ personLabel: () => '用户' }));
vi.mock('./attachment-preview', () => ({
  attachmentTime: () => '',
  previewMimeType: () => undefined,
}));
vi.mock('./AttachmentPreview.vue', () => ({
  default: defineComponent({ render: () => null }),
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
    Empty: Wrap,
    Space: Wrap,
    Table: Wrap,
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

const cleanup: (() => void)[] = [];
beforeEach(() => {
  vi.clearAllMocks();
  mocks.key = 0;
  mocks.upload.mockResolvedValue({});
});
afterEach(() => cleanup.splice(0).forEach((dispose) => dispose()));
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
    items: [{ id: 'existing-file' }],
  });
  const refresh = vi.fn();
  const busy = vi.fn();
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp({
    render: () =>
      h(AttachmentPanel, {
        ...state.value,
        view: view.value as any,
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
