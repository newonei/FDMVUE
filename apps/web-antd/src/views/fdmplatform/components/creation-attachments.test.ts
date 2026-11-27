/* eslint-disable vue/one-component-per-file -- Small UI adapters exercise the actual file selection handlers. */
import { createApp, defineComponent, h, nextTick, ref } from 'vue';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  ATTACHMENT_ACCEPT,
  ATTACHMENT_FORMAT_TEXT,
} from '../../../api/fdmplatform/submission-files';
import CreationAttachments from './CreationAttachments.vue';

vi.mock(
  '#/api/fdmplatform/submission-files',
  () => import('../../../api/fdmplatform/submission-files'),
);
vi.mock('@vben/utils', () => ({ downloadFileFromBlobPart: vi.fn() }));
vi.mock('./attachment-preview', () => ({
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
      props: ['disabled'],
      setup: (props, ctx) => () =>
        h(
          'button',
          { ...ctx.attrs, disabled: props.disabled },
          ctx.slots.default?.(),
        ),
    }),
    Card: Wrap,
    Space: Wrap,
    Table: defineComponent({
      props: ['dataSource'],
      setup: (props) => () =>
        h(
          'ul',
          { 'aria-label': '已选附件' },
          props.dataSource.map((file: { name: string }) => h('li', file.name)),
        ),
    }),
    Tag: Wrap,
  };
});

const cleanup: (() => void)[] = [];
afterEach(() => cleanup.splice(0).forEach((dispose) => dispose()));

async function mount(initialFiles: File[] = [], disabled = false) {
  const files = ref(initialFiles);
  const update = vi.fn((next: File[]) => {
    files.value = next;
  });
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp({
    render: () =>
      h(CreationAttachments, {
        disabled,
        files: files.value,
        'onUpdate:files': update,
      }),
  });
  app.mount(host);
  cleanup.push(() => {
    app.unmount();
    host.remove();
  });
  await nextTick();
  return { files, host, update };
}

function paste(
  host: HTMLElement,
  clipboardData: {
    files: File[];
    items?: Pick<DataTransferItem, 'getAsFile' | 'kind'>[];
  },
) {
  const event = new Event('paste', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'clipboardData', { value: clipboardData });
  host.querySelector('.attachment-drop')!.dispatchEvent(event);
  return event;
}

async function addFiles(
  host: HTMLElement,
  files: File[],
  method: 'choose' | 'drop' | 'paste',
) {
  if (method === 'choose') {
    const input = host.querySelector<HTMLInputElement>('input[type=file]')!;
    Object.defineProperty(input, 'files', { configurable: true, value: files });
    input.dispatchEvent(new Event('change'));
  } else if (method === 'drop') {
    const event = new Event('drop', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'dataTransfer', { value: { files } });
    host.querySelector('.attachment-drop')!.dispatchEvent(event);
  } else {
    paste(host, { files });
  }
  await nextTick();
}

describe('creation attachment formats', () => {
  it.each(['choose', 'drop'] as const)(
    'accepts AI and common archives via %s and shows the shared format hint',
    async (method) => {
      const { files, host, update } = await mount();
      const input = host.querySelector<HTMLInputElement>('input[type=file]')!;
      expect(input.multiple).toBe(true);
      expect(input.accept).toBe(ATTACHMENT_ACCEPT);
      for (const extension of ['.ai', '.zip', '.rar', '.7z']) {
        expect(input.accept.split(',')).toContain(extension);
      }
      expect(host.querySelector('.attachment-hint')?.textContent).toContain(
        ATTACHMENT_FORMAT_TEXT,
      );

      const selection = ['原稿.AI', '资料.ZIP', '源文件.RAR', '打包.7Z'].map(
        (name) => new File(['data'], name),
      );
      await addFiles(host, selection, method);

      expect(update).toHaveBeenCalledOnce();
      expect(files.value).toEqual(selection);
      expect(host.querySelector('[role=alert]')).toBeNull();
      expect(host.textContent).toContain('已选 4 个附件');
      expect(
        [...host.querySelectorAll('li')].map((row) => row.textContent),
      ).toEqual(selection.map((file) => file.name));
    },
  );

  it.each(['choose', 'drop', 'paste'] as const)(
    'rejects a disguised executable via %s and retains the previously selected file',
    async (method) => {
      const existing = new File(['data'], '已选原稿.ai');
      const { files, host, update } = await mount([existing]);
      await addFiles(host, [new File(['data'], '原稿.ai.exe')], method);

      expect(update).not.toHaveBeenCalled();
      expect(files.value).toEqual([existing]);
      expect(host.querySelector('[role=alert]')?.textContent).toContain(
        '不支持 原稿.ai.exe 的文件格式',
      );
      expect(host.textContent).toContain('已选 1 个附件');
      expect(
        [...host.querySelectorAll('li')].map((row) => row.textContent),
      ).toEqual([existing.name]);
    },
  );
});

describe('creation attachment clipboard paste', () => {
  it('appends a screenshot and a named file from the focused upload area', async () => {
    const existing = new File(['data'], '原稿.ai');
    const { files, host, update } = await mount([existing]);
    const dropArea = host.querySelector<HTMLElement>('.attachment-drop')!;
    const screenshot = new File(['data'], 'image.png', { type: 'image/png' });
    const contractFile = new File(['data'], '合同.pdf', {
      type: 'application/pdf',
    });

    expect(dropArea.tabIndex).toBe(0);
    const parentPaste = vi.fn();
    host.addEventListener('paste', parentPaste);
    dropArea.focus();
    expect(document.activeElement).toBe(dropArea);
    const event = paste(host, { files: [screenshot, contractFile] });
    await nextTick();

    expect(event.defaultPrevented).toBe(true);
    expect(parentPaste).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledOnce();
    expect(files.value).toEqual([existing, screenshot, contractFile]);
  });

  it('leaves a plain text paste untouched', async () => {
    const { host, update } = await mount();

    const event = paste(host, {
      files: [],
      items: [{ getAsFile: () => null, kind: 'string' }],
    });

    expect(event.defaultPrevented).toBe(false);
    expect(update).not.toHaveBeenCalled();
  });

  it('reads file items when the clipboard file list is empty', async () => {
    const { files, host } = await mount();
    const screenshot = new File(['data'], 'image.png', { type: 'image/png' });

    paste(host, {
      files: [],
      items: [{ getAsFile: () => screenshot, kind: 'file' }],
    });
    await nextTick();

    expect(files.value).toEqual([screenshot]);
  });

  it('ignores file paste when the upload area is disabled', async () => {
    const { host, update } = await mount([], true);
    const screenshot = new File(['data'], 'image.png', { type: 'image/png' });

    expect(paste(host, { files: [screenshot] }).defaultPrevented).toBe(false);
    expect(update).not.toHaveBeenCalled();
  });
});
