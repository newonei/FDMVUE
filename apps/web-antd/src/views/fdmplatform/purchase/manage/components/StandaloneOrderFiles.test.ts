/* eslint-disable vue/one-component-per-file -- Render adapters exercise the actual attachment component. */
import { createApp, defineComponent, h, nextTick, ref } from 'vue';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import StandaloneOrderFiles from './StandaloneOrderFiles.vue';

const mocks = vi.hoisted(() => ({
  deleteFile: vi.fn(),
  document: vi.fn(),
  files: vi.fn(),
  upload: vi.fn(),
}));
vi.mock('#/api/fdmplatform/business-documents', () => ({
  deleteBusinessDocumentFile: mocks.deleteFile,
  getBusinessDocument: mocks.document,
  getBusinessDocumentFiles: mocks.files,
  uploadBusinessDocumentFile: mocks.upload,
  downloadBusinessDocumentFile: vi.fn(),
  renameBusinessDocumentFile: vi.fn(),
}));
vi.mock('@vben/utils', () => ({ downloadFileFromBlobPart: vi.fn() }));
vi.mock('../../../data', () => ({
  errorText: (error: unknown) => String((error as Error).message ?? error),
}));
vi.mock('../../../components/attachment-preview', () => ({
  attachmentTime: String,
}));
vi.mock('../../../components/AttachmentPreview.vue', () => ({
  default: defineComponent({
    setup: (_, { expose }) => {
      expose({ close: vi.fn() });
      return () => null;
    },
  }),
}));
vi.mock('../../../components/AttachmentActions.vue', () => ({
  default: defineComponent({
    inheritAttrs: false,
    props: { name: String, remove: Function },
    setup: (props) => () =>
      props.remove
        ? h('button', { onClick: () => props.remove?.() }, `删除 ${props.name}`)
        : null,
  }),
}));
vi.mock('../../../components/RenameFileDialog.vue', () => ({
  default: defineComponent({ render: () => null }),
}));
vi.mock('ant-design-vue', () => {
  return {
    Alert: defineComponent({
      props: { message: { default: '', type: String } },
      setup: (props) => () => h('div', { role: 'alert' }, props.message),
    }),
    Button: defineComponent({
      props: { disabled: Boolean, loading: Boolean },
      setup: (props, ctx) => () =>
        h(
          'button',
          { ...ctx.attrs, disabled: props.disabled || props.loading },
          ctx.slots.default?.(),
        ),
    }),
    Table: defineComponent({
      props: { dataSource: { default: () => [], type: Array } },
      setup: (props, ctx) => () =>
        h(
          'div',
          props.dataSource.map((record) =>
            ctx.slots.bodyCell?.({ column: { key: 'action' }, record }),
          ),
        ),
    }),
    message: { success: vi.fn() },
  };
});

const cleanup: (() => void)[] = [];
beforeEach(() => {
  vi.clearAllMocks();
  mocks.files.mockResolvedValue({
    enabled: true,
    canUpload: true,
    items: [
      { id: 'existing-1', name: '附件一.pdf' },
      { id: 'existing-2', name: '附件二.pdf' },
    ],
  });
  mocks.document.mockResolvedValue({ version: 1 });
  mocks.upload.mockResolvedValue({ version: 2 });
});
afterEach(() => cleanup.splice(0).forEach((dispose) => dispose()));

async function settle() {
  for (let index = 0; index < 10; index++) {
    await Promise.resolve();
    await nextTick();
  }
}
async function mount(refreshOrder?: () => Promise<void>) {
  const orderId = ref('order-1');
  const busy: boolean[] = [];
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp({
    render: () =>
      h(StandaloneOrderFiles, {
        orderId: orderId.value,
        refreshOrder,
        onBusy: (value: boolean) => busy.push(value),
      }),
  });
  app.mount(host);
  let mounted = true;
  const unmount = () => {
    if (!mounted) return;
    mounted = false;
    app.unmount();
    host.remove();
  };
  cleanup.push(unmount);
  await settle();
  return { busy, host, orderId, unmount };
}
async function pick(host: HTMLElement, files: File[]) {
  const input = host.querySelector<HTMLInputElement>('input[type="file"]')!;
  Object.defineProperty(input, 'files', { configurable: true, value: files });
  input.dispatchEvent(new Event('change'));
  await settle();
}
async function dropOrPaste(
  host: HTMLElement,
  files: File[],
  method: 'drop' | 'paste' = 'drop',
) {
  const event = new Event(method, { bubbles: true, cancelable: true });
  Object.defineProperty(
    event,
    method === 'paste' ? 'clipboardData' : 'dataTransfer',
    {
      value: { files },
    },
  );
  host.querySelector('.dropzone')!.dispatchEvent(event);
  await settle();
  return event;
}
function button(host: HTMLElement, label: string) {
  const result = [...host.querySelectorAll('button')].find((item) =>
    item.textContent?.trim().startsWith(label),
  );
  expect(result).toBeDefined();
  return result!;
}
async function upload(host: HTMLElement) {
  const action = button(host, '上传');
  expect(action.disabled).toBe(false);
  action.click();
  await settle();
}
const file = (name: string) => new File(['sample'], name);

