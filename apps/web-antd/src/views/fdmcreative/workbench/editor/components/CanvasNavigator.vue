<script lang="ts">
export type CanvasNavigatorStatusFilter =
  | 'all'
  | 'completed'
  | 'failed'
  | 'running';

export interface CanvasNavigatorNode {
  color?: string;
  icon?: string;
  id: string;
  label?: string;
  name?: string;
  status?: string;
  type: string;
}
</script>

<script lang="ts" setup>
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from 'vue';

import { IconifyIcon } from '@vben/icons';

import { Button, Empty, Input, Segmented, Tooltip } from 'ant-design-vue';

import { nodeRunStatusLabel } from '../node-run-status';

interface Props {
  activeNodeId?: string;
  modelValue?: boolean;
  nodes: CanvasNavigatorNode[];
}

defineOptions({ name: 'FdmCreativeCanvasNavigator' });

const props = withDefaults(defineProps<Props>(), {
  activeNodeId: '',
  modelValue: true,
});

const emit = defineEmits<{
  locate: [nodeId: string];
  'update:modelValue': [open: boolean];
}>();

const RUNNING_STATUSES = new Set([
  'ARCHIVING_AI',
  'BLOCKED',
  'CANCEL_REQUESTED',
  'PENDING',
  'QUEUED',
  'RUNNING',
  'WAITING_AI',
]);
const FAILED_STATUSES = new Set(['FAILED', 'STALE']);
const COMPLETED_STATUSES = new Set([
  'CANCELED',
  'PARTIAL_SUCCESS',
  'SKIPPED',
  'SUCCEEDED',
]);

const FILTER_OPTIONS: Array<{
  label: string;
  value: CanvasNavigatorStatusFilter;
}> = [
  { label: '全部', value: 'all' },
  { label: '运行中', value: 'running' },
  { label: '失败', value: 'failed' },
  { label: '完成', value: 'completed' },
];

const searchInputRef = ref<{ focus?: () => void }>();
const keyword = ref('');
const statusFilter = ref<CanvasNavigatorStatusFilter>('all');

function normalizedStatus(status?: string) {
  return status?.trim().toUpperCase() ?? '';
}

function statusGroup(
  status?: string,
): Exclude<CanvasNavigatorStatusFilter, 'all'> | null {
  const value = normalizedStatus(status);
  if (RUNNING_STATUSES.has(value)) return 'running';
  if (FAILED_STATUSES.has(value)) return 'failed';
  if (COMPLETED_STATUSES.has(value)) return 'completed';
  return null;
}

function nodeTitle(node: CanvasNavigatorNode) {
  return node.name?.trim() || node.label?.trim() || node.type || '未命名节点';
}

function nodeStyle(node: CanvasNavigatorNode) {
  return {
    '--navigator-node-color': node.color || '#64748b',
  };
}

function close() {
  emit('update:modelValue', false);
}

function locate(nodeId: string) {
  emit('locate', nodeId);
}

function handleDocumentKeydown(event: KeyboardEvent) {
  if (!props.modelValue || event.key !== 'Escape') return;
  event.stopPropagation();
  close();
}

const filteredNodes = computed(() => {
  const query = keyword.value.trim().toLocaleLowerCase();
  return props.nodes.filter((node) => {
    const matchesStatus =
      statusFilter.value === 'all' ||
      statusGroup(node.status) === statusFilter.value;
    if (!matchesStatus) return false;
    if (!query) return true;
    return [node.name, node.label, node.type].some((value) =>
      value?.toLocaleLowerCase().includes(query),
    );
  });
});

const resultSummary = computed(() => {
  if (filteredNodes.value.length === props.nodes.length) {
    return `${props.nodes.length} 个节点`;
  }
  return `${filteredNodes.value.length} / ${props.nodes.length}`;
});

watch(
  () => props.modelValue,
  async (open) => {
    if (!open) return;
    await nextTick();
    searchInputRef.value?.focus?.();
  },
);

