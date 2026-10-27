<script setup lang="ts">
import type { CategoryNode } from '../category-model';

import type { ProductCategory } from '#/api/fdmplatform/products';

import { computed, onBeforeUnmount, ref, watch } from 'vue';

import { IconifyIcon } from '@vben/icons';

import { Alert, Empty, Input, Spin } from 'ant-design-vue';

import { getProductCategories } from '#/api/fdmplatform/products';

import { errorText } from '../../data';
import {
  categoryList,
  categoryName,
  searchCategories,
} from '../category-model';

/**
 * 产品分类侧栏：value 为分类 id，undefined 表示全部，空字符串表示未分类。
 * 计数与右侧列表同一口径（搜索词、启用 / 可选状态），切换分类不影响计数。
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
let sequence = 0;

/** 没有产品的分类不列出，当前选中的除外，便于看到并取消 */
const visible = computed(() =>
  searchCategories(list.value, search.value).filter(
    (item) => item.count > 0 || item.id === props.value,
  ),
);
const showChildren = computed(() => expanded.value || Boolean(search.value));

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
  if (value === props.value) return;
  let label: string | undefined;
  if (value === '') label = '未分类';
  else if (value !== undefined) label = categoryName(categories.value, value);
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
