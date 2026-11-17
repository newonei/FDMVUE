import { createApp, h, nextTick, reactive } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import FilePreview from './file-preview.vue';

const convertOfficePreview = vi.hoisted(() => vi.fn());
vi.mock('#/api/file-preview', () => ({ convertOfficePreview }));
vi.mock('./spreadsheet-preview.vue', async () => {
  const { defineComponent, h } = await import('vue');
  return { default: defineComponent({
    props: ['blob', 'fileName'], emits: ['fallback'],
    setup: (props, { emit }) => () => h('div', { 'data-spreadsheet': true }, [
      props.fileName, h('button', { onClick: () => emit('fallback') }, '版式预览'),
    ]),
  }) };
});
vi.mock('ant-design-vue', async () => {
  const { defineComponent, h } = await import('vue');
  return {
    Alert: defineComponent({
      props: ['message'],
      setup: (props) => () => h('div', { role: 'alert' }, props.message),
    }),
    Button: defineComponent({
      setup: (_props, { attrs, slots }) => () => h('button', attrs, slots.default?.()),
    }),
    Image: defineComponent({
      props: ['src'],
      setup: (props) => () => h('img', { src: props.src }),
    }),
    Spin: defineComponent({
      props: ['tip'],
      setup: (props) => () => h('div', { role: 'status' }, props.tip),
    }),
  };
});

const fetchFile = vi.fn();
const createObjectURL = vi.fn();
const revokeObjectURL = vi.fn();
let host: HTMLDivElement;
let unmount: (() => void) | undefined;

async function flush() {
  for (let i = 0; i < 30; i++) {
    await Promise.resolve();
    await nextTick();
  }
}

function response(blob: Blob) {
  return { ok: true, headers: new Headers(), blob: async () => blob };
}

async function mount(fileName = '合同.docx') {
  const props = reactive({ url: 'https://files.example.com/signed', fileName });
  host = document.createElement('div');
  const app = createApp({ setup: () => () => h(FilePreview, props) });
  app.mount(host);
  unmount = () => app.unmount();
  await flush();
  return props;
}

beforeEach(() => {
  fetchFile.mockReset().mockResolvedValue(response(new Blob(['office-content'])));
  convertOfficePreview.mockReset().mockResolvedValue(new Blob(['%PDF converted'], { type: 'application/pdf' }));
  createObjectURL.mockReset().mockReturnValue('blob:preview-pdf');
  revokeObjectURL.mockReset();
  vi.stubGlobal('fetch', fetchFile);
  vi.spyOn(URL, 'createObjectURL').mockImplementation(createObjectURL);
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(revokeObjectURL);
});

afterEach(() => {
  unmount?.();
  host?.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('shared FilePreview', () => {
  it.each(['doc', 'docx', 'ppt', 'pptx'])(
    'fetches %s, converts its content locally and displays the resulting PDF',
    async (extension) => {
      await mount(`附件.${extension}`);
      expect(fetchFile).toHaveBeenCalledWith('https://files.example.com/signed', expect.objectContaining({ signal: expect.any(AbortSignal) }));
      const [file, signal] = convertOfficePreview.mock.calls[0]!;
      expect(file).toBeInstanceOf(File);
      expect(file.name).toBe(`preview.${extension}`);
      expect(await file.text()).toBe('office-content');
      expect(signal).toBe(fetchFile.mock.calls[0]![1].signal);
      expect(host.querySelector('iframe')?.getAttribute('src')).toBe('blob:preview-pdf');
      expect(createObjectURL.mock.calls[0]![0].type).toBe('application/pdf');
      unmount!();
      unmount = undefined;
      expect(signal.aborted).toBe(true);
      expect(revokeObjectURL).toHaveBeenCalledWith('blob:preview-pdf');
    },
  );

  it.each(['xls', 'xlsx', 'xlsm', 'ods', 'csv', 'tsv'])('reads %s as a spreadsheet without uploading for PDF conversion', async (extension) => {
    await mount(`采购清单.${extension}`);
    expect(host.querySelector('[data-spreadsheet]')?.textContent).toContain(`采购清单.${extension}`);
    expect(convertOfficePreview).not.toHaveBeenCalled();
    expect(host.querySelector('iframe')).toBeNull();
  });

  it('offers layout fallback and returns to the spreadsheet without downloading the source twice', async () => {
    await mount('采购清单.xlsx');
    host.querySelector<HTMLButtonElement>('[data-spreadsheet] button')!.click();
    await flush();
    expect(convertOfficePreview).toHaveBeenCalledTimes(1);
    expect(fetchFile).toHaveBeenCalledTimes(1);
    expect(host.querySelector('iframe')).not.toBeNull();
    [...host.querySelectorAll('button')].find((button) => button.textContent === '返回表格')!.click();
    await flush();
    expect(host.querySelector('[data-spreadsheet]')).not.toBeNull();
    expect(fetchFile).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:preview-pdf');
  });

  it('shows conversion errors and retries when requested', async () => {
    convertOfficePreview.mockRejectedValueOnce({ msg: '文档转换服务暂不可用' });
    await mount();
    expect(host.textContent).toContain('文档转换服务暂不可用');
    expect(host.querySelector('iframe')).toBeNull();
    host.querySelector('button')!.click();
    await flush();
    expect(convertOfficePreview).toHaveBeenCalledTimes(2);
    expect(host.querySelector('iframe')?.getAttribute('src')).toBe('blob:preview-pdf');
    expect(host.textContent).not.toContain('文档转换服务暂不可用');
  });

  it('aborts the old conversion and ignores its late result after switching files', async () => {
    let resolveOld!: (blob: Blob) => void;
    convertOfficePreview.mockReturnValueOnce(new Promise<Blob>((resolve) => { resolveOld = resolve; }));
    const props = await mount();
    const oldSignal = convertOfficePreview.mock.calls[0]![1] as AbortSignal;
    props.url = 'https://files.example.com/new-image';
    props.fileName = '新图片.png';
    await flush();
    expect(oldSignal.aborted).toBe(true);
    resolveOld(new Blob(['old pdf'], { type: 'application/pdf' }));
    await flush();
    expect(host.querySelector('iframe')).toBeNull();
    expect(host.querySelector('img')?.getAttribute('src')).toBe(props.url);
    expect(createObjectURL).not.toHaveBeenCalled();
  });

  it('renders HTML source and Chinese content as inert text', async () => {
    const content = '<script>window.attachmentExecuted=true</script><img src=x onerror="alert(1)">中文附件';
    fetchFile.mockResolvedValue(response(new Blob([content], { type: 'text/html' })));
    await mount('附件.html');
    expect(host.querySelector('pre')?.textContent).toBe(content);
    expect(host.querySelector('script, img, iframe')).toBeNull();
    expect(convertOfficePreview).not.toHaveBeenCalled();
  });

  it('rejects a non-PDF conversion response', async () => {
    convertOfficePreview.mockResolvedValue(new Blob(['error'], { type: 'application/json' }));
    await mount();
    expect(host.textContent).toContain('文档转换未返回有效的 PDF');
    expect(host.querySelector('iframe')).toBeNull();
    expect(createObjectURL).not.toHaveBeenCalled();
  });

  it('does not fetch an invalid URL', async () => {
    const props = await mount('图片.png');
    props.url = 'javascript:alert(1)';
    await flush();
    expect(host.textContent).toContain('文件预览地址无效');
    expect(host.querySelector('img')).toBeNull();
    expect(fetchFile).not.toHaveBeenCalled();
  });
});