onMounted(() => document.addEventListener('keydown', handleDocumentKeydown));
onBeforeUnmount(() =>
  document.removeEventListener('keydown', handleDocumentKeydown),
);
</script>

<template>
  <section
    v-if="modelValue"
    aria-label="画布节点导航"
    class="canvas-navigator"
    role="dialog"
  >
    <header class="navigator-header">
      <span class="navigator-title">
        <IconifyIcon icon="lucide:list-tree" />
        <strong>节点导航</strong>
        <span>{{ resultSummary }}</span>
      </span>
      <Tooltip title="关闭（Esc）">
        <Button
          aria-label="关闭节点导航"
          class="close-button"
          size="small"
          type="text"
          @click="close"
        >
          <IconifyIcon icon="lucide:x" />
        </Button>
      </Tooltip>
    </header>

    <div class="navigator-controls">
      <Input
        ref="searchInputRef"
        v-model:value="keyword"
        allow-clear
        placeholder="搜索名称或类型"
        size="small"
      >
        <template #prefix>
          <IconifyIcon icon="lucide:search" />
        </template>
      </Input>
      <Segmented
        v-model:value="statusFilter"
        :options="FILTER_OPTIONS"
        size="small"
      />
    </div>

    <div class="navigator-results" aria-live="polite">
      <button
        v-for="node in filteredNodes"
        :key="node.id"
        :aria-current="node.id === activeNodeId ? 'true' : undefined"
        class="navigator-node"
        :class="{
          'is-active': node.id === activeNodeId,
          [`is-${statusGroup(node.status) || 'idle'}`]: true,
        }"
        :style="nodeStyle(node)"
        :title="`定位到 ${nodeTitle(node)}`"
        type="button"
        @click="locate(node.id)"
      >
        <span class="node-icon">
          <IconifyIcon :icon="node.icon || 'lucide:box'" />
        </span>
        <span class="node-copy">
          <strong>{{ nodeTitle(node) }}</strong>
          <span>{{ node.type }}</span>
        </span>
        <span class="node-status">
          <i></i>
          {{ nodeRunStatusLabel(node.status) }}
        </span>
        <IconifyIcon class="locate-icon" icon="lucide:locate-fixed" />
      </button>

      <Empty
        v-if="filteredNodes.length === 0"
        class="navigator-empty"
        :description="nodes.length ? '没有匹配的节点' : '画布中暂无节点'"
        :image-style="{ height: '38px' }"
      />
    </div>
  </section>
</template>

<style scoped>
.canvas-navigator {
  position: absolute;
  top: 14px;
  right: 14px;
  z-index: 11;
  display: flex;
  flex-direction: column;
  width: min(300px, calc(100% - 28px));
  height: min(360px, calc(100% - 28px));
  min-height: 220px;
  overflow: hidden;
  color: hsl(var(--foreground));
  background: hsl(var(--card) / 96%);
  border: 1px solid hsl(var(--border) / 82%);
  border-radius: 12px;
  box-shadow: 0 14px 36px hsl(var(--foreground) / 13%);
  backdrop-filter: blur(14px);
}

.navigator-header,
.navigator-title,
.navigator-node,
.node-status {
  display: flex;
  align-items: center;
}

.navigator-header {
  flex: none;
  justify-content: space-between;
  min-height: 42px;
  padding: 0 8px 0 12px;
  border-bottom: 1px solid hsl(var(--border) / 72%);
}

.navigator-title {
  gap: 7px;
  min-width: 0;
}

.navigator-title > svg {
  width: 15px;
  height: 15px;
  color: hsl(var(--primary));
}

.navigator-title strong {
  font-size: 12px;
  font-weight: 650;
}

.navigator-title span {
  font-size: 10px;
  color: hsl(var(--muted-foreground));
}

.close-button :deep(svg) {
  width: 15px;
  height: 15px;
}

.navigator-controls {
  display: grid;
  flex: none;
  gap: 7px;
  padding: 9px 10px 8px;
  border-bottom: 1px solid hsl(var(--border) / 62%);
}

.navigator-controls :deep(.ant-input-affix-wrapper) {
  background: hsl(var(--background) / 72%);
}

