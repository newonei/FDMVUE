<script lang="ts" setup>
import type { FdmCreativeApi } from '#/api/fdmcreative';
import { computed, ref } from 'vue';
import { IconifyIcon } from '@vben/icons';
import { Alert, Button, Empty, Progress, Select, Tag } from 'ant-design-vue';
import {
  canRetryNode,
  EXECUTION_STATUS_LABEL,
  taskProgress,
} from '../execution-feedback';
import { canvasNodeIdForRun, parseLoopRunNodeId } from '../loop-run';
import { nodeRunStatusLabel } from '../node-run-status';

const props = withDefaults(
  defineProps<{
    allowCancel?: boolean;
    allowRetry?: boolean;
    busy?: boolean;
    currentExecutionId?: number;
    execution?: FdmCreativeApi.ExecutionDetail;
    history?: FdmCreativeApi.Execution[];
    historyError?: string;
    historyHasMore?: boolean;
    historyLoading?: boolean;
    nodeNames?: Record<string, string>;
    streamState?: 'closed' | 'connecting' | 'idle' | 'open' | 'reconnecting';
    syncError?: string;
    variant?: 'floating' | 'panel';
  }>(),
  {
    allowCancel: false,
    allowRetry: false,
    busy: false,
    history: () => [],
    historyError: '',
    historyHasMore: false,
    historyLoading: false,
    nodeNames: () => ({}),
    streamState: 'idle',
    syncError: '',
    variant: 'floating',
  },
);

const emit = defineEmits<{
  cancel: [];
  loadMore: [];
  locate: [nodeId: string];
  refresh: [];
  retry: [run: FdmCreativeApi.NodeRun];
  selectExecution: [id: number];
}>();
const expanded = ref(false);
const onlyFailed = ref(false);
const isExpanded = computed(() => props.variant === 'panel' || expanded.value);
const progress = computed(() =>
  props.execution
    ? taskProgress(props.execution)
    : { completed: 0, percent: 0, total: 0 },
);
const canCancel = computed(
  () =>
    props.allowCancel &&
    ['CREATED', 'RUNNING'].includes(props.execution?.status ?? ''),
);
const visibleRuns = computed(() =>
  (props.execution?.nodeRuns ?? []).filter(
    (run) => !onlyFailed.value || run.status === 'FAILED',
  ),
);
const historyOptions = computed(() => {
  const values = new Map(props.history.map((item) => [item.id, item]));
  if (props.execution) values.set(props.execution.id, props.execution);
  return [...values.values()].map((item) => ({
    value: item.id,
    label: `#${item.id} · ${EXECUTION_STATUS_LABEL[item.status]}${item.startedTime ? ` · ${item.startedTime}` : ''}`,
  }));
});
const streamLabel = computed(
  () =>
    ({
      closed: '自动更新',
      connecting: '连接中',
      idle: '已结束',
      open: '实时更新',
      reconnecting: '重新连接中',
    })[props.streamState],
);
function runName(run: FdmCreativeApi.NodeRun) {
  const parsed = parseLoopRunNodeId(run.nodeId);
  const name = props.nodeNames[parsed.baseNodeId] || parsed.baseNodeId;
  return parsed.iteration ? `${name} · 第 ${parsed.iteration} 轮` : name;
}
</script>

