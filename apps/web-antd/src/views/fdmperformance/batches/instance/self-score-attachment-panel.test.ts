import { createApp, h, nextTick, ref } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import SelfScoreAttachmentPanel from './SelfScoreAttachmentPanel.vue';

const api = vi.hoisted(() => ({
  deleteSelfScoreAttachment: vi.fn(),
  downloadSelfScoreAttachment: vi.fn(),
  getSelfScoreAttachmentDownloadUrl: vi.fn(),
  getSelfScoreAttachmentList: vi.fn(),
  uploadSelfScoreAttachment: vi.fn(),
}));
const error = vi.hoisted(() => vi.fn());
vi.mock('#/api/fdmperformance', () => api);
vi.mock('@vben/icons', () => ({ IconifyIcon: () => null }));
vi.mock('@vben/utils', () => ({ formatFileSize: (size: number) => `${size} B` }));
vi.mock('#/components/file-preview', async () => {
  const { defineComponent, h } = await import('vue');
  return {
    FilePreview: defineComponent({
      props: ['url', 'fileName', 'fileType', 'downloadable'],
      setup(props) {
        return () => h('div', {
          'data-preview-url': props.url,
          'data-preview-name': props.fileName,
          'data-preview-type': props.fileType,
        });
      },
    }),
  };
});
vi.mock('ant-design-vue', async () => {
  const { defineComponent, h } = await import('vue');
  const content = defineComponent({
    setup(_props, { slots }) {
      return () => h('div', slots.default?.());
    },
  });
  return {
    Button: defineComponent({
      setup(_props, { attrs, slots }) {
        return () => h('button', attrs, slots.default?.());
      },
    }),
    Modal: defineComponent({
      props: ['open'],
      emits: ['cancel'],
      setup(props, { emit, slots }) {
        return () => props.open ? h('div', [
          h('button', { onClick: () => emit('cancel') }, '关闭预览'),
          slots.default?.(),
        ]) : null;
      },
    }),
    Progress: content,
    Tag: content,
    Upload: {
      LIST_IGNORE: 'LIST_IGNORE',
      Dragger: defineComponent({
        props: ['accept', 'beforeUpload', 'customRequest', 'disabled'],
        setup(props, { slots }) {
          return () => h('div', [
            h('input', {
              type: 'file',
              accept: props.accept,
              disabled: props.disabled,
              multiple: true,
              onChange: (event: Event) => {
                for (const file of (event.target as HTMLInputElement).files ?? []) {
                  if (props.beforeUpload(file) === true) {
                    props.customRequest({ file });
                  }
                }
              },
            }),
            slots.default?.(),
          ]);
        },
      }),
    },
    message: { error, success: vi.fn(), warning: vi.fn() },
  };
});

let unmount: (() => void) | undefined;
let host: HTMLDivElement;
const instanceId = ref(1);
const createObjectURL = vi.fn();
const revokeObjectURL = vi.fn();

async function flush() {
  await Promise.resolve();
  await nextTick();
  await Promise.resolve();
  await nextTick();
}

async function mount(fileName?: string, mimeType?: string, editable = false) {
  api.getSelfScoreAttachmentList.mockResolvedValue(fileName ? [
    { id: 'attachment-1', instanceId: '1', fileName, mimeType },
  ] : []);
  host = document.createElement('div');
  document.body.append(host);
  const app = createApp({
    setup: () => () => h(SelfScoreAttachmentPanel, {
      editable,
      instanceId: instanceId.value,
      taskId: editable ? 'self-score-task' : undefined,
    }),
  });
  app.mount(host);
  unmount = () => app.unmount();
  await flush();
}

function click(text: string) {
  const button = [...host.querySelectorAll('button')].find(
    (item) => item.textContent?.trim() === text,
  );
  expect(button).toBeDefined();
  button!.click();
}

async function chooseFiles(files: File[]) {
  const input = host.querySelector<HTMLInputElement>('input[type="file"]')!;
  expect(input).not.toBeNull();
  Object.defineProperty(input, 'files', { configurable: true, value: files });
  input.dispatchEvent(new Event('change', { bubbles: true }));
  await flush();
}

function file(name: string, size = 128) {
  const result = new File(['attachment-content'], name);
  Object.defineProperty(result, 'size', { value: size });
  return result;
}

beforeEach(() => {
  vi.clearAllMocks();
  instanceId.value = 1;
  api.downloadSelfScoreAttachment.mockReset().mockResolvedValue(new Blob(['attachment-content']));
  api.getSelfScoreAttachmentDownloadUrl.mockResolvedValue('https://files.example.com/signed-file');
  api.uploadSelfScoreAttachment.mockReset().mockImplementation(async (file: File) => ({
    id: `uploaded-${file.name}`,
    instanceId: '1',
    fileName: file.name,
    fileSize: file.size,
  }));
  createObjectURL.mockReset().mockReturnValue('blob:self-score-preview');
  revokeObjectURL.mockReset();
  vi.spyOn(URL, 'createObjectURL').mockImplementation(createObjectURL);
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(revokeObjectURL);
});

