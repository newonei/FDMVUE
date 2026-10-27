import type { ProductCategory } from '#/api/fdmplatform/products';

import { describe, expect, it } from 'vitest';

import {
  categoryOptions,
  categoryPath,
  categoryTree,
  searchCategoryTree,
} from './category-model';

const categories: ProductCategory[] = [
  { id: 'aux', name: '包装辅料', sort: 20, active: true, version: 0 },
  { id: 'mat', name: '瑜伽垫', sort: 10, active: true, version: 0 },
  {
    id: 'pu',
    parentId: 'mat',
    name: 'PU橡胶瑜伽垫',
    sort: 20,
    active: true,
    version: 0,
  },
  {
    id: 'tpe',
    parentId: 'mat',
    name: 'TPE瑜伽垫',
    sort: 10,
    active: true,
    version: 0,
  },
  {
    id: 'box',
    parentId: 'aux',
    name: '纸箱/彩盒',
    sort: 10,
    active: false,
    version: 0,
  },
];

describe('产品分类树', () => {
  it('按排序组装两级树，大类产品数为小类之和', () => {
    const tree = categoryTree(categories, [
      { categoryId: 'tpe', count: 5 },
      { categoryId: 'pu', count: 2 },
      { categoryId: '', count: 9 },
    ]);
    expect(tree.map((top) => [top.name, top.count])).toEqual([
      ['瑜伽垫', 7],
      ['包装辅料', 0],
    ]);
    expect(tree[0]!.children.map((child) => child.name)).toEqual([
      'TPE瑜伽垫',
      'PU橡胶瑜伽垫',
    ]);
  });

  it('搜索大类保留全部小类，搜索小类只留命中的小类', () => {
    const tree = categoryTree(categories);
    expect(
      searchCategoryTree(tree, '瑜伽垫').map((top) => top.children.length),
    ).toEqual([2]);
    const found = searchCategoryTree(tree, 'pu');
    expect(found.map((top) => top.name)).toEqual(['瑜伽垫']);
    expect(found[0]!.children.map((child) => child.id)).toEqual(['pu']);
    expect(searchCategoryTree(tree, '不存在')).toEqual([]);
  });

  it('小类显示大类路径', () => {
    expect(categoryPath(categories, 'tpe')).toBe('瑜伽垫 / TPE瑜伽垫');
    expect(categoryPath(categories, 'mat')).toBe('瑜伽垫');
    expect(categoryPath(categories, 'gone')).toBeUndefined();
  });

  it('下拉只能选小类，停用的小类只对当前产品保留', () => {
    const options = categoryOptions(categories);
    expect(options.every((top) => top.selectable === false)).toBe(true);
    const box = options[1]!.children[0]!;
    expect(box).toMatchObject({ title: '纸箱/彩盒（停用）', disabled: true });
    expect(categoryOptions(categories, 'box')[1]!.children[0]!.disabled).toBe(
      false,
    );
  });
});
