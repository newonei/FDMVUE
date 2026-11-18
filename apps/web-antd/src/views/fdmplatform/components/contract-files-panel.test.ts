/* eslint-disable vue/one-component-per-file -- Small adapters exercise the actual contract upload queue. */
import type { ContractFileListing } from '../../../api/fdmplatform/contract-files';

import { createApp, defineComponent, h, nextTick, ref } from 'vue';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import ContractFilesPanel from './ContractFilesPanel.vue';

const mocks = vi.hoisted(() => ({ upload: vi.fn(), success: vi.fn(), key: 0 }));
vi.mock('#/api/fdmplatform', () => ({
  uploadAttachment: mocks.upload,
  newIdempotencyKey: () => `upload-key-${++mocks.key}`,
}));
vi.mock('#/api/fdmplatform/contract-files', () => ({
  contractFileRenamable: () => false,
  downloadContractFile: vi.fn(),
  renameContractFile: vi.fn(),
}));
vi.mock(
  '#/api/fdmplatform/submission-files',
  () => import('../../../api/fdmplatform/submission-files'),
);
vi.mock('@vben/icons', () => ({
  Upload: defineComponent({ render: () => null }),
}));
vi.mock('../data', () => ({ errorText: (error: Error) => error.message }));
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
    Checkbox: Wrap,
    Empty: Wrap,
    Input: { Search: Wrap },
    Radio: { Group: Wrap, Button: Wrap },
    Space: Wrap,
    Table: Wrap,
    Tag: Wrap,
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
  vi.resetAllMocks();
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
    enabled?: boolean;
    uploadable?: boolean;
  } = {},
) {
  const state = ref({
    contractId: 'contract-1',
    uploadable: options.uploadable ?? true,
  });
  const listing = ref<ContractFileListing | undefined>({
    enabled: options.enabled ?? true,
    uploadCategories: options.categories ?? ['SPECIFICATION', 'SALES'],
    items: [],
  });
  const refresh = vi.fn();
  const busy = vi.fn();
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp({
    render: () =>
      h(ContractFilesPanel, {
        ...state.value,
        listing: listing.value,
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
  return { host, state, listing, refresh, busy };
}

function file(name: string, size?: number) {
  const selected = new File(['data'], name, { lastModified: 100 });
  if (size !== undefined)
    Object.defineProperty(selected, 'size', { value: size });
  return selected;
}

async function choose(host: HTMLElement, files: File[]) {
  const input = host.querySelector<HTMLInputElement>('input[type=file]')!;
  Object.defineProperty(input, 'files', {
    configurable: true,
    value: files,
  });
  input.dispatchEvent(new Event('change'));
  await settle();
}

async function drop(host: HTMLElement, files: File[]) {
  const event = new Event('drop', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'dataTransfer', { value: { files } });
  host.querySelector('.upload-row')!.dispatchEvent(event);
  await settle();
  expect(event.defaultPrevented).toBe(true);
}

function button(host: HTMLElement, text: string) {
  return [...host.querySelectorAll('button')].find(
    (item) => item.textContent!.trim() === text,
  );
}

function uploadButton(host: HTMLElement) {
  return [...host.querySelectorAll('button')].find((item) =>
    /^上传[（(]/.test(item.textContent!.trim()),
  )!;
}

describe('contract attachment additions', () => {
  it('defaults to SALES and opens a multiple-file picker with supported design formats', async () => {
    const { host } = await mount();
    expect(host.querySelector<HTMLSelectElement>('select')!.value).toBe(
      'SALES',
    );
    const input = host.querySelector<HTMLInputElement>('input[type=file]')!;
    expect(input.multiple).toBe(true);
    expect(input.accept).toContain('.ai,.plt');
    const click = vi.spyOn(input, 'click');
    button(host, '新增附件')!.click();
    expect(click).toHaveBeenCalledOnce();
    expect(mocks.upload).not.toHaveBeenCalled();
  });

  it('uses the first permitted category when SALES is unavailable', async () => {
    const { host } = await mount({ categories: ['RECEIPT', 'FINANCE'] });
    expect(host.querySelector<HTMLSelectElement>('select')!.value).toBe(
      'RECEIPT',
    );
    await choose(host, [file('收款凭证.pdf')]);
    uploadButton(host).click();
    await settle();
    expect(mocks.upload.mock.calls[0]!.slice(0, 3)).toEqual([
      'contract-1',
      expect.any(File),
      'RECEIPT',
    ]);
  });

  it('accumulates chosen and dropped files, deduplicates them and removes only the requested file', async () => {
    const { host } = await mount();
    await choose(host, [file('合同.pdf'), file('原稿.ai')]);
    await choose(host, [file('合同.pdf')]);
    await drop(host, [file('原稿.ai'), file('裁切.plt'), file('裁切.plt')]);
    expect(host.querySelectorAll('.attachment-pending > li')).toHaveLength(3);
    expect(button(host, '继续添加附件')).toBeDefined();
    host
      .querySelector<HTMLButtonElement>('button[aria-label="移除 原稿.ai"]')!
      .click();
    await settle();
    expect(host.querySelectorAll('.attachment-pending > li')).toHaveLength(2);
    expect(host.textContent).toContain('合同.pdf');
    expect(host.textContent).toContain('裁切.plt');
    expect(host.querySelector('button[aria-label="移除 原稿.ai"]')).toBeNull();
  });

  it('validates the cumulative file count, aggregate size and unsupported formats without losing queued files', async () => {
    const { host } = await mount();
    await choose(host, [file('合同.pdf')]);
    await choose(
      host,
      Array.from({ length: 10 }, (_, index) => file(`原稿${index}.ai`)),
    );
    expect(host.textContent).toContain('每次最多添加 10 个附件');
    expect(host.querySelectorAll('.attachment-pending > li')).toHaveLength(1);
    await drop(host, [file('大文件.zip', 1024 * 1024 * 1024)]);
    expect(host.textContent).toContain('本次附件总大小不能超过 1 GB');
    expect(host.querySelectorAll('.attachment-pending > li')).toHaveLength(1);
    await choose(host, [file('不支持.exe')]);
    expect(host.textContent).toContain('不支持 不支持.exe 的文件格式');
    expect(host.querySelectorAll('.attachment-pending > li')).toHaveLength(1);
    expect(mocks.upload).not.toHaveBeenCalled();
  });

  it('removes successful files, retries only failures with the original key and supports another upload afterward', async () => {
    mocks.upload
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(new Error('网络中断'))
      .mockResolvedValueOnce({});
    const { host, refresh, busy } = await mount();
    await choose(host, [file('合同.pdf'), file('原稿.ai')]);
    uploadButton(host).click();
    await settle();
    expect(mocks.upload).toHaveBeenCalledTimes(2);
    const failedRequest = mocks.upload.mock.calls[1]!;
    expect(failedRequest.slice(0, 3)).toEqual([
      'contract-1',
      expect.any(File),
      'SALES',
    ]);
    expect(host.textContent).toContain('网络中断');
    expect(host.querySelectorAll('.attachment-pending > li')).toHaveLength(1);
    expect(host.querySelector('button[aria-label="移除 合同.pdf"]')).toBeNull();
    expect(
      host.querySelector('button[aria-label="移除 原稿.ai"]'),
    ).not.toBeNull();
    uploadButton(host).click();
    await settle();
    expect(mocks.upload).toHaveBeenCalledTimes(3);
    expect(mocks.upload.mock.calls[2]).toEqual(failedRequest);
    expect(host.querySelector('.attachment-pending')).toBeNull();
    expect(refresh).toHaveBeenCalledTimes(2);
    expect(busy).toHaveBeenLastCalledWith(false);
    expect(button(host, '新增附件')).toBeDefined();
    await choose(host, [file('补充合同.pdf')]);
    uploadButton(host).click();
    await settle();
    expect(mocks.upload.mock.calls.map((call) => call[1].name)).toEqual([
      '合同.pdf',
      '原稿.ai',
      '原稿.ai',
      '补充合同.pdf',
    ]);
    expect(refresh).toHaveBeenCalledTimes(3);
    expect(host.querySelector('.attachment-pending')).toBeNull();
  });

  it('keeps queued files and their keys when the same contract receives refreshed listing data', async () => {
    const { host, listing } = await mount();
    await choose(host, [file('合同.pdf'), file('原稿.ai')]);
    const previous = listing.value!;
    listing.value = {
      ...previous,
      uploadCategories: [...previous.uploadCategories],
    };
    await settle();
    expect(host.querySelectorAll('.attachment-pending > li')).toHaveLength(2);
    expect(mocks.key).toBe(2);
    uploadButton(host).click();
    await settle();
    expect(mocks.upload.mock.calls.map((call) => call[3])).toEqual([
      'upload-key-1',
      'upload-key-2',
    ]);
  });

  it('preserves the active upload and retry keys when listing data temporarily disappears during refresh', async () => {
    let resolve!: (value: object) => void;
    mocks.upload.mockReturnValueOnce(
      new Promise((done) => {
        resolve = done;
      }),
    );
    const { host, listing, refresh, busy } = await mount();
    const originalListing = listing.value!;
    await choose(host, [file('合同.pdf'), file('原稿.ai')]);
    uploadButton(host).click();
    await settle();
    expect(mocks.upload).toHaveBeenCalledTimes(1);
    listing.value = undefined;
    await settle();
    expect(host.querySelectorAll('.attachment-pending > li')).toHaveLength(2);
    expect(host.textContent).toContain('上传进度');
    expect(mocks.key).toBe(2);

    resolve({});
    await settle();
    expect(mocks.upload).toHaveBeenCalledTimes(1);
    expect(host.querySelectorAll('.attachment-pending > li')).toHaveLength(1);
    expect(host.querySelector('button[aria-label="移除 合同.pdf"]')).toBeNull();
    expect(
      host.querySelector('button[aria-label="移除 原稿.ai"]'),
    ).not.toBeNull();
    expect(host.textContent).toContain('剩余附件已保留，请刷新后重试');
    expect(host.textContent).toContain('成功 1 个，失败 0 个');
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(busy).toHaveBeenLastCalledWith(false);

    listing.value = {
      ...originalListing,
      uploadCategories: [...originalListing.uploadCategories],
    };
    await settle();
    expect(mocks.key).toBe(2);
    uploadButton(host).click();
    await settle();
    expect(mocks.upload).toHaveBeenCalledTimes(2);
    expect(mocks.upload.mock.calls[1]).toEqual([
      'contract-1',
      expect.objectContaining({ name: '原稿.ai' }),
      'SALES',
      'upload-key-2',
    ]);
    expect(host.querySelector('.attachment-pending')).toBeNull();
    expect(refresh).toHaveBeenCalledTimes(2);
    expect(busy.mock.calls.map(([value]) => value)).toEqual([
      true,
      false,
      true,
      false,
    ]);
  });

  it('clears queued files when the contract changes', async () => {
    const { host, state } = await mount();
    await choose(host, [file('合同.pdf'), file('原稿.ai')]);
    state.value.contractId = 'contract-2';
    await settle();
    expect(host.querySelector('.attachment-pending')).toBeNull();
    expect(mocks.upload).not.toHaveBeenCalled();
  });

  it('stops the previous batch without refreshing the new contract after a contract change during upload', async () => {
    let resolve!: (value: object) => void;
    mocks.upload.mockReturnValueOnce(
      new Promise((done) => {
        resolve = done;
      }),
    );
    const { host, state, refresh, busy } = await mount();
    await choose(host, [file('合同.pdf'), file('原稿.ai')]);
    uploadButton(host).click();
    await settle();
    expect(mocks.upload).toHaveBeenCalledTimes(1);
    expect(busy).toHaveBeenLastCalledWith(true);
    state.value.contractId = 'contract-2';
    await settle();
    expect(host.querySelector('.attachment-pending')).toBeNull();
    resolve({});
    await settle();
    expect(mocks.upload).toHaveBeenCalledTimes(1);
    expect(refresh).not.toHaveBeenCalled();
    expect(busy).toHaveBeenLastCalledWith(false);
  });

  it.each([{ uploadable: false }, { enabled: false }, { categories: [] }])(
    'hides the upload area when additions are unavailable: %j',
    async (options) => {
      const { host } = await mount(options);
      expect(host.querySelector('.upload-row')).toBeNull();
      expect(host.querySelector('input[type=file]')).toBeNull();
      expect(button(host, '新增附件')).toBeUndefined();
    },
  );
});
