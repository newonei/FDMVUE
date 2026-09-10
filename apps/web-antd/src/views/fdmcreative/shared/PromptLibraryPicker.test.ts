import type { FdmCreativeApi } from '#/api/fdmcreative';

import { createApp, nextTick } from 'vue';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import PromptLibraryPicker from './PromptLibraryPicker.vue';

const api = vi.hoisted(() => ({
  getCreativePromptCategories: vi.fn(),
  getCreativePromptPage: vi.fn(),
}));

vi.mock('#/api/fdmcreative', () => api);
vi.mock('@vben/icons', () => ({ IconifyIcon: { render: () => null } }));
vi.mock('ant-design-vue', async () => {
  const { defineComponent, h } = await import('vue');
  const content = defineComponent({
    setup(_props, { slots }) {
      return () => h('div', slots.default?.());
    },
  });
  return {
    Alert: defineComponent({
      props: ['message'],
      setup(props, { slots }) {
        return () => h('div', { role: 'alert' }, [props.message, slots.action?.()]);
      },
    }),
    Button: defineComponent({
      setup(_props, { attrs, slots }) {
        return () => h('button', attrs, slots.default?.());
      },
    }),
    Empty: defineComponent({
      props: ['description'],
      setup(props) {
        return () => h('div', { 'data-empty': true }, props.description);
      },
    }),
    Input: {
      Search: defineComponent({
        props: ['value'],
        emits: ['update:value', 'search'],
        setup(props, { emit }) {
          return () =>
            h('input', {
              value: props.value,
              onChange: (event: Event) => {
                emit('update:value', (event.target as HTMLInputElement).value);
                emit('search');
              },
            });
        },
      }),
    },
    Modal: defineComponent({
      props: ['open'],
      setup(props, { slots }) {
        return () => (props.open ? h('section', slots.default?.()) : null);
      },
    }),
    Pagination: defineComponent({
      props: ['current'],
      emits: ['update:current', 'change'],
      setup(props, { emit }) {
        return () =>
          h('button', {
            'data-next-page': true,
            onClick: () => {
              emit('update:current', props.current + 1);
              emit('change');
            },
          });
      },
    }),
    Select: defineComponent({
      props: ['options', 'value'],
      emits: ['update:value', 'change'],
      setup(props, { attrs, emit }) {
        return () =>
          h(
            'select',
            {
              ...attrs,
              value: props.value ?? '',
              onChange: (event: Event) => {
                emit(
                  'update:value',
                  (event.target as HTMLSelectElement).value || undefined,
                );
                emit('change');
              },
            },
            [
              h('option', { value: '' }, '全部'),
              ...props.options.map((option: { label: string; value: string }) =>
                h('option', { value: option.value }, option.label),
              ),
            ],
          );
      },
    }),
    Spin: content,
    Tag: content,
  };
});

const prompts: FdmCreativeApi.CreativePrompt[] = [
  {
    category: 'PRODUCT_ECOMMERCE',
    content: '商品摄影，柔和灯光',
    editable: false,
    id: 1,
    name: '同事的商品主图',
    ownerUserId: 100,
    targetType: 'IMAGE',
    visibility: 'TENANT',
  },
  {
    category: 'VIDEO_SCRIPT',
    content: '缓慢推进的镜头',
    editable: false,
    id: 2,
    name: '同事的视频镜头',
    ownerUserId: 200,
    targetType: 'VIDEO',
    visibility: 'TENANT',
  },
];

const cleanup: Array<() => void> = [];

async function settle() {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await nextTick();
}

function mount(targetType: FdmCreativeApi.PromptTargetType = 'GENERAL') {
  const container = document.createElement('div');
  const select = vi.fn();
  const app = createApp(PromptLibraryPicker, {
    currentText: '现有提示词',
    onSelect: select,
    targetType,
  });
  app.mount(container);
  cleanup.push(() => app.unmount());
  const click = (text: string) => {
    const button = [...container.querySelectorAll('button')].find(
      (item) => item.textContent?.trim() === text,
    );
    expect(button, `button ${text}`).toBeTruthy();
    button!.click();
  };
  click('提示词库');
  return { click, container, select };
}

