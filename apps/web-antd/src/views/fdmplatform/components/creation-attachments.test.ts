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

async function mount(initialFiles: File[] = []) {
  const files = ref(initialFiles);
  const update = vi.fn((next: File[]) => {
    files.value = next;
  });
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp({
    render: () =>
      h(CreationAttachments, {
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

async function addFiles(
  host: HTMLElement,
  files: File[],
  method: 'choose' | 'drop',
) {
  if (method === 'choose') {
    const input = host.querySelector<HTMLInputElement>('input[type=file]')!;
    Object.defineProperty(input, 'files', { configurable: true, value: files });
    input.dispatchEvent(new Event('change'));
  } else {
    const event = new Event('drop', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'dataTransfer', { value: { files } });
    host.querySelector('.attachment-drop')!.dispatchEvent(event);
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

  it.each(['choose', 'drop'] as const)(
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
