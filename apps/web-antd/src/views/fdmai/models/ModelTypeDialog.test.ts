import type { FdmAiApi } from '#/api/fdmai';

import { createApp, nextTick } from 'vue';

import { afterEach, describe, expect, it, vi } from 'vitest';

import ModelTypeDialog from './ModelTypeDialog.vue';

// Keep the business component and native selection controls real. Only replace
// Ant Design's portal host and button so tests do not depend on its animations.
vi.mock('ant-design-vue', async () => {
  const { defineComponent, h } = await import('vue');
  return {
    Button: defineComponent({
      inheritAttrs: false,
      setup(_props, { attrs, slots }) {
        return () => h('button', { ...attrs, type: 'button' }, slots.default?.());
      },
    }),
    Modal: defineComponent({
      props: { open: Boolean, title: String },
      emits: ['cancel'],
      setup(props, { emit, slots }) {
        return () =>
          props.open
            ? h('section', { role: 'dialog', 'aria-label': props.title }, [
                h('button', {
                  'aria-label': '关闭弹窗',
                  onClick: () => emit('cancel'),
                  type: 'button',
                }),
                slots.default?.(),
                slots.footer?.(),
              ])
            : null;
      },
    }),
  };
});

const cleanups: Array<() => void> = [];
afterEach(() => {
  cleanups.splice(0).forEach((cleanup) => cleanup());
});

const textImageAdapter: FdmAiApi.AdapterDescriptor = {
  capabilities: ['CHAT', 'STRUCTURED_OUTPUT', 'IMAGE_INPUT', 'TEXT_TO_IMAGE'],
  code: 'openai-compatible-text',
  modalities: ['TEXT', 'IMAGE'],
  name: '文本图片渠道',
};
const videoAdapter: FdmAiApi.AdapterDescriptor = {
  capabilities: ['TEXT_TO_VIDEO', 'FIRST_FRAME_TO_VIDEO', 'FIRST_LAST_FRAME_TO_VIDEO'],
  code: 'video-channel',
  modalities: ['VIDEO'],
  name: '视频渠道',
};

function mountDialog(options: {
  adapter?: FdmAiApi.AdapterDescriptor;
  model?: FdmAiApi.ProviderModelInfo;
} = {}) {
  const confirmed = vi.fn();
  const openChanged = vi.fn();
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp(ModelTypeDialog, {
    adapter: options.adapter ?? textImageAdapter,
    model: options.model ?? { id: 'grok-imagine-video', metadata: {} },
    open: true,
    providerName: '测试服务商',
    onConfirm: confirmed,
    'onUpdate:open': openChanged,
  });
  app.mount(host);
  cleanups.push(() => {
    app.unmount();
    host.remove();
  });
  return { confirmed, host, openChanged };
}

function requiredInput(host: HTMLElement, type: 'checkbox' | 'radio', value: string) {
  const input = host.querySelector<HTMLInputElement>(`input[type="${type}"][value="${value}"]`);
  expect(input, `missing ${type} option ${value}`).not.toBeNull();
  return input!;
}

async function select(host: HTMLElement, type: 'checkbox' | 'radio', value: string) {
  requiredInput(host, type, value).click();
  await nextTick();
}

function confirmButton(host: HTMLElement) {
  const button = [...host.querySelectorAll<HTMLButtonElement>('button')]
    .find((item) => item.textContent?.includes('确认类型'));
  expect(button).toBeDefined();
  return button!;
}

function statusText(host: HTMLElement) {
  return host.querySelector('[role="status"]')?.textContent ?? '';
}

