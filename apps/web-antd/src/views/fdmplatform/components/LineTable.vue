<script setup lang="ts">
import type { LineColumn, LineTableSetting } from './line-table-model';

import { computed, ref, watch } from 'vue';

import { Settings } from '@vben/icons';
import { useUserStore } from '@vben/stores';

import { Table, Tooltip } from 'ant-design-vue';
import { getActivePinia } from 'pinia';

import {
  clampWidth,
  clearSetting,
  defaultSetting,
  loadSetting,
  saveSetting,
  storageKey,
  tableWidth,
  visibleColumns,
} from './line-table-model';
import LineColumnSettings from './LineColumnSettings.vue';

/**
 * 单据产品明细表（金智式）：固定列宽、超长省略、表头可拖宽、左右滚动，
 * 标题旁齿轮打开字段设置。设置按人按表存在本机浏览器。
 */
const props = withDefaults(
  defineProps<{
    columns: LineColumn[];
    dataSource: Record<string, any>[];
    pagination?: false | Record<string, unknown>;
    rowKey?: string;
    /** 存储设置用的表名，同一种单据共用 */
    table: string;
    title?: string;
  }>(),
  { pagination: false, rowKey: 'id', title: '产品明细' },
);

// 嵌在没有 Pinia 的场景（如单元测试）时按匿名用户存
const userInfo = getActivePinia() ? useUserStore().userInfo : null;
const key = computed(() =>
  storageKey(
    props.table,
    userInfo?.userId ?? (userInfo as null | { id?: unknown })?.id,
  ),
);
const setting = ref<LineTableSetting>(defaultSetting(props.columns));
const settingsOpen = ref(false);
watch(
  [key, () => props.columns],
  () => (setting.value = loadSetting(props.columns, key.value)),
  { immediate: true },
);
const shown = computed(() => visibleColumns(props.columns, setting.value));
const scrollX = computed(() => tableWidth(shown.value));
function save(value: LineTableSetting) {
  setting.value = value;
  if (JSON.stringify(value) === JSON.stringify(defaultSetting(props.columns)))
    clearSetting(key.value);
  else saveSetting(key.value, value);
}
function resize(width: number, column: { key?: unknown }) {
  const name = String(column.key);
  save({
    ...setting.value,
    widths: { ...setting.value.widths, [name]: clampWidth(width) },
  });
}
</script>
<template>
  <div class="line-table">
    <header>
      <h3>
        {{ title }}
        <span class="muted">{{ dataSource.length }} 项</span>
        <Tooltip title="字段设置">
          <button
            type="button"
            class="gear"
            aria-label="字段设置"
            @click="settingsOpen = true"
          >
            <Settings class="size-4" />
          </button>
        </Tooltip>
      </h3>
      <slot name="extra"></slot>
    </header>
    <Table
      :data-source="dataSource"
      :row-key="rowKey"
      :columns="shown"
      :pagination="pagination"
      :scroll="{ x: scrollX }"
      table-layout="fixed"
      size="small"
      bordered
      @resize-column="resize"
    >
      <template #emptyText>
        <slot name="emptyText">没有产品明细</slot>
      </template>
      <template #bodyCell="slotProps">
        <slot name="bodyCell" v-bind="slotProps"></slot>
      </template>
    </Table>
    <slot name="footer"></slot>
    <LineColumnSettings
      v-model:open="settingsOpen"
      :columns="columns"
      :setting="setting"
      :title="title"
      @save="save"
    />
  </div>
</template>
<style scoped>
.line-table header {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 12px;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.line-table h3 {
  display: flex;
  gap: 8px;
  align-items: center;
  margin: 0;
  font-size: 14px;
  font-weight: 600;
}

/* 链接等 inline-block 内容也按单元格宽度省略 */
.line-table :deep(.ant-table-cell-ellipsis > *),
.line-table :deep(.ant-table-cell-ellipsis > .ant-table-cell-content > *) {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  vertical-align: bottom;
  white-space: nowrap;
}

.muted {
  font-size: 12px;
  font-weight: normal;
  color: hsl(var(--muted-foreground));
}

.gear {
  display: inline-flex;
  padding: 2px;
  color: hsl(var(--muted-foreground));
  cursor: pointer;
  background: none;
  border: 0;
  border-radius: 4px;
}

.gear:hover {
  color: hsl(var(--primary));
  background: hsl(var(--accent));
}
</style>
