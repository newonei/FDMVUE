<script lang="ts" setup>
import type { FdmCreativeApi } from '#/api/fdmcreative';

import { computed, ref } from 'vue';

import { IconifyIcon } from '@vben/icons';

import { Button, Empty, Progress, Tag, Tooltip } from 'ant-design-vue';

import { loopRunLabel } from '../loop-run';
import { nodeRunStatusLabel } from '../node-run-status';

interface Props {
  allowCancel?: boolean;
  execution?: FdmCreativeApi.ExecutionDetail;
  streamState?: 'closed' | 'connecting' | 'idle' | 'open' | 'reconnecting';
}

const props = withDefaults(defineProps<Props>(), {
  allowCancel: true,
  execution: undefined,
  streamState: 'idle',
});

const emit = defineEmits<{
  cancel: [];
}>();

const EXECUTION_STATUS_LABEL: Record<FdmCreativeApi.ExecutionStatus, string> = {
  CANCEL_REQUESTED: '取消中',
  CANCELED: '已取消',
  CREATED: '准备中',
  FAILED: '失败',
  PARTIAL_SUCCESS: '部分成功',
  RUNNING: '运行中',
  SUCCEEDED: '成功',
};

const expanded = ref(false);

const progress = computed(() => {
  const execution = props.execution;
  if (!execution?.totalNodeCount) return 0;
  const completed =
    (execution.succeededNodeCount ?? 0) + (execution.failedNodeCount ?? 0);
  return Math.round((completed / execution.totalNodeCount) * 100);
});

const canCancel = computed(
  () =>
    props.allowCancel &&
    ['CREATED', 'RUNNING'].includes(props.execution?.status ?? ''),
);

const visibleRuns = computed(() => {
  const runs = props.execution?.nodeRuns ?? [];
  return expanded.value ? runs : runs.slice(0, 3);
});
const streamLabel = computed(
  () =>
    ({
      closed: '轮询兜底',
      connecting: '连接中',
      idle: '已结束',
      open: '实时',
      reconnecting: '重连中',
    })[props.streamState],
);
</script>

<template>
  <section
    v-if="execution"
    class="execution-task-panel"
    :class="{ 'is-expanded': expanded }"
    data-testid="execution-task-panel"
  >
    <header class="task-panel__header">
      <button
        :aria-expanded="expanded"
        class="task-panel__toggle"
        type="button"
        @click="expanded = !expanded"
      >
        <span class="task-panel__title">
          <IconifyIcon icon="lucide:list-checks" />
          <strong>运行队列</strong>
          <span class="task-panel__stream" :class="`is-${streamState}`">
            <i></i>{{ streamLabel }}
          </span>
          <Tag>{{ EXECUTION_STATUS_LABEL[execution.status] }}</Tag>
        </span>
        <span class="task-panel__summary">
          {{ execution.succeededNodeCount ?? 0 }}/{{
            execution.totalNodeCount ?? 0
          }}
          · {{ progress }}%
          <IconifyIcon
            :icon="expanded ? 'lucide:chevron-down' : 'lucide:chevron-up'"
          />
        </span>
      </button>
      <Tooltip v-if="canCancel" title="取消当前运行">
        <Button
          v-access:code="['fdmcreative:execution:cancel']"
          danger
          size="small"
          type="text"
          @click="emit('cancel')"
        >
          <IconifyIcon icon="lucide:square" />
        </Button>
      </Tooltip>
    </header>

    <Progress
      class="task-panel__progress"
      :percent="progress"
      :show-info="false"
      size="small"
      :status="execution.status === 'FAILED' ? 'exception' : undefined"
    />

    <div v-if="visibleRuns.length" class="task-panel__runs">
      <article v-for="nodeRun in visibleRuns" :key="nodeRun.id">
        <span :title="loopRunLabel(nodeRun)">{{ loopRunLabel(nodeRun) }}</span>
        <Tag>{{ nodeRunStatusLabel(nodeRun.status) }}</Tag>
      </article>
    </div>
    <Empty
      v-else-if="expanded"
      description="任务正在准备中"
      :image-style="{ height: '36px' }"
    />
  </section>
</template>

<style scoped>
.execution-task-panel {
  position: absolute;
  right: 16px;
  bottom: 16px;
  z-index: 12;
  width: min(360px, calc(100% - 32px));
  padding: 10px 12px;
  color: hsl(var(--foreground));
  background: hsl(var(--card) / 96%);
  border: 1px solid hsl(var(--border) / 82%);
  border-radius: 12px;
  box-shadow: 0 12px 30px hsl(var(--foreground) / 10%);
  backdrop-filter: blur(14px);
  transition:
    width 160ms ease,
    box-shadow 160ms ease;
}

.execution-task-panel.is-expanded {
  width: min(440px, calc(100% - 32px));
  box-shadow: 0 18px 42px hsl(var(--foreground) / 15%);
}

.task-panel__header,
.task-panel__toggle,
.task-panel__title,
.task-panel__summary {
  display: flex;
  align-items: center;
}

.task-panel__header {
  gap: 6px;
}

.task-panel__toggle {
  flex: 1;
  justify-content: space-between;
  min-width: 0;
  padding: 0;
  color: inherit;
  cursor: pointer;
  background: transparent;
  border: 0;
}

.task-panel__title {
  gap: 7px;
  min-width: 0;
}

.task-panel__title > svg {
  flex: none;
  width: 15px;
  height: 15px;
  color: hsl(var(--primary));
}

.task-panel__title strong {
  font-size: 12px;
}

.task-panel__stream {
  display: inline-flex;
  gap: 4px;
  align-items: center;
  font-size: 9px;
  color: hsl(var(--muted-foreground));
}

.task-panel__stream i {
  width: 5px;
  height: 5px;
  background: hsl(var(--muted-foreground) / 52%);
  border-radius: 999px;
}

.task-panel__stream.is-open i {
  background: #16a34a;
  box-shadow: 0 0 0 3px color-mix(in srgb, #16a34a 14%, transparent);
}

.task-panel__stream.is-connecting i,
.task-panel__stream.is-reconnecting i {
  background: #f59e0b;
}

.task-panel__summary {
  flex: none;
  gap: 5px;
  font-size: 10px;
  color: hsl(var(--muted-foreground));
}

.task-panel__summary > svg {
  width: 13px;
  height: 13px;
}

.task-panel__progress {
  display: block;
  margin: 6px 0 0;
  line-height: 0;
}

.task-panel__runs {
  display: grid;
  gap: 4px;
  max-height: 0;
  overflow: hidden;
  opacity: 0;
  transition:
    max-height 180ms ease,
    margin 180ms ease,
    opacity 140ms ease;
}

.is-expanded .task-panel__runs {
  max-height: min(36vh, 360px);
  margin-top: 8px;
  overflow: auto;
  opacity: 1;
}

.task-panel__runs article {
  display: flex;
  gap: 8px;
  align-items: center;
  justify-content: space-between;
  min-height: 30px;
  padding: 4px 6px 4px 9px;
  background: hsl(var(--muted) / 42%);
  border: 1px solid hsl(var(--border) / 64%);
  border-radius: 8px;
}

.task-panel__runs article > span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 11px;
  white-space: nowrap;
}

@media (max-width: 900px) {
  .execution-task-panel {
    right: 10px;
    bottom: 10px;
    width: calc(100% - 20px);
  }
}
</style>
