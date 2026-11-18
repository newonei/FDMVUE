<script setup lang="ts">
import type { CategoryNode } from '../category-model';

import type {
  ProductCategory,
  ProductCategoryView,
  ProductQuery,
} from '#/api/fdmplatform/products';

import { computed, onBeforeUnmount, ref, watch } from 'vue';

import { IconifyIcon } from '@vben/icons';

import { Alert, Empty, Input, Spin } from 'ant-design-vue';

import { getProductCategories } from '#/api/fdmplatform/products';

import { errorText } from '../../data';
import {
  categoryList,
  categoryName,
  productCategoryGroups,
  searchCategories,
} from '../category-model';

/**
 * 产品分类侧栏：value 为分类 id，undefined 表示全部，空字符串表示未分类。
 * 计数与右侧列表同一口径，切换分类不影响计数。
 */
type GroupFilter = NonNullable<ProductQuery['categoryGroup']>;
const props = withDefaults(
  defineProps<{
    active?: boolean;
    categoryGroup?: GroupFilter;
    companyId: number;
    filters?: {
      color?: string;
      material?: string;
      productStage?: string;
      shape?: string;
      size?: string;
    };
    grouped?: boolean;
    keyword?: string;
    /** 工厂等场景可使用各自权限范围内的分类查询。 */
    loadCategories?: (filters: {
      color?: string;
      keyword?: string;
      material?: string;
      productStage?: string;
      shape?: string;
      size?: string;
    }) => Promise<ProductCategoryView>;
    /** 变化时重新统计（新建、导入、删除产品后） */
    refreshKey?: number;
    selectable?: boolean;
    value?: string;
  }>(),
  // 未传时不按状态筛选，避免 Vue 把缺省的布尔属性当成 false
  {
    active: undefined,
    categoryGroup: undefined,
    filters: undefined,
    keyword: undefined,
    loadCategories: undefined,
    refreshKey: 0,
    selectable: undefined,
    value: undefined,
  },
);
const emit = defineEmits<{
  selectGroup: [value: GroupFilter];
  /** label 为分类名称，供列表标题显示 */
  'update:value': [value: string | undefined, label: string | undefined];
}>();
const categories = ref<ProductCategory[]>([]);
const list = ref<CategoryNode[]>([]);
const uncategorized = ref(0);
const total = ref(0);
const loading = ref(false);
const loadError = ref('');
const search = ref('');
const expanded = ref(true);
const expandedGroups = ref(new Set<GroupFilter>());
let sequence = 0;

/** 没有产品的分类不列出，当前选中的除外，便于看到并取消 */
const visible = computed(() =>
  searchCategories(list.value, search.value).filter(
    (item) => item.count > 0 || item.id === props.value,
  ),
);
const showChildren = computed(() => expanded.value || Boolean(search.value));
const groupByCategory = computed(
  () =>
    new Map(
      categories.value.map(({ categoryGroup, id }) => [id, categoryGroup]),
    ),
);
const groupedTree = computed(() => {
  if (!props.grouped) return [];
  const groups = productCategoryGroups.map(({ label, value }) => {
    const children = list.value.filter(
      (item) => groupByCategory.value.get(item.id) === value,
    );
    return {
      label,
      value,
      children,
      count: children.reduce((sum, item) => sum + item.count, 0),
    };
  });
  const unassigned = list.value.filter(
    (item) => !groupByCategory.value.get(item.id),
  );
  if (uncategorized.value > 0 || props.value === '') {
    unassigned.push({
      id: '',
      name: '未分类',
      active: true,
      count: uncategorized.value,
    });
  }
  const unassignedCount =
    total.value - groups.reduce((sum, group) => sum + group.count, 0);
  const roots = [
    ...groups,
    {
      label: '待归类',
      value: 'UNASSIGNED' as const,
      children: unassigned,
      count: unassignedCount,
    },
  ];
  const needle = search.value.trim().toLowerCase();
  return roots.flatMap((group) => {
    const groupMatches = group.label.toLowerCase().includes(needle);
    const available = group.children.filter(
      (item) => item.active || item.count > 0 || item.id === props.value,
    );
    const children = groupMatches
      ? available
      : searchCategories(available, needle);
    if (!groupMatches && children.length === 0) return [];
    if (
      group.value === 'UNASSIGNED' &&
      group.count === 0 &&
      children.length === 0 &&
      props.categoryGroup !== group.value
    )
      return [];
    return [{ ...group, children }];
  });
});