describe('员工自评附件上传', () => {
  it.each([
    'AI', 'plt', 'eps', 'cdr', 'psd', 'psb', 'dwg', 'dxf', 'tif', 'tiff',
    'zip', 'RAR', '7z', 'docm', 'dotx', 'xlsm', 'xltx', 'pptm', 'ppsx',
    'odt', 'ods', 'odp', 'rtf', 'tsv', 'gif', 'bmp',
  ])('通过实际上传钩子接收 %s 业务附件', async (extension) => {
    await mount(undefined, undefined, true);
    const attachment = file(`佐证.${extension}`);
    const input = host.querySelector<HTMLInputElement>('input[type="file"]')!;
    expect(input.accept.split(',')).toContain(`.${extension.toLowerCase()}`);
    await chooseFiles([attachment]);
    expect(api.uploadSelfScoreAttachment).toHaveBeenCalledWith(
      attachment, 1, 'self-score-task', expect.any(Function),
    );
    expect(host.textContent).toContain(attachment.name);
    expect(error).not.toHaveBeenCalled();
  });

  it.each(['svg', 'exe', 'ai.exe'])('拒绝 %s 文件并说明可接受的业务格式', async (extension) => {
    await mount(undefined, undefined, true);
    const attachment = file(`佐证.${extension}`);
    expect(host.querySelector<HTMLInputElement>('input[type="file"]')!.accept.split(',')).not.toContain('.svg');
    await chooseFiles([attachment]);
    expect(api.uploadSelfScoreAttachment).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledWith(
      `不支持 ${attachment.name} 的文件格式，支持 AI、PLT、PSD、CDR、EPS、CAD、ZIP / RAR / 7Z 压缩包及常用文档、图片`,
    );
  });

  it('显示扩展后的格式提示并保留原有数量和容量说明', async () => {
    await mount(undefined, undefined, true);
    expect(host.textContent).toContain('最多 20 个，单个不超过 20 MB、合计不超过 100 MB');
    expect(host.textContent).toContain('支持 AI、PLT、PSD、CDR、EPS、CAD、ZIP / RAR / 7Z 压缩包及常用文档、图片');
  });

  it('仍拒绝超过 20 MB 的设计文件', async () => {
    await mount(undefined, undefined, true);
    await chooseFiles([file('过大图稿.ai', 20 * 1024 * 1024 + 1)]);
    expect(api.uploadSelfScoreAttachment).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledWith('过大图稿.ai 超过 20 MB，无法上传');
  });

  it('接收单个 20 MB、总计 100 MB 的边界并拒绝超出总额的压缩包', async () => {
    await mount(undefined, undefined, true);
    await chooseFiles(Array.from({ length: 5 }, (_, index) => file(`图稿${index}.psd`, 20 * 1024 * 1024)));
    expect(api.uploadSelfScoreAttachment).toHaveBeenCalledTimes(5);
    await chooseFiles([file('超出总额.7z', 1)]);
    expect(api.uploadSelfScoreAttachment).toHaveBeenCalledTimes(5);
    expect(error).toHaveBeenCalledWith('员工自评附件总大小不能超过 100 MB');
  });

  it('同批选择仍最多接收 20 个附件', async () => {
    await mount(undefined, undefined, true);
    await chooseFiles(Array.from({ length: 21 }, (_, index) => file(`资料${index}.rar`)));
    expect(api.uploadSelfScoreAttachment).toHaveBeenCalledTimes(20);
    expect(error).toHaveBeenCalledWith('员工自评最多上传 20 个附件');
  });
});

afterEach(() => {
  unmount?.();
  host?.remove();
  vi.restoreAllMocks();
});

describe('员工自评附件预览', () => {
  it.each(['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'pdf', 'csv', 'zip', 'png'])(
    '只读查看者也可以在线打开 %s 附件，并在关闭后释放预览组件',
    async (extension) => {
      await mount(`佐证.${extension}`, 'application/octet-stream');
      click('预览');
      await flush();
      expect(api.downloadSelfScoreAttachment).toHaveBeenCalledWith('attachment-1');
      expect(api.getSelfScoreAttachmentDownloadUrl).not.toHaveBeenCalled();
      expect(await (createObjectURL.mock.calls[0]![0] as Blob).text()).toBe('attachment-content');
      const preview = host.querySelector('[data-preview-url]');
      expect(preview?.getAttribute('data-preview-url')).toBe('blob:self-score-preview');
      expect(preview?.getAttribute('data-preview-name')).toBe(`佐证.${extension}`);
      expect(preview?.getAttribute('data-preview-type')).toBe('application/octet-stream');
      click('关闭预览');
      await flush();
      expect(host.querySelector('[data-preview-url]')).toBeNull();
      expect(revokeObjectURL).toHaveBeenCalledWith('blob:self-score-preview');
    },
  );

  it('附件内容加载失败时展示错误并不创建预览 URL', async () => {
    api.downloadSelfScoreAttachment.mockRejectedValue(new Error('Forbidden'));
    await mount('佐证.docx');
    click('预览');
    await flush();
    expect(host.querySelector('[data-preview-url]')).toBeNull();
    expect(error).toHaveBeenCalledWith('附件预览内容加载失败，请稍后重试');
    expect(createObjectURL).not.toHaveBeenCalled();
  });

  it('切换考核实例后忽略旧实例返回的附件且不创建 URL', async () => {
    let resolveContent!: (value: Blob) => void;
    api.downloadSelfScoreAttachment.mockReturnValue(new Promise<Blob>((resolve) => { resolveContent = resolve; }));
    await mount('佐证.xlsx');
    click('预览');
    instanceId.value = 2;
    await flush();
    resolveContent(new Blob(['old-instance']));
    await flush();
    expect(host.querySelector('[data-preview-url]')).toBeNull();
    expect(createObjectURL).not.toHaveBeenCalled();
  });

  it('卸载面板时释放附件 Blob URL', async () => {
    await mount('佐证.pdf');
    click('预览');
    await flush();
    unmount!();
    unmount = undefined;
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:self-score-preview');
  });
});
