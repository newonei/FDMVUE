<script setup lang="ts">
import type { CategoryNode } from '../category-model';

import type { ProductCategory } from '#/api/fdmplatform/products';

import { computed, onBeforeUnmount, ref, watch } from 'vue';

import { IconifyIcon } from '@vben/icons';

import { Alert, Empty, Input, Spin } from 'ant-design-vue';

import { getProductCategories } from '#/api/fdmplatform/products';

import { errorText } from '../../data';
import {
  categoryPath,
  categoryTree,
  searchCategoryTree,
} from '../category-model';

/**
 * 产品分类侧栏：两级树（大类 / 小类）。value 为分类 id，undefined 表示全部，空字符串表示未分类；
 * 选大类即含其下全部小类。计数与右侧列表同一口径（搜索词、启用 / 可选状态），切换分类不影响计数。
 */
const props = withDefaults(
  defineProps<{
    active?: boolean;
    companyId: number;
    keyword?: string;
    /** 变化时重新统计（新建、导入、删除产品后） */
    refreshKey?: number;
    selectable?: boolean;
    value?: string;
  }>(),
  // 未传时不按状态筛选，避免 Vue 把缺省的布尔属性当成 false
  {
    active: undefined,
    keyword: undefined,
    refreshKey: 0,
    selectable: undefined,
    value: undefined,
  },
);
const emit = defineEmits<{
  /** label 为「大类 / 小类」，供列表标题显示 */
  'update:value': [value: string | undefined, label: string | undefined];
}>();
const categories = ref<ProductCategory[]>([]);
const tree = ref<CategoryNode[]>([]);
const uncategorized = ref(0);
const total = ref(0);
const loading = ref(false);
const loadError = ref('');
const search = ref('');
const expanded = ref(true);
/** 展开的大类；选中项所在的大类自动展开 */
const open = ref(new Set<string>());
let sequence = 0;

/** 没有产品的分类不列出，当前选中的除外，便于看到并取消 */
const visible = computed(() =>
  searchCategoryTree(tree.value, search.value).flatMap((top) => {
    const children = top.children.filter(
      (child) => child.count > 0 || child.id === props.value,
    );
    return top.count > 0 || top.id === props.value || children.length > 0
      ? [{ ...top, children }]
      : [];
  }),
);
const showChildren = computed(() => expanded.value || Boolean(search.value));
function isOpen(id: string) {
  return (
    Boolean(search.value) ||
    open.value.has(id) ||
    tree.value
      .find((top) => top.id === id)
      ?.children.some((child) => child.id === props.value) === true
  );
}
function toggle(id: string) {
  const next = new Set(open.value);
  if (isOpen(id)) next.delete(id);
  else next.add(id);
  open.value = next;
}

async function load() {
  const run = ++sequence;
  loading.value = true;
  loadError.value = '';
  try {
    const result = await getProductCategories({
      companyId: props.companyId,
      keyword: props.keyword?.trim() || undefined,
      active: props.active,
      selectable: props.selectable,
    });
    if (run !== sequence) return;
    categories.value = result.categories ?? [];
    tree.value = categoryTree(categories.value, result.items);
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
  if (value === props.value) return;
  let label: string | undefined;
  if (value === '') label = '未分类';
  else if (value !== undefined) label = categoryPath(categories.value, value);
  emit('update:value', value, label);
}
watch(
  () => [
    props.companyId,
    props.keyword?.trim(),
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
        <li role="treeitem" :aria-expanded="showChildren">
          <div class="tree-row root">
            <button
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
              :class="{ current: value === undefined }"
              @click="choose(undefined)"
            >
              <span class="name">全部类别</span><span class="count">{{ total }}</span>
            </button>
          </div>
          <ul v-show="showChildren" class="children" role="group">
            <li
              v-for="top in visible"
              :key="top.id"
              role="treeitem"
              :aria-expanded="isOpen(top.id)"
            >
              <div class="tree-row">
                <button
                  type="button"
                  class="caret"
                  :class="{ open: isOpen(top.id) }"
                  :aria-label="isOpen(top.id) ? '收起小类' : '展开小类'"
                  @click="toggle(top.id)"
                >
                  <IconifyIcon icon="lucide:chevron-right" />
                </button>
                <button
                  type="button"
                  class="node"
                  :class="{ current: value === top.id }"
                  :title="top.name"
                  @click="choose(top.id)"
                >
                  <span class="name">{{ top.name }}</span><span class="count">{{ top.count }}</span>
                </button>
              </div>
              <ul v-show="isOpen(top.id)" class="children leaf" role="group">
                <li
                  v-for="child in top.children"
                  :key="child.id"
                  role="treeitem"
                >
                  <button
                    type="button"
                    class="node"
                    :class="{ current: value === child.id }"
                    :title="child.name"
                    @click="choose(child.id)"
                  >
                    <span class="name">{{ child.name }}</span><span class="count">{{ child.count }}</span>
                  </button>
                </li>
              </ul>
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
      </ul>
      <Empty
        v-if="!loading && search && visible.length === 0"
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

.children.leaf {
  padding-left: 20px;
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