function groupIsExpanded(group: GroupFilter) {
  return expandedGroups.value.has(group) || Boolean(search.value.trim());
}
function toggleGroup(group: GroupFilter) {
  if (expandedGroups.value.has(group)) expandedGroups.value.delete(group);
  else expandedGroups.value.add(group);
}
function chooseGroup(group: GroupFilter) {
  expandedGroups.value.add(group);
  if (group === props.categoryGroup && props.value === undefined) return;
  emit('selectGroup', group);
}
watch(
  () => {
    if (!props.grouped) return undefined;
    if (props.value === undefined) return props.categoryGroup;
    return groupByCategory.value.get(props.value) ?? 'UNASSIGNED';
  },
  (group) => {
    if (group) expandedGroups.value.add(group);
  },
  { immediate: true },
);

async function load() {
  const run = ++sequence;
  loading.value = true;
  loadError.value = '';
  try {
    const keyword = props.keyword?.trim() || undefined;
    const result = props.loadCategories
      ? await props.loadCategories({ ...props.filters, keyword })
      : await getProductCategories({
          companyId: props.companyId,
          keyword,
          ...(props.filters?.productStage
            ? { productStage: props.filters.productStage }
            : {}),
          active: props.active,
          selectable: props.selectable,
        });
    if (run !== sequence) return;
    categories.value = result.categories ?? [];
    list.value = categoryList(categories.value, result.items);
    uncategorized.value =
      result.items.find((item) => !item.categoryId)?.count ?? 0;
    total.value = result.total;
  } catch (error) {
    if (run === sequence) loadError.value = errorText(error);
  } finally {
    if (run === sequence) loading.value = false;
  }
}
function choose(value: string | undefined) {
  if (value === props.value && props.categoryGroup === undefined) return;
  let label: string | undefined;
  if (value === '') label = '未分类';
  else if (value !== undefined) label = categoryName(categories.value, value);
  emit('update:value', value, label);
}
watch(
  () => [
    props.companyId,
    props.keyword?.trim(),
    props.filters?.material,
    props.filters?.size,
    props.filters?.color,
    props.filters?.shape,
    props.filters?.productStage,
    props.loadCategories,
    props.active,
    props.selectable,
    props.refreshKey,
  ],
  () => void load(),
  { immediate: true },
);
onBeforeUnmount(() => {
  ++sequence;
});
</script>

