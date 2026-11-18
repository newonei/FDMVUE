import type {
  ProductCategory,
  ProductCategoryCount,
  ProductCategoryGroup,
} from '#/api/fdmplatform/products';

export const productCategoryGroups: {
  label: string;
  value: ProductCategoryGroup;
}[] = [
  { label: '自主生产', value: 'SELF_PRODUCED' },
  { label: '外采产品', value: 'OUTSOURCED' },
  { label: '原材料', value: 'RAW_MATERIAL' },
  { label: '设备耗材', value: 'EQUIPMENT_CONSUMABLE' },
];

export function productCategoryGroupName(group?: null | ProductCategoryGroup) {
  return productCategoryGroups.find((item) => item.value === group)?.label;
}

/** 一个分类及其产品数 */
export interface CategoryNode {
  id: string;
  name: string;
  active: boolean;
  count: number;
}

/** 分类按排序列出，挂上产品数 */
export function categoryList(
  categories: ProductCategory[],
  counts: ProductCategoryCount[] = [],
): CategoryNode[] {
  const countOf = new Map(counts.map((item) => [item.categoryId, item.count]));
  return categories
    .toSorted(
      (a, b) => a.sort - b.sort || a.name.localeCompare(b.name, 'zh-CN'),
    )
    .map((item) => ({
      id: item.id,
      name: item.name,
      active: item.active,
      count: countOf.get(item.id) ?? 0,
    }));
}

/** 按名称搜索分类 */
export function searchCategories(list: CategoryNode[], search: string) {
  const needle = search.trim().toLowerCase();
  if (!needle) return list;
  return list.filter((node) => node.name.toLowerCase().includes(needle));
}

/** 分类名称，找不到时返回 undefined */
export function categoryName(categories: ProductCategory[], id?: string) {
  return categories.find((item) => item.id === id)?.name;
}

/**
 * 产品编辑用的分类下拉：停用的分类不能新选，产品当前所在的分类仍保留为可选，便于原样保存。
 */
export function categoryOptions(
  categories: ProductCategory[],
  currentId?: string,
) {
  const groupById = new Map(
    categories.map((item) => [item.id, item.categoryGroup]),
  );
  return categoryList(categories)
    .filter((item) => item.active || item.id === currentId)
    .map((item) => {
      const group = productCategoryGroupName(groupById.get(item.id));
      const name = item.active ? item.name : `${item.name}（停用）`;
      return {
        label: group ? `${group} / ${name}` : name,
        value: item.id,
      };
    });
}
