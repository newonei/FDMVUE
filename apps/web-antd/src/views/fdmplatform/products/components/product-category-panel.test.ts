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

const categories = [
  { id: 'mat', name: '瑜伽垫', sort: 10, active: true, version: 0 },
  { id: 'aux', name: '包装辅料', sort: 20, active: true, version: 0 },
  {
    id: 'tpe',
    parentId: 'mat',
    name: 'TPE瑜伽垫',
    sort: 10,
    active: true,
    version: 0,
  },
  {
    id: 'pu',
    parentId: 'mat',
    name: 'PU橡胶瑜伽垫',
    sort: 20,
    active: true,
    version: 0,
  },
  {
    id: 'box',
    parentId: 'aux',
    name: '纸箱',
    sort: 10,
    active: true,
    version: 0,
  },
];

describe('产品分类侧栏', () => {
  let root: HTMLElement | undefined;
  afterEach(() => {
    root?.remove();
    mocks.getProductCategories.mockReset();
  });

  it('按大类 / 小类显示产品数，点击发出分类 id 和路径，未分类在末', async () => {
    mocks.getProductCategories.mockResolvedValue({
      total: 6,
      categories,
      items: [
        { categoryId: 'tpe', count: 3 },
        { categoryId: '', count: 2 },
        { categoryId: 'box', count: 1 },
      ],
    });
    const value = ref<string | undefined>();
    const label = ref<string | undefined>();
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
          'onUpdate:value': (next: string | undefined, path?: string) => {
            value.value = next;
            label.value = path;
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
    // 没有产品的小类（PU橡胶瑜伽垫）不列出
    expect(names(root)).toEqual([
      '全部类别 6',
      '瑜伽垫 3',
      'TPE瑜伽垫 3',
      '包装辅料 1',
      '纸箱 1',
      '未分类 2',
    ]);

    nodes(root)[2]!.click();
    await nextTick();
    expect(value.value).toBe('tpe');
    expect(label.value).toBe('瑜伽垫 / TPE瑜伽垫');
    nodes(root)[1]!.click();
    await nextTick();
    expect(value.value).toBe('mat');
    nodes(root)[5]!.click();
    await nextTick();
    expect(value.value).toBe('');
    expect(label.value).toBe('未分类');
    nodes(root)[0]!.click();
    await nextTick();
    expect(value.value).toBeUndefined();

    // 搜索后选中的小类没有结果时仍显示，便于看到当前筛选
    value.value = 'box';
    mocks.getProductCategories.mockResolvedValue({
      total: 3,
      categories,
      items: [{ categoryId: 'tpe', count: 3 }],
    });
    keyword.value = '瑜伽垫';
    await flush();
    expect(mocks.getProductCategories).toHaveBeenLastCalledWith(
      expect.objectContaining({ keyword: '瑜伽垫' }),
    );
    expect(names(root)).toEqual([
      '全部类别 3',
      '瑜伽垫 3',
      'TPE瑜伽垫 3',
      '包装辅料 0',
      '纸箱 0',
    ]);
  });
});