<template>
  <nav class="category-panel" aria-label="产品分类">
    <Input
      v-model:value="search"
      placeholder="输入关键字搜索分类"
      aria-label="搜索分类"
      allow-clear
    >
      <template #suffix>
        <IconifyIcon icon="lucide:search" class="muted" />
      </template>
    </Input>
    <Alert v-if="loadError" type="error" show-icon :message="loadError" />
    <Spin :spinning="loading" wrapper-class-name="category-spin">
      <ul class="category-list" role="tree">
        <li role="treeitem" :aria-expanded="grouped ? undefined : showChildren">
          <div class="tree-row root">
            <button
              v-if="!grouped"
              type="button"
              class="caret"
              :class="{ open: showChildren }"
              :aria-label="showChildren ? '收起分类' : '展开分类'"
              @click="expanded = !expanded"
            >
              <IconifyIcon icon="lucide:chevron-right" />
            </button>
            <button
              type="button"
              class="node"
              :class="{
                current: value === undefined && categoryGroup === undefined,
              }"
              @click="choose(undefined)"
            >
              <span class="name">全部类别</span><span class="count">{{ total }}</span>
            </button>
          </div>
          <ul
            v-if="!grouped"
            v-show="showChildren"
            class="children"
            role="group"
          >
            <li v-for="item in visible" :key="item.id" role="treeitem">
              <button
                type="button"
                class="node"
                :class="{ current: value === item.id }"
                :title="item.name"
                @click="choose(item.id)"
              >
                <span class="name">{{ item.name }}</span><span class="count">{{ item.count }}</span>
              </button>
            </li>
            <li
              v-if="(uncategorized || value === '') && !search"
              role="treeitem"
            >
              <button
                type="button"
                class="node"
                :class="{ current: value === '' }"
                @click="choose('')"
              >
                <span class="name">未分类</span><span class="count">{{ uncategorized }}</span>
              </button>
            </li>
          </ul>
        </li>
        <li
          v-for="group in groupedTree"
          :key="group.value"
          :class="{ 'unassigned-group': group.value === 'UNASSIGNED' }"
          role="treeitem"
          :aria-expanded="
            group.children.length > 0 ? groupIsExpanded(group.value) : undefined
          "
        >
          <div class="tree-row">
            <button
              v-if="group.children.length > 0"
              type="button"
              class="caret"
              :class="{ open: groupIsExpanded(group.value) }"
              :aria-label="`${groupIsExpanded(group.value) ? '收起' : '展开'}${group.label}`"
              @click="toggleGroup(group.value)"
            >
              <IconifyIcon icon="lucide:chevron-right" />
            </button>
            <span v-else class="caret-spacer" aria-hidden="true"></span>
            <button
              type="button"
              class="node group-node"
              :class="{
                current: value === undefined && categoryGroup === group.value,
              }"
              @click="chooseGroup(group.value)"
            >
              <span class="name">{{ group.label }}</span><span class="count">{{ group.count }}</span>
            </button>
          </div>
          <ul
            v-if="groupIsExpanded(group.value) && group.children.length > 0"
            class="children"
            role="group"
          >
            <li v-for="item in group.children" :key="item.id" role="treeitem">
              <button
                type="button"
                class="node"
                :class="{ current: value === item.id }"
                :title="item.name"
                @click="choose(item.id)"
              >
                <span class="name">{{ item.name }}</span><span class="count">{{ item.count }}</span>
              </button>
            </li>
          </ul>
        </li>
      </ul>
      <Empty
        v-if="
          !loading &&
          search &&
          (grouped ? groupedTree.length === 0 : visible.length === 0)
        "
        :image="Empty.PRESENTED_IMAGE_SIMPLE"
        description="没有匹配的分类"
      />
    </Spin>
  </nav>
</template>

<style scoped>
.category-panel {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
  height: 100%;
  min-height: 0;
}

.category-spin {
  flex: 1;
  min-height: 0;
}

.category-spin :deep(.ant-spin-container) {
  height: 100%;
}

.category-list {
  height: 100%;
  max-height: var(--category-list-max-height, none);
  padding: 0;
  margin: 0;
  overflow-y: auto;
  list-style: none;
}

.children {
  padding: 0 0 0 22px;
  margin: 0;
  list-style: none;
}

.tree-row {
  display: flex;
  align-items: center;
}

.caret {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 28px;
  padding: 0;
  font-size: 14px;
  color: hsl(var(--muted-foreground));
  cursor: pointer;
  background: transparent;
  border: 0;
}

.caret :deep(svg) {
  transition: transform 0.15s;
}

.caret.open :deep(svg) {
  transform: rotate(90deg);
}

.caret-spacer {
  flex: 0 0 20px;
}

.node {
  display: block;
  flex: 1;
  width: 100%;
  min-width: 0;
  padding: 5px 8px;
  font-size: 13px;
  line-height: 20px;
  color: inherit;
  text-align: left;
  word-break: break-all;
  cursor: pointer;
  background: transparent;
  border: 0;
  border-radius: 4px;
}

.node:hover {
  background: hsl(var(--accent));
}

.node:focus-visible,
.caret:focus-visible {
  outline: 2px solid hsl(var(--primary));
  outline-offset: -2px;
}

.node.current {
  color: hsl(var(--primary));
  background: hsl(var(--primary) / 10%);
}

.group-node {
  font-weight: 600;
}

.unassigned-group {
  padding-top: 5px;
  margin-top: 5px;
  border-top: 1px solid hsl(var(--border));
}

.unassigned-group .group-node:not(.current) {
  color: hsl(var(--muted-foreground));
}

.count {
  font-variant-numeric: tabular-nums;
}

.count::before {
  content: '（';
}

.count::after {
  content: '）';
}

.muted {
  color: hsl(var(--muted-foreground));
}
</style>