beforeEach(() => {
  vi.clearAllMocks();
  api.getCreativePromptCategories.mockResolvedValue([]);
  api.getCreativePromptPage.mockResolvedValue({ list: prompts, total: 2 });
});

afterEach(() => cleanup.splice(0).forEach((dispose) => dispose()));

describe('shared prompt library picker', () => {
  it.each(['GENERAL', 'IMAGE', 'VIDEO'] as const)(
    'shows all purposes in a %s node and uses the selected colleague prompt',
    async (targetType) => {
      const { click, container, select } = mount(targetType);
      await settle();
      const query = api.getCreativePromptPage.mock.calls[0]![0];
      expect(query.compatibleTargetType).toBeUndefined();
      expect(query.targetType).toBeUndefined();
      expect(query.mineOnly).toBeUndefined();
      expect(container.textContent).toContain('同事的商品主图');
      expect(container.textContent).toContain('同事的视频镜头');

      container.querySelector<HTMLButtonElement>('.prompt-option')!.click();
      await nextTick();
      click('替换并使用');
      expect(select).toHaveBeenCalledWith({
        content: prompts[0]!.content,
        mode: 'replace',
        prompt: prompts[0],
      });
    },
  );

  it('lets employees filter explicitly, search and return to all purposes', async () => {
    const { container } = mount();
    await settle();
    const purpose = container.querySelector<HTMLSelectElement>(
      '[aria-label="提示词用途"]',
    )!;
    purpose.value = 'IMAGE';
    purpose.dispatchEvent(new Event('change'));
    await settle();
    expect(api.getCreativePromptPage).toHaveBeenLastCalledWith(
      expect.objectContaining({ pageNo: 1, targetType: 'IMAGE' }),
    );

    const search = container.querySelector('input')!;
    search.value = '  商品  ';
    search.dispatchEvent(new Event('change'));
    await settle();
    expect(api.getCreativePromptPage).toHaveBeenLastCalledWith(
      expect.objectContaining({ keyword: '商品', pageNo: 1, targetType: 'IMAGE' }),
    );
    purpose.value = '';
    purpose.dispatchEvent(new Event('change'));
    await settle();
    expect(api.getCreativePromptPage).toHaveBeenLastCalledWith(
      expect.objectContaining({ targetType: undefined }),
    );
  });

  it('reports failed requests instead of an empty library and supports retry', async () => {
    api.getCreativePromptPage.mockRejectedValueOnce(new Error('403'));
    const { click, container } = mount();
    await settle();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      '提示词加载失败',
    );
    expect(container.querySelector('[data-empty]')).toBeNull();
    click('重试');
    await settle();
    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(container.textContent).toContain('同事的商品主图');
  });

  it('continues loading prompts if the optional category request fails', async () => {
    api.getCreativePromptCategories.mockRejectedValueOnce(
      new Error('unavailable'),
    );
    const { click, container, select } = mount();
    await settle();
    container.querySelector<HTMLButtonElement>('.prompt-option')!.click();
    await nextTick();
    click('追加到现有内容');
    expect(select).toHaveBeenCalledWith(
      expect.objectContaining({ mode: 'append' }),
    );
  });

  it('discards an older response when a newer search finishes first', async () => {
    let resolveOld!: (value: {
      list: FdmCreativeApi.CreativePrompt[];
      total: number;
    }) => void;
    api.getCreativePromptPage.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveOld = resolve;
        }),
    );
    const { container } = mount();
    await settle();
    api.getCreativePromptPage.mockResolvedValueOnce({
      list: [prompts[1]],
      total: 1,
    });
    const search = container.querySelector('input')!;
    search.value = '视频';
    search.dispatchEvent(new Event('change'));
    await settle();
    resolveOld({ list: [prompts[0]!], total: 1 });
    await settle();
    expect(container.textContent).toContain('同事的视频镜头');
    expect(container.textContent).not.toContain('同事的商品主图');
  });
});