describe('model type confirmation dialog', () => {
  it('always shows all seven output types even when the channel only supports text and images', () => {
    const { host } = mountDialog();
    expect([...host.querySelectorAll<HTMLInputElement>('input[type="radio"]')]
      .map((input) => input.value)).toEqual([
      'TEXT', 'IMAGE', 'VIDEO', 'AUDIO', 'MUSIC', 'EMBEDDING', 'RERANK',
    ]);
    expect(requiredInput(host, 'radio', 'VIDEO').disabled).toBe(false);
    expect(requiredInput(host, 'radio', 'VIDEO').closest('label')?.textContent)
      .toContain('渠道暂不支持');
  });

  it('shows all three video call options after selecting video', async () => {
    const { host } = mountDialog();
    await select(host, 'radio', 'VIDEO');
    expect([...host.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')]
      .map((input) => input.value)).toEqual([
      'TEXT_TO_VIDEO', 'FIRST_FRAME_TO_VIDEO', 'FIRST_LAST_FRAME_TO_VIDEO',
    ]);
    expect(confirmButton(host).disabled).toBe(true);
  });

  it('confirms the exact video classification while clearly retaining the unsupported channel status', async () => {
    const { confirmed, host } = mountDialog();
    await select(host, 'radio', 'VIDEO');
    await select(host, 'checkbox', 'TEXT_TO_VIDEO');
    expect(statusText(host)).toContain('当前渠道暂不支持视频生成');
    expect(confirmButton(host).textContent).toContain('保留待接入');
    expect(confirmButton(host).disabled).toBe(false);
    confirmButton(host).click();
    expect(confirmed).toHaveBeenCalledExactlyOnceWith({
      capabilities: ['TEXT_TO_VIDEO'], modality: 'VIDEO',
    });
  });

  it('allows the same video classification for a channel that supports video', async () => {
    const { confirmed, host } = mountDialog({ adapter: videoAdapter });
    await select(host, 'radio', 'VIDEO');
    await select(host, 'checkbox', 'TEXT_TO_VIDEO');
    expect(statusText(host)).toContain('当前渠道支持所选调用方式');
    expect(confirmButton(host).textContent).toContain('可接入');
    expect(confirmButton(host).disabled).toBe(false);
    confirmButton(host).click();
    expect(confirmed).toHaveBeenCalledExactlyOnceWith({
      capabilities: ['TEXT_TO_VIDEO'], modality: 'VIDEO',
    });
  });

  it('does not remove an explicit backend restriction when the user changes the type to supported text', async () => {
    const { confirmed, host } = mountDialog({
      model: {
        capabilities: ['TEXT_TO_VIDEO'],
        id: 'grok-imagine-video',
        importable: false,
        metadata: {},
        modality: 'VIDEO',
      },
    });
    await select(host, 'radio', 'TEXT');
    await select(host, 'checkbox', 'CHAT');
    expect(statusText(host)).toContain('当前渠道暂不可接入这个模型');
    expect(statusText(host)).toContain('类型确认不会解除渠道的接入限制');
    expect(confirmButton(host).textContent).toContain('保留待接入');
    confirmButton(host).click();
    expect(confirmed).toHaveBeenCalledExactlyOnceWith({
      capabilities: ['CHAT'], modality: 'TEXT',
    });
    expect(host.querySelector('[role="status"]')?.classList.contains('unsupported')).toBe(true);
  });

  it('requires fresh capabilities when the output type changes and never emits stale text capabilities with video', async () => {
    const { confirmed, host } = mountDialog({
      model: { capabilities: ['CHAT', 'IMAGE_INPUT'], id: 'review-model', metadata: {}, modality: 'TEXT' },
    });
    expect(confirmButton(host).disabled).toBe(false);
    await select(host, 'radio', 'VIDEO');
    expect(host.querySelectorAll('input[type="checkbox"]:checked')).toHaveLength(0);
    expect(confirmButton(host).disabled).toBe(true);
    confirmButton(host).click();
    expect(confirmed).not.toHaveBeenCalled();
    await select(host, 'checkbox', 'FIRST_FRAME_TO_VIDEO');
    confirmButton(host).click();
    expect(confirmed).toHaveBeenCalledExactlyOnceWith({
      capabilities: ['FIRST_FRAME_TO_VIDEO'], modality: 'VIDEO',
    });
  });

  it('requires a text call capability in addition to the image input option', async () => {
    const { confirmed, host } = mountDialog();
    await select(host, 'radio', 'TEXT');
    await select(host, 'checkbox', 'IMAGE_INPUT');
    expect(confirmButton(host).disabled).toBe(true);
    expect(statusText(host)).toContain('图片理解是附加输入能力');
    confirmButton(host).click();
    expect(confirmed).not.toHaveBeenCalled();
    await select(host, 'checkbox', 'CHAT');
    expect(confirmButton(host).disabled).toBe(false);
  });

  it.each(['返回目录', '关闭弹窗'])('closes through %s without confirming the selection', async (action) => {
    const { confirmed, host, openChanged } = mountDialog();
    await select(host, 'radio', 'VIDEO');
    await select(host, 'checkbox', 'TEXT_TO_VIDEO');
    const button = [...host.querySelectorAll<HTMLButtonElement>('button')]
      .find((item) => item.textContent === action || item.getAttribute('aria-label') === action);
    expect(button).toBeDefined();
    button!.click();
    expect(openChanged).toHaveBeenCalledExactlyOnceWith(false);
    expect(confirmed).not.toHaveBeenCalled();
  });
});
