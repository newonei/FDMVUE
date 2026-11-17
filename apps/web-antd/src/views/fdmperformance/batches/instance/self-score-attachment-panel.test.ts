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
    Upload: { Dragger: content },
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

async function mount(fileName: string, mimeType?: string) {
  api.getSelfScoreAttachmentList.mockResolvedValue([
    { id: 'attachment-1', instanceId: '1', fileName, mimeType },
  ]);
  host = document.createElement('div');
  document.body.append(host);
  const app = createApp({
    setup: () => () => h(SelfScoreAttachmentPanel, { instanceId: instanceId.value }),
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

beforeEach(() => {
  vi.clearAllMocks();
  instanceId.value = 1;
  api.downloadSelfScoreAttachment.mockReset().mockResolvedValue(new Blob(['attachment-content']));
  api.getSelfScoreAttachmentDownloadUrl.mockResolvedValue('https://files.example.com/signed-file');
  createObjectURL.mockReset().mockReturnValue('blob:self-score-preview');
  revokeObjectURL.mockReset();
  vi.spyOn(URL, 'createObjectURL').mockImplementation(createObjectURL);
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(revokeObjectURL);
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