it('删除允许修改的附件后刷新附件与采购单，并保留已引用的凭据', async () => {
  const proof = { id: 'proof', name: '到货凭据.pdf', canDelete: false };
  const removable = {
    id: 'quote',
    name: '旧报价单.pdf',
    documentId: 'order-1',
    canDelete: true,
  };
  mocks.files
    .mockResolvedValueOnce({
      enabled: true,
      canUpload: true,
      items: [proof, removable],
    })
    .mockResolvedValue({ enabled: true, canUpload: true, items: [proof] });
  mocks.deleteFile.mockResolvedValue(true);
  const refreshOrder = vi.fn().mockResolvedValue(undefined);
  const { host, busy } = await mount(refreshOrder);

  expect(host.textContent).not.toContain('删除 到货凭据.pdf');
  button(host, '删除 旧报价单.pdf').click();
  await settle();

  expect(mocks.deleteFile).toHaveBeenCalledOnce();
  expect(mocks.deleteFile).toHaveBeenCalledWith('order-1', 'quote');
  expect(refreshOrder).toHaveBeenCalledOnce();
  expect(host.textContent).toContain('已上传附件共 1 个');
  expect(host.textContent).not.toContain('删除 旧报价单.pdf');
  expect(busy).toEqual([false, true, false]);
});

