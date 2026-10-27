import type { ProductCategory } from '#/api/fdmplatform/products';

import { describe, expect, it } from 'vitest';

import {
  categoryList,
  categoryName,
  categoryOptions,
  searchCategories,
} from './category-model';

const categories: ProductCategory[] = [
  { id: 'aux', name: '辅料', sort: 30, active: true, version: 0 },
  { id: 'pu', name: 'PU橡胶瑜伽垫', sort: 20, active: true, version: 0 },
  { id: 'tpe', name: 'TPE瑜伽垫', sort: 10, active: true, version: 0 },
  { id: 'box', name: '纸箱', sort: 40, active: false, version: 0 },
];

describe('产品分类', () => {
  it('按排序列出并挂上产品数', () => {
    const list = categoryList(categories, [
      { categoryId: 'tpe', count: 5 },
      { categoryId: 'pu', count: 2 },
      { categoryId: '', count: 9 },
    ]);
    expect(list.map((item) => [item.name, item.count])).toEqual([
      ['TPE瑜伽垫', 5],
      ['PU橡胶瑜伽垫', 2],
      ['辅料', 0],
      ['纸箱', 0],
    ]);
  });

  it('按名称搜索', () => {
    const list = categoryList(categories);
    expect(searchCategories(list, 'pu').map((item) => item.id)).toEqual(['pu']);
    expect(searchCategories(list, '不存在')).toEqual([]);
  });

  it('显示分类名称', () => {
    expect(categoryName(categories, 'tpe')).toBe('TPE瑜伽垫');
    expect(categoryName(categories, 'gone')).toBeUndefined();
  });

  it('下拉不列停用的分类，产品当前所在的除外', () => {
    expect(categoryOptions(categories).map((item) => item.value)).toEqual([
      'tpe',
      'pu',
      'aux',
    ]);
    expect(categoryOptions(categories, 'box').at(-1)).toEqual({
      label: '纸箱（停用）',
      value: 'box',
    });
  });
});
