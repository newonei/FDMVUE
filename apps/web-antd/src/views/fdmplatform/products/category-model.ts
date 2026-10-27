import type {
  ProductCategory,
  ProductCategoryCount,
} from '#/api/fdmplatform/products';

/** 两级分类树的一个节点；大类的 count 为其下各小类之和 */
export interface CategoryNode {
  id: string;
  name: string;
  active: boolean;
  count: number;
  parentId?: string;
  children: CategoryNode[];
}

function ordered(list: ProductCategory[]) {
  return list.toSorted(
    (a, b) => a.sort - b.sort || a.name.localeCompare(b.name, 'zh-CN'),
  );
}

/** 平铺的分类按 parentId 组装成两级树，挂上产品数 */
export function categoryTree(
  categories: ProductCategory[],
  counts: ProductCategoryCount[] = [],
): CategoryNode[] {
  const countOf = new Map(counts.map((item) => [item.categoryId, item.count]));
  return ordered(categories.filter((item) => !item.parentId)).map((top) => {
    const children = ordered(
      categories.filter((item) => item.parentId === top.id),
    ).map((child) => ({
      id: child.id,
      name: child.name,
      active: child.active,
      count: countOf.get(child.id) ?? 0,
      parentId: top.id,
      children: [],
    }));
    return {
      id: top.id,
      name: top.name,
      active: top.active,
      count:
        (countOf.get(top.id) ?? 0) +
        children.reduce((sum, child) => sum + child.count, 0),
      children,
    };
  });
}

/** 按名称搜索：大类命中时保留全部小类，否则只保留命中的小类 */
export function searchCategoryTree(tree: CategoryNode[], search: string) {
  const needle = search.trim().toLowerCase();
  if (!needle) return tree;
  const hit = (node: CategoryNode) => node.name.toLowerCase().includes(needle);
  return tree.flatMap((top) => {
    if (hit(top)) return [top];
    const children = top.children.filter((child) => hit(child));
    return children.length > 0 ? [{ ...top, children }] : [];
  });
}

/** 小类显示为「大类 / 小类」，找不到时返回 undefined */
export function categoryPath(categories: ProductCategory[], id?: string) {
  const category = categories.find((item) => item.id === id);
  if (!category) return undefined;
  const parent = categories.find((item) => item.id === category.parentId);
  return parent ? `${parent.name} / ${category.name}` : category.name;
}

/**
 * 产品编辑用的分类下拉：只能选小类；停用的小类（或所属大类停用）不能新选，
 * 产品当前所在的分类仍保留为可选，便于原样保存。
 */
export function categoryOptions(
  categories: ProductCategory[],
  currentId?: string,
) {
  return categoryTree(categories).map((top) => ({
    title: top.active ? top.name : `${top.name}（停用）`,
    value: top.id,
    selectable: false,
    children: top.children.map((child) => ({
      title: child.active ? child.name : `${child.name}（停用）`,
      value: child.id,
      disabled: (!child.active || !top.active) && child.id !== currentId,
    })),
  }));
}