describe('独立采购单附件上传队列', () => {
  it('空队列显示补充附件拖放入口，选择文件前不展示主要上传操作', async () => {
    const { host } = await mount();
    expect(host.textContent).toContain('补充附件');
    expect(host.textContent).toContain(
      '报价、图纸、沟通资料等，统一保存在本采购单下。',
    );
    expect(host.textContent).toContain('选择文件，或将文件拖到这里');
    expect(
      [...host.querySelectorAll('button')].some((item) =>
        item.textContent?.trim().startsWith('上传'),
      ),
    ).toBe(false);
    const input = host.querySelector<HTMLInputElement>('input[type="file"]')!;
    const click = vi.spyOn(input, 'click');
    button(host, '选择文件').click();
    expect(click).toHaveBeenCalledOnce();
  });

  it.each(['drop', 'paste'] as const)(
    '通过 %s 追加文件并跳过与待上传队列或同批重复的文件',
    async (method) => {
      const { host } = await mount();
      const first = file('报价.pdf');
      const second = file('图纸.ai');
      await pick(host, [first]);
      const event = await dropOrPaste(host, [first, second, second], method);
      expect(event.defaultPrevented).toBe(true);
      expect(host.textContent).toContain('待上传 2 个文件');
      expect(host.textContent).toContain('已跳过 2 个重复文件');
      expect(host.querySelectorAll('.queued-file')).toHaveLength(2);
      expect(mocks.upload).not.toHaveBeenCalled();
      await upload(host);
      expect(mocks.upload).toHaveBeenCalledTimes(2);
    },
  );

  it.each(['drop', 'paste'] as const)(
    '无上传权限时 %s 不添加文件',
    async (method) => {
      mocks.files.mockResolvedValue({
        enabled: true,
        canUpload: false,
        items: [],
      });
      const { host } = await mount();
      await dropOrPaste(host, [file('图纸.ai')], method);
      expect(host.querySelector('.queue')).toBeNull();
      expect(button(host, '选择文件').disabled).toBe(true);
      expect(mocks.upload).not.toHaveBeenCalled();
    },
  );

  it('允许多选 AI、PLT，明确显示数量、名称、大小和已上传数量，上传前可移除', async () => {
    const { host } = await mount();
    const input = host.querySelector<HTMLInputElement>('input[type="file"]')!;
    expect(input.multiple).toBe(true);
    expect(input.accept).toContain('.ai');
    expect(input.accept).toContain('.plt');
    await pick(host, [file('正面.ai'), file('背面.plt')]);
    expect(mocks.upload).not.toHaveBeenCalled();
    expect(host.textContent).toContain('已上传附件共 2 个');
    expect(host.textContent).toContain('待上传 2 个文件');
    expect(host.textContent).toContain('正面.ai');
    expect(host.textContent).toContain('背面.plt');
    expect(host.textContent).toContain('0.1 KB');
    button(host, '移除').click();
    await settle();
    expect(host.textContent).toContain('待上传 1 个文件');
    expect(host.textContent).not.toContain('正面.ai');
  });

  it('顺序上传并逐文件获取最新版本，上传中显示已处理和成功失败数量', async () => {
    let finishSecond!: () => void;
    mocks.document
      .mockResolvedValueOnce({ version: 3 })
      .mockResolvedValueOnce({ version: 4 });
    mocks.upload.mockResolvedValueOnce({}).mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finishSecond = resolve;
        }),
    );
    const { host } = await mount();
    await pick(host, [file('图案.ai'), file('刀模.plt')]);
    await upload(host);
    expect(mocks.upload).toHaveBeenNthCalledWith(
      1,
      'order-1',
      expect.any(File),
      {
        expectedVersion: 3,
        idempotencyKey: expect.any(String),
      },
    );
    expect(mocks.upload).toHaveBeenNthCalledWith(
      2,
      'order-1',
      expect.any(File),
      {
        expectedVersion: 4,
        idempotencyKey: expect.any(String),
      },
    );
    expect(host.textContent).toContain('上传进度：1/2，成功 1 个，失败 0 个');
    expect(button(host, '继续选择').disabled).toBe(true);
    finishSecond();
    await settle();
    expect(host.textContent).toContain(
      '本次上传结果：2/2，成功 2 个，失败 0 个',
    );
    expect(host.querySelector('.queue')).toBeNull();
    expect(mocks.files).toHaveBeenCalledTimes(2);
  });

  it('部分失败继续传后续文件，重试只传失败项并复用其幂等键和原版本', async () => {
    mocks.upload
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(new Error('网络中断'))
      .mockResolvedValue({});
    const { host } = await mount();
    await pick(host, [file('第一.ai'), file('第二.plt'), file('第三.pdf')]);
    await upload(host);
    expect(mocks.upload).toHaveBeenCalledTimes(3);
    expect(host.textContent).toContain(
      '本次上传结果：3/3，成功 2 个，失败 1 个',
    );
    expect(host.textContent).toContain('上传失败：网络中断');
    expect(host.textContent).toContain('待上传 1 个文件');
    expect(host.textContent).not.toContain('第一.ai');
    const originalKey = mocks.upload.mock.calls[1]![2].idempotencyKey;
    mocks.document.mockResolvedValue({ version: 9 });
    await upload(host);
    expect(mocks.upload).toHaveBeenCalledTimes(4);
    expect(mocks.upload.mock.calls[3]![1].name).toBe('第二.plt');
    expect(mocks.upload.mock.calls[3]![2]).toEqual({
      expectedVersion: 1,
      idempotencyKey: originalKey,
    });
    expect(mocks.document).toHaveBeenCalledTimes(3);
    expect(host.querySelector('.queue')).toBeNull();
  });

  it('服务端已提交但响应丢失时重放原请求，不产生重复附件', async () => {
    let serverVersion = 1;
    const committed = new Map<string, string>();
    mocks.document.mockImplementation(async () => ({ version: serverVersion }));
    mocks.upload.mockImplementation(async (_id, _file, body) => {
      const fingerprint = JSON.stringify(body);
      const previous = committed.get(body.idempotencyKey);
      if (previous) {
        if (previous !== fingerprint) throw new Error('幂等键请求内容不一致');
        return {};
      }
      committed.set(body.idempotencyKey, fingerprint);
      serverVersion++;
      throw new Error('响应丢失');
    });
    const { host } = await mount();
    await pick(host, [file('已经提交.ai')]);
    await upload(host);
    expect(host.textContent).toContain('上传失败：响应丢失');
    const originalBody = mocks.upload.mock.calls[0]![2];
    await upload(host);
    expect(mocks.upload).toHaveBeenCalledTimes(2);
    expect(mocks.upload.mock.calls[1]![2]).toEqual(originalBody);
    expect(mocks.document).toHaveBeenCalledTimes(1);
    expect(committed.size).toBe(1);
    expect(serverVersion).toBe(2);
    expect(host.querySelector('.queue')).toBeNull();
  });

  it('仅明确版本拒绝允许换幂等键并刷新版本自动重试一次', async () => {
    mocks.document
      .mockResolvedValueOnce({ version: 1 })
      .mockResolvedValue({ version: 9 });
    mocks.upload
      .mockRejectedValueOnce(new Error('网络中断'))
      .mockRejectedValueOnce(new Error('单据已变化，请刷新'))
      .mockResolvedValue({});
    const { host } = await mount();
    await pick(host, [file('未提交.ai')]);
    await upload(host);
    const originalBody = mocks.upload.mock.calls[0]![2];
    expect(mocks.upload).toHaveBeenCalledTimes(1);
    await upload(host);
    expect(mocks.upload).toHaveBeenCalledTimes(3);
    expect(mocks.upload.mock.calls[1]![2]).toEqual(originalBody);
    expect(mocks.upload.mock.calls[2]![2].expectedVersion).toBe(9);
    expect(mocks.upload.mock.calls[2]![2].idempotencyKey).not.toBe(
      originalBody.idempotencyKey,
    );
    expect(host.querySelector('.queue')).toBeNull();
  });

  it('合并选择后校验每次最多 10 个和总大小 1 GB，拒绝时保留原队列', async () => {
    const { host } = await mount();
    await pick(
      host,
      Array.from({ length: 10 }, (_, index) => file(`${index}.ai`)),
    );
    await pick(host, [file('多余.plt')]);
    expect(host.textContent).toContain('每次最多添加 10 个附件');
    expect(host.textContent).toContain('待上传 10 个文件');
    expect(host.textContent).not.toContain('多余.plt');
    const { host: largeHost } = await mount();
    const first = file('大图.ai');
    const second = file('刀模.plt');
    Object.defineProperty(first, 'size', { value: 600 * 1024 * 1024 });
    Object.defineProperty(second, 'size', { value: 600 * 1024 * 1024 });
    await pick(largeHost, [first]);
    await pick(largeHost, [second]);
    expect(largeHost.textContent).toContain('本次附件总大小不能超过 1 GB');
    expect(largeHost.textContent).toContain('待上传 1 个文件');
    expect(mocks.upload).not.toHaveBeenCalled();
  });

  it('切换采购单时清空队列，并停止将旧队列的后续文件上传到新单据', async () => {
    let finishFirst!: () => void;
    mocks.upload.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finishFirst = resolve;
        }),
    );
    const { host, orderId } = await mount();
    await pick(host, [file('旧单.ai'), file('旧单.plt')]);
    await upload(host);
    orderId.value = 'order-2';
    await settle();
    expect(host.querySelector('.queue')).toBeNull();
    finishFirst();
    await settle();
    expect(mocks.upload).toHaveBeenCalledTimes(1);
    expect(mocks.files).toHaveBeenLastCalledWith('order-2');
  });

  it('组件卸载后停止上传队列中的后续文件', async () => {
    let finishFirst!: () => void;
    mocks.upload.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finishFirst = resolve;
        }),
    );
    const { busy, host, unmount } = await mount();
    expect(busy).toEqual([false]);
    await pick(host, [file('第一.ai'), file('第二.plt')]);
    button(host, '上传').click();
    // Parent navigation protection must observe the change in the same turn.
    expect(busy.at(-1)).toBe(true);
    await settle();
    await dropOrPaste(host, [file('第三.ai')]);
    expect(host.querySelectorAll('.queued-file')).toHaveLength(2);
    unmount();
    expect(busy.at(-1)).toBe(false);
    finishFirst();
    await settle();
    expect(mocks.upload).toHaveBeenCalledTimes(1);
    expect(mocks.document).toHaveBeenCalledTimes(1);
    expect(mocks.files).toHaveBeenCalledTimes(1);
  });

  it('上传完成后同步释放忙碌状态', async () => {
    const { busy, host } = await mount();
    await pick(host, [file('报价.pdf')]);
    await upload(host);
    expect(busy).toEqual([false, true, false]);
  });
});
