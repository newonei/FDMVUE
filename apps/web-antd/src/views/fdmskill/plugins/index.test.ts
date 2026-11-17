/* eslint-disable vue/one-component-per-file -- Small UI adapters exercise the actual page state and publication requests. */
import type { App, PropType } from 'vue';

import { createApp, defineComponent, h, nextTick } from 'vue';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import PluginMarket from './index.vue';

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  update: vi.fn(),
  confirm: vi.fn(),
  success: vi.fn(),
  warning: vi.fn(),
  error: vi.fn(),
}));
vi.mock('#/api/fdmskill/plugins', () => ({
  getPluginMarket: mocks.get,
  updatePluginMarket: mocks.update,
}));
vi.mock('@vben/hooks', () => ({
  useAppConfig: () => ({ apiURL: '/admin-api' }),
}));
vi.mock('@vben/common-ui', () => ({
  Page: defineComponent({
    setup: (_, context) => () => h('main', context.slots.default?.()),
  }),
}));
vi.mock('ant-design-vue', () => {
  const block = defineComponent({
    setup: (_, context) => () => h('div', context.slots.default?.()),
  });
  const button = defineComponent({
    props: { disabled: Boolean },
    setup: (props, context) => () =>
      h(
        'button',
        { ...context.attrs, disabled: props.disabled },
        context.slots.default?.(),
      ),
  });
  const input = defineComponent({
    props: {
      value: { type: [String, Number, Object], default: '' },
      readonly: Boolean,
    },
    emits: ['update:value'],
    setup: (props, context) => () =>
      h('textarea', {
        ...context.attrs,
        value: props.value,
        readOnly: props.readonly,
        onInput: (event: Event) =>
          context.emit(
            'update:value',
            (event.target as HTMLTextAreaElement).value,
          ),
      }),
  });
  const modal = Object.assign(
    defineComponent({
      props: {
        open: Boolean,
        title: { type: String, default: '' },
        okText: { type: String, default: '' },
        okButtonProps: {
          type: Object as PropType<{ disabled?: boolean }>,
          default: () => ({}),
        },
      },
      emits: ['ok'],
      setup: (props, context) => () =>
        props.open
          ? h('section', { 'aria-label': props.title }, [
              context.slots.default?.(),
              h(
                'button',
                {
                  disabled: props.okButtonProps?.disabled,
                  onClick: () => context.emit('ok'),
                },
                props.okText,
              ),
            ])
          : null,
    }),
    { confirm: mocks.confirm },
  );
  return {
    Alert: defineComponent({
      props: {
        message: { type: String, default: '' },
        description: { type: String, default: '' },
      },
      setup: (props) => () =>
        h('aside', `${props.message} ${props.description ?? ''}`),
    }),
    Button: button,
    Card: block,
    Empty: block,
    Form: block,
    FormItem: block,
    Input: input,
    DatePicker: input,
    Textarea: input,
    Select: block,
    Switch: block,
    Tag: block,
    Space: Object.assign(block, { Compact: block }),
    Table: defineComponent({
      props: {
        dataSource: { type: Array as PropType<unknown[]>, default: () => [] },
      },
      setup: (props) => () => h('div', JSON.stringify(props.dataSource)),
    }),
    Modal: modal,
    message: {
      success: mocks.success,
      warning: mocks.warning,
      error: mocks.error,
    },
  };
});

const initial = () => ({
  enabled: true,
  indexPath: '/plugins/index.json',
  indexUrl: 'https://market.fdm.example/plugins/index.json',
  revision: 'a'.repeat(64),
  index: {
    format: 1,
    title: '公司插件',
    plugins: [],
    metadata: { categories: {} },
  },
});

let app: App | undefined;
let host: HTMLDivElement;
async function flush() {
  for (let step = 0; step < 5; step++) {
    await Promise.resolve();
    await nextTick();
  }
}
async function mount() {
  host = document.createElement('div');
  document.body.append(host);
  app = createApp(PluginMarket);
  app.mount(host);
  await flush();
}
function button(text: string) {
  const found = [...host.querySelectorAll('button')].find(
    (element) => element.textContent?.trim() === text,
  );
  if (!found) throw new Error(`Button ${text} not found`);
  return found;
}
async function editJson(title: string) {
  button('高级 JSON').click();
  await flush();
  const textarea = host.querySelector<HTMLTextAreaElement>(
    '[aria-label="插件索引 JSON"]',
  )!;
  const document = JSON.parse(textarea.value);
  document.title = title;
  textarea.value = JSON.stringify(document);
  textarea.dispatchEvent(new Event('input', { bubbles: true }));
  await flush();
  button('应用到草稿').click();
  await flush();
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.get.mockResolvedValue(initial());
  mocks.update.mockImplementation(async (data) => ({
    ...initial(),
    ...data,
    revision: 'b'.repeat(64),
  }));
});
afterEach(() => {
  app?.unmount();
  host?.remove();
});

describe('plugin market publication page', () => {
  it('publishes a changed draft with the loaded revision and resets the dirty state', async () => {
    await mount();
    expect(button('发布修改').disabled).toBe(true);
    await editJson('新的插件市场');
    expect(mocks.update).not.toHaveBeenCalled();
    expect(button('发布修改').disabled).toBe(false);
    button('发布修改').click();
    await flush();
    expect(mocks.update).toHaveBeenCalledWith({
      revision: 'a'.repeat(64),
      index: { ...initial().index, title: '新的插件市场' },
    });
    expect(button('发布修改').disabled).toBe(true);
    expect(host.textContent).not.toContain('有未发布修改');
  });

  it('retains unsaved content when reloading fails and disables publishing until a successful reload', async () => {
    await mount();
    await editJson('必须保留的草稿');
    mocks.get.mockRejectedValueOnce(new Error('网络不可用'));
    button('重新加载').click();
    expect(mocks.confirm).toHaveBeenCalled();
    await mocks.confirm.mock.calls[0]![0].onOk();
    await flush();
    expect(host.textContent).toContain('必须保留的草稿');
    expect(host.textContent).toContain('网络不可用');
    expect(button('发布修改').disabled).toBe(true);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('keeps a conflicted draft available for copying and prevents retrying a stale revision', async () => {
    await mount();
    await editJson('发生冲突的草稿');
    mocks.update.mockRejectedValueOnce({
      response: {
        status: 409,
        data: { msg: '插件目录已被其他管理员更新，请刷新后重新编辑' },
      },
    });
    button('发布修改').click();
    await flush();
    expect(host.textContent).toContain('发生冲突的草稿');
    expect(button('发布修改').disabled).toBe(true);
    button('高级 JSON').click();
    await flush();
    const textarea = host.querySelector<HTMLTextAreaElement>(
      '[aria-label="插件索引 JSON"]',
    )!;
    expect(textarea.value).toContain('发生冲突的草稿');
    expect(textarea.readOnly).toBe(true);
  });
});