<template>
  <section
    v-if="execution || variant === 'panel'"
    class="execution-task-panel"
    :class="{ 'is-expanded': isExpanded, 'is-panel': variant === 'panel' }"
    data-testid="execution-task-panel"
  >
    <header class="task-panel__header">
      <button
        v-if="variant === 'floating'"
        class="task-panel__toggle"
        type="button"
        :aria-expanded="isExpanded"
        @click="expanded = !expanded"
      >
        <IconifyIcon icon="lucide:list-checks" /> 运行任务
        <IconifyIcon
          :icon="isExpanded ? 'lucide:chevron-down' : 'lucide:chevron-up'"
        />
      </button>
      <strong v-else>运行任务</strong>
      <Button
        v-if="variant === 'panel'"
        :loading="historyLoading"
        size="small"
        @click="emit('refresh')"
        >刷新</Button
      >
    </header>
    <template v-if="isExpanded && variant === 'panel'">
      <label class="task-label" for="execution-history">当前查看的任务</label>
      <Select
        id="execution-history"
        aria-label="当前查看的任务"
        :value="execution?.id"
        :options="historyOptions"
        :loading="historyLoading"
        :disabled="busy"
        placeholder="选择历史任务"
        @change="emit('selectExecution', Number($event))"
      />
      <Button
        v-if="historyHasMore"
        class="history-more"
        size="small"
        :loading="historyLoading"
        @click="emit('loadMore')"
        >加载更早的任务</Button
      >
      <Alert
        v-if="historyError"
        :message="historyError"
        type="warning"
        show-icon
      />
      <Alert v-if="syncError" :message="syncError" type="warning" show-icon />
      <p
        v-if="execution && currentExecutionId !== execution.id"
        class="task-hint"
      >
        正在查看历史任务。定位节点不会覆盖当前参数；重试使用任务原始参数。
      </p>
    </template>
    <template v-if="execution">
      <div class="task-panel__summary">
        <Tag>{{ EXECUTION_STATUS_LABEL[execution.status] }}</Tag>
        <span>已结束 {{ progress.completed }}/{{ progress.total }} 个节点</span>
        <span v-if="currentExecutionId === execution.id" class="task-stream">{{
          streamLabel
        }}</span>
      </div>
      <Progress
        :percent="progress.percent"
        :show-info="false"
        size="small"
        :status="
          ['FAILED', 'PARTIAL_SUCCESS'].includes(execution.status)
            ? 'exception'
            : undefined
        "
        aria-label="任务处理进度"
      />
      <div v-if="isExpanded" class="task-panel__actions">
        <Button
          size="small"
          :type="onlyFailed ? 'primary' : 'default'"
          :aria-pressed="onlyFailed"
          @click="onlyFailed = !onlyFailed"
          >{{ onlyFailed ? '只看失败' : '全部节点' }}</Button
        >
        <Button
          v-if="canCancel"
          :disabled="busy"
          danger
          size="small"
          @click="emit('cancel')"
          >取消此任务</Button
        >
      </div>
      <div v-if="isExpanded && visibleRuns.length" class="task-panel__runs">
        <article
          v-for="run in visibleRuns"
          :key="run.id"
          :class="{ 'is-failed': run.status === 'FAILED' }"
        >
          <div class="task-run__heading">
            <button
              type="button"
              class="task-run__locate"
              :aria-label="`定位节点：${runName(run)}`"
              @click="emit('locate', canvasNodeIdForRun(run.nodeId))"
            >
              <IconifyIcon icon="lucide:locate-fixed" /><span>{{
                runName(run)
              }}</span>
            </button>
            <Tag>{{ nodeRunStatusLabel(run.status) }}</Tag>
          </div>
          <p v-if="run.errorMessage" class="task-run__error">
            {{ run.errorMessage }}
          </p>
          <div
            v-if="allowRetry && canRetryNode(execution, run)"
            class="task-run__recovery"
          >
            <Button size="small" :disabled="busy" @click="emit('retry', run)"
              >按原参数重试</Button
            >
            <Button
              size="small"
              type="text"
              @click="emit('locate', canvasNodeIdForRun(run.nodeId))"
              >查看当前节点</Button
            >
          </div>
        </article>
      </div>
      <Empty
        v-else-if="isExpanded"
        :description="onlyFailed ? '没有失败节点' : '任务正在准备中'"
        :image-style="{ height: '44px' }"
      />
    </template>
    <Empty
      v-else
      :description="
        currentExecutionId
          ? `正在读取任务 #${currentExecutionId}`
          : '还没有运行任务'
      "
      :image-style="{ height: '64px' }"
    />
  </section>
</template>

<style scoped>
.execution-task-panel {
  position: absolute;
  right: 16px;
  bottom: 16px;
  z-index: 12;
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: min(400px, calc(100% - 32px));
  padding: 14px;
  color: hsl(var(--foreground));
  background: hsl(var(--card));
  border: 1px solid hsl(var(--border));
  border-radius: 10px;
  box-shadow: 0 8px 24px hsl(var(--foreground) / 8%);
}
.execution-task-panel.is-panel {
  position: static;
  width: 100%;
  height: 100%;
  min-height: 0;
  overflow: auto;
  border: 0;
  border-radius: 0;
  box-shadow: none;
}
.task-panel__header,
.task-panel__toggle,
.task-panel__summary,
.task-panel__actions,
.task-run__heading,
.task-run__recovery {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}
.task-panel__header,
.task-panel__actions {
  justify-content: space-between;
}
.task-panel__toggle,
.task-run__locate {
  color: inherit;
  text-align: left;
  cursor: pointer;
  background: transparent;
  border: 0;
}
.task-panel__toggle {
  flex: 1;
  justify-content: space-between;
  padding: 0;
}
.task-label,
.task-panel__summary,
.task-hint {
  font-size: 12px;
}
.task-hint {
  margin: 0;
  color: hsl(var(--muted-foreground));
}
.task-stream {
  color: hsl(var(--muted-foreground));
}
.task-panel__runs {
  display: grid;
  gap: 8px;
}
.execution-task-panel:not(.is-panel) .task-panel__runs {
  max-height: 36vh;
  overflow: auto;
}
.task-panel__runs article {
  padding: 10px;
  background: hsl(var(--muted) / 40%);
  border: 1px solid hsl(var(--border));
  border-radius: 8px;
}
.task-panel__runs article.is-failed {
  border-color: hsl(var(--destructive) / 40%);
}
.task-run__locate {
  display: flex;
  flex: 1;
  gap: 6px;
  align-items: center;
  min-width: 0;
  padding: 0;
  font-size: 13px;
}
.task-run__locate span {
  overflow-wrap: anywhere;
}
.task-run__locate svg,
.task-panel__toggle svg {
  flex: none;
  width: 16px;
  height: 16px;
}
.task-run__error {
  margin: 8px 0;
  overflow-wrap: anywhere;
  font-size: 12px;
  color: hsl(var(--destructive));
}
.task-run__recovery {
  margin-top: 8px;
}
.history-more {
  align-self: flex-start;
}
</style>
