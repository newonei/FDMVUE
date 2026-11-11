import type { ProductAttributeOptions } from '#/api/fdmplatform/products';

import { createApp, defineComponent, h, nextTick, ref } from 'vue';

import { afterEach, describe, expect, it, vi } from 'vitest';

import ProductStageSelect from './ProductStageSelect.vue';

// Keep Ant's path/event contract, while exercising the actual controlled selector.
vi.mock('ant-design-vue', () => ({
  Cascader: defineComponent({
    props: ['value', 'options', 'changeOnSelect'],
    emits: ['change'],
    setup:
      (props, { emit }) =>
      () =>
        h('div', [
          h(
            'output',
            { 'data-selection': true },
            JSON.stringify(props.value ?? []),
          ),
          h('span', {
            'data-parent-selectable': String(Boolean(props.changeOnSelect)),
          }),
          ...props.options.flatMap(
            (group: {
              children: Array<{ label: string; value: string }>;
              label: string;
              value: string;
            }) => [
              h(
                'button',
                {
                  'data-parent': group.value,
                  onClick: () => emit('change', [group.value]),
                },
                group.label,
              ),
              ...group.children.map((leaf) =>
                h(
                  'button',
                  {
                    'data-leaf': leaf.value,
                    onClick: () => emit('change', [group.value, leaf.value]),
                  },
                  leaf.label,
                ),
              ),
            ],
          ),
          h(
            'button',
            { 'data-clear': true, onClick: () => emit('change', []) },
            '清空',
          ),
        ]),
  }),
}));

const options: ProductAttributeOptions['stages'] = [
  { value: 'BOARD', label: '发泡板材', group: '半成品' },
  { value: 'SHEET', label: '已开片板材', group: '半成品' },
  { value: 'PACKED', label: '已包装成品', group: '成品' },
];
let dispose: (() => void) | undefined;
afterEach(() => {
  dispose?.();
  document.body.innerHTML = '';
});

async function mount(allowGroups?: boolean, initial?: string) {
  const value = ref<string | undefined>(initial);
  const changed = vi.fn((next: string | undefined) => {
    value.value = next;
  });
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp({
    render: () =>
      h(ProductStageSelect, {
        options,
        value: value.value,
        ...(allowGroups === undefined ? {} : { allowGroups }),
        'onUpdate:value': changed,
      }),
  });
  app.mount(host);
  dispose = () => app.unmount();
  await nextTick();
  return { host, value, changed };
}
async function click(host: HTMLElement, selector: string) {
  host.querySelector<HTMLButtonElement>(selector)!.click();
  await nextTick();
}

describe('生产分类选择：筛选与档案维护', () => {
  it('筛选可直接选择半成品，也可继续细分，再清空回全部', async () => {
    const { host, value } = await mount(true);
    expect(
      host.querySelector('[data-parent-selectable="true"]'),
    ).not.toBeNull();
    await click(host, '[data-parent="group:半成品"]');
    expect(value.value).toBe('group:半成品');
    expect(host.querySelector('output')!.textContent).toBe('["group:半成品"]');
    await click(host, '[data-leaf="SHEET"]');
    expect(value.value).toBe('SHEET');
    expect(host.querySelector('output')!.textContent).toBe(
      '["group:半成品","SHEET"]',
    );
    await click(host, '[data-clear]');
    expect(value.value).toBeUndefined();
    expect(host.querySelector('output')!.textContent).toBe('[]');
  });

  it('恢复父级筛选时显示单层路径，不把大类伪装成其他分类中的叶子', async () => {
    const { host } = await mount(true, 'group:半成品');
    expect(host.querySelector('output')!.textContent).toBe('["group:半成品"]');
    expect(host.querySelector('[data-leaf="group:半成品"]')).toBeNull();
    expect(host.querySelectorAll('[data-parent="group:半成品"]')).toHaveLength(
      1,
    );
  });

  it('默认档案编辑只接受具体阶段，点击父级不会清掉已有阶段或写入大类', async () => {
    const { host, value, changed } = await mount(undefined, 'BOARD');
    expect(
      host.querySelector('[data-parent-selectable="false"]'),
    ).not.toBeNull();
    await click(host, '[data-parent="group:半成品"]');
    expect(value.value).toBe('BOARD');
    expect(changed).not.toHaveBeenCalled();
    await click(host, '[data-leaf="PACKED"]');
    expect(value.value).toBe('PACKED');
  });
});
