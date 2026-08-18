<script lang="ts" setup>
import type { FdmCreativeApi } from '#/api/fdmcreative';

import { computed } from 'vue';

import { IconifyIcon } from '@vben/icons';

import { Alert, Button, Progress, Tag, Tooltip } from 'ant-design-vue';

import {
  AGENT_RUN_STATUS_LABEL,
  isAgentRunActive,
  isAgentRunRetryable,
  suggestedExecutionRequest,
} from '../agent-run-state';

interface Props {
  canEdit?: boolean;
  canRun?: boolean;
  cancelling?: boolean;
  executing?: boolean;
  retrying?: boolean;
  run?: FdmCreativeApi.AgentRun;
  streamState?: 'closed' | 'connecting' | 'idle' | 'open' | 'reconnecting';
}

const props = withDefaults(defineProps<Props>(), {
  canEdit: false,
  canRun: false,
  cancelling: false,
  executing: false,
  retrying: false,
  run: undefined,
  streamState: 'idle',
});

const emit = defineEmits<{
  cancel: [];
  execute: [request: {
    scope: Exclude<FdmCreativeApi.CanvasPatchSuggestedRunScope, 'NONE'>;
    startNodeId?: string;
  }];
  retry: [];
}>();

const executionSuggestion = computed(() =>
  props.run ? suggestedExecutionRequest(props.run) : undefined,
);
const progress = computed(() => {
  const status = props.run?.status;
  if (status === 'APPLIED') return 100;
  if (status === 'READY') return 72;
  if (status === 'FAILED' || status === 'CANCELED' || status === 'CONFLICT') return 100;
  if (status === 'PLANNING') return 44;
  if (status === 'APPLYING') return 86;
  return status ? 16 : 0;
});
const streamLabel = computed(
  () =>
    ({
      closed: '轮询兜底',
      connecting: '连接中',
      idle: '未订阅',
      open: '实时',
      reconnecting: '重连中',
    })[props.streamState],
);
</script>

<template>
  <section v-if="run" class="agent-run-progress" :class="`is-${run.status.toLowerCase()}`">
    <header>
      <span class="agent-run-progress__title">
        <IconifyIcon icon="lucide:bot" />
        <strong>规划运行 #{{ run.attemptNo }}</strong>
        <i :class="`is-${streamState}`"></i>
        <small>{{ streamLabel }}</small>
      </span>
      <Tag :color="run.status === 'FAILED' || run.status === 'CONFLICT' ? 'error' : run.status === 'READY' ? 'blue' : undefined">
        {{ AGENT_RUN_STATUS_LABEL[run.status] }}
      </Tag>
    </header>
    <Progress
      :percent="progress"
      :show-info="false"
      size="small"
      :status="run.status === 'FAILED' || run.status === 'CONFLICT' ? 'exception' : undefined"
    />
    <Alert
      v-if="run.errorMessage"
      class="agent-run-progress__error"
      :description="run.errorMessage"
      :message="run.errorCode || 'Agent 运行失败'"
      show-icon
      type="error"
    />
    <div class="agent-run-progress__actions">
      <Button
        v-if="canEdit && isAgentRunActive(run.status) && run.status !== 'APPLYING'"
        v-access:code="['fdmcreative:agent:cancel']"
        danger
        :loading="cancelling"
        size="small"
        @click="emit('cancel')"
      >
        <IconifyIcon icon="lucide:square" /> 取消规划
      </Button>
      <Button
        v-if="canEdit && isAgentRunRetryable(run.status)"
        v-access:code="['fdmcreative:agent:use']"
        :loading="retrying"
        size="small"
        @click="emit('retry')"
      >
        <IconifyIcon icon="lucide:refresh-cw" /> 重新规划
      </Button>
      <Tooltip
        v-if="run.status === 'APPLIED' && executionSuggestion"
        title="这是独立的确认步骤，会走既有的工作流执行器与权限检查。"
      >
        <Button
          v-access:code="['fdmcreative:execution:run']"
          :disabled="!canRun"
          :loading="executing"
          size="small"
          type="primary"
          @click="emit('execute', executionSuggestion)"
        >
          <IconifyIcon icon="lucide:play" />
          执行{{ executionSuggestion.scope === 'NODE' ? '此节点' : executionSuggestion.scope === 'DOWNSTREAM' ? '下游' : '画布' }}
        </Button>
      </Tooltip>
    </div>
  </section>
</template>

<style scoped>
.agent-run-progress {
  display: grid;
  gap: 7px;
  padding: 9px 10px;
  background: hsl(var(--muted) / 36%);
  border: 1px solid hsl(var(--border));
  border-radius: 9px;
}

.agent-run-progress > header,
.agent-run-progress__title,
.agent-run-progress__actions {
  display: flex;
  align-items: center;
}

.agent-run-progress > header {
  justify-content: space-between;
}

.agent-run-progress__title {
  gap: 5px;
  min-width: 0;
}

.agent-run-progress__title > svg {
  width: 14px;
  height: 14px;
  color: #6d5dfc;
}

.agent-run-progress__title strong {
  font-size: 11px;
}

.agent-run-progress__title small {
  font-size: 9px;
  color: hsl(var(--muted-foreground));
}

.agent-run-progress__title i {
  width: 5px;
  height: 5px;
  background: hsl(var(--muted-foreground) / 55%);
  border-radius: 999px;
}

.agent-run-progress__title i.is-open {
  background: #16a34a;
  box-shadow: 0 0 0 3px rgb(22 163 74 / 13%);
}

.agent-run-progress__title i.is-connecting,
.agent-run-progress__title i.is-reconnecting {
  background: #f59e0b;
}

.agent-run-progress__error {
  font-size: 10px;
}

.agent-run-progress__error :deep(.ant-alert-message) {
  font-size: 10px;
}

.agent-run-progress__error :deep(.ant-alert-description) {
  font-size: 10px;
  line-height: 16px;
  overflow-wrap: anywhere;
}

.agent-run-progress__actions {
  flex-wrap: wrap;
  gap: 6px;
}
</style>