.navigator-controls :deep(.ant-input-prefix svg) {
  width: 13px;
  height: 13px;
  color: hsl(var(--muted-foreground));
}

.navigator-controls :deep(.ant-segmented) {
  width: 100%;
  background: hsl(var(--muted) / 62%);
}

.navigator-controls :deep(.ant-segmented-group) {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.navigator-controls :deep(.ant-segmented-item-label) {
  min-width: 0;
  padding-inline: 4px;
  font-size: 10px;
}

.navigator-results {
  display: grid;
  flex: 1;
  grid-auto-rows: min-content;
  gap: 4px;
  min-height: 0;
  padding: 6px;
  overflow: auto;
  overscroll-behavior: contain;
  scrollbar-width: thin;
}

.navigator-node {
  position: relative;
  gap: 8px;
  width: 100%;
  min-height: 44px;
  padding: 5px 7px;
  color: inherit;
  text-align: left;
  cursor: pointer;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 8px;
  transition:
    background 120ms ease,
    border-color 120ms ease,
    transform 120ms ease;
}

.navigator-node:hover,
.navigator-node:focus-visible {
  outline: none;
  background: hsl(var(--muted) / 56%);
  border-color: hsl(var(--border));
}

.navigator-node:active {
  transform: scale(0.99);
}

.navigator-node.is-active {
  background: color-mix(
    in srgb,
    var(--navigator-node-color) 9%,
    hsl(var(--card))
  );
  border-color: color-mix(
    in srgb,
    var(--navigator-node-color) 42%,
    hsl(var(--border))
  );
}

.node-icon {
  display: grid;
  flex: none;
  place-items: center;
  width: 28px;
  height: 28px;
  color: var(--navigator-node-color);
  background: color-mix(
    in srgb,
    var(--navigator-node-color) 11%,
    hsl(var(--card))
  );
  border-radius: 7px;
}

.node-icon :deep(svg) {
  width: 14px;
  height: 14px;
}

.node-copy {
  display: grid;
  flex: 1;
  min-width: 0;
}

.node-copy strong,
.node-copy span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.node-copy strong {
  font-size: 11px;
  font-weight: 600;
  line-height: 16px;
}

.node-copy span {
  font-size: 9px;
  line-height: 13px;
  color: hsl(var(--muted-foreground));
}

.node-status {
  flex: none;
  gap: 4px;
  max-width: 62px;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 9px;
  color: hsl(var(--muted-foreground));
  white-space: nowrap;
}

.node-status i {
  flex: none;
  width: 5px;
  height: 5px;
  background: hsl(var(--muted-foreground) / 52%);
  border-radius: 999px;
}

.is-running .node-status {
  color: #1677ff;
}

.is-running .node-status i {
  background: #1677ff;
  box-shadow: 0 0 0 3px color-mix(in srgb, #1677ff 12%, transparent);
}

.is-failed .node-status {
  color: #dc2626;
}

.is-failed .node-status i {
  background: #ef4444;
}

.is-completed .node-status {
  color: #16a34a;
}

.is-completed .node-status i {
  background: #16a34a;
}

.locate-icon {
  display: none;
  flex: none;
  width: 13px;
  height: 13px;
  color: hsl(var(--primary));
}

.navigator-node:hover .node-status,
.navigator-node:focus-visible .node-status {
  display: none;
}

.navigator-node:hover .locate-icon,
.navigator-node:focus-visible .locate-icon {
  display: block;
}

.navigator-empty {
  padding: 18px 0;
  margin: auto;
}

.navigator-empty :deep(.ant-empty-description) {
  font-size: 11px;
  color: hsl(var(--muted-foreground));
}

@media (max-width: 640px) {
  .canvas-navigator {
    top: 8px;
    right: 8px;
    width: min(300px, calc(100% - 16px));
    height: min(340px, calc(100% - 16px));
  }
}

@media (prefers-reduced-motion: reduce) {
  .navigator-node {
    transition: none;
  }
}
</style>
