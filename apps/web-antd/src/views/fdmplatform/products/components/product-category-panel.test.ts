import { createApp, h, nextTick, ref } from 'vue';

import { afterEach, describe, expect, it, vi } from 'vitest';

import ProductCategoryPanel from './ProductCategoryPanel.vue';

const mocks = vi.hoisted(() => ({ getProductCategories: vi.fn() }));
vi.mock('#/api/fdmplatform/products', () => ({
  getProductCategories: mocks.getProductCategories,
}));

async function flush() {
  for (let i = 0; i < 4; i++) {
    await Promise.resolve();
    await nextTick();
  }
}
function nodes(root: HTMLElement) {
  return [...root.querySelectorAll<HTMLElement>('.category-list .node')];
}
function names(root: HTMLElement) {
  return nodes(root).map(
    (button) =>
      `${button.querySelector('.name')?.textContent?.trim()} ${button.querySelector('.count')?.textContent?.trim()}`,
  );
}

describe('产品分类侧栏', () => {
  let root: HTMLElement | undefined;
  afterEach(() => {
    root?.remove();
    mocks.getProductCategories.mockReset();
  });

  it('全部在前、未分类在末，点击发出分类原文，空字符串表示未分类', async () => {
    mocks.getProductCategories.mockResolvedValue({
      total: 6,
      items: [
        { category: '外采产品(OC2400000)', count: 3 },
        { category: '', count: 2 },
        { category: '辅料', count: 1 },
      ],
    });
    const value = ref<string | undefined>();
    const keyword = ref('');
    root = document.createElement('div');
    document.body.append(root);
    createApp({
      render: () =>
        h(ProductCategoryPanel, {
          companyId: 0,
          keyword: keyword.value,
          selectable: true,
          value: value.value,
          'onUpdate:value': (next: string | undefined) => {
            value.value = next;
          },
        }),
    }).mount(root);
    await flush();
    expect(mocks.getProductCategories).toHaveBeenCalledWith({
      companyId: 0,
      keyword: undefined,
      active: undefined,
      selectable: true,
    });
    expect(names(root)).toEqual([
      '全部类别 6',
      '无分类产品 2',
      '外采产品(OC2400000) 3',
      '辅料 1',
    ]);

    nodes(root)[3]!.click();
    await nextTick();
    expect(value.value).toBe('辅料');
    nodes(root)[1]!.click();
    await nextTick();
    expect(value.value).toBe('');
    nodes(root)[0]!.click();
    await nextTick();
    expect(value.value).toBeUndefined();

    // 搜索后选中的分类没有结果时仍显示，便于看到当前筛选
    value.value = '辅料';
    mocks.getProductCategories.mockResolvedValue({
      total: 3,
      items: [{ category: '外采产品(OC2400000)', count: 3 }],
    });
    keyword.value = '瑜伽垫';
    await flush();
    expect(mocks.getProductCategories).toHaveBeenLastCalledWith(
      expect.objectContaining({ keyword: '瑜伽垫' }),
    );
    expect(names(root)).toEqual([
      '全部类别 3',
      '辅料 0',
      '外采产品(OC2400000) 3',
    ]);
  });
});
