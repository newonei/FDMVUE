<script lang="ts" setup>
import type { AiGenerationJob, AiGenerationStage } from '../types';

import { computed } from 'vue';

import { Alert, Button, Spin, Steps, Tag } from 'ant-design-vue';

defineOptions({ name: 'FdmAiGenerationProgress' });

const props = defineProps<{
  cancelling?: boolean;
  error?: string;
  job?: AiGenerationJob<unknown>;
  showCancel?: boolean;
  sourceTitle?: string;
  targetTitle?: string;
}>();

const emit = defineEmits<{ cancel: []; retry: [] }>();

const stages: Array<{
  description: string;
  key: AiGenerationStage;
  title: string;
}> = [
  {
    description: `读取${props.sourceTitle || '前置单据'}权威快照`,
    key: 'CONTEXT',
    title: '准备上下文',
  },
  {
    description: '核对产品、数量与映射证据',
    key: 'EVIDENCE',
    title: '读取证据',
  },
  { description: '调用用户选择的模型', key: 'MODEL', title: '模型生成' },
  {
    description: `解析为结构化${props.targetTitle || '需求计划'}建议`,
    key: 'PARSING',
    title: '解析结果',
  },
  { description: '执行确定性业务规则', key: 'VALIDATION', title: '规则预校验' },
];

const current = computed(() => {
  const stage = props.job?.stage;
  const index = stages.findIndex((item) => item.key === stage);
  return index === -1 ? 0 : index;
});

const status = computed(() => {
  if (
    ['CANCELLED', 'EXPIRED', 'FAILED', 'RULE_BLOCKED', 'STALE'].includes(
      props.job?.status || '',
    ) ||
    props.error
  )
    return 'error';
  if (['MATERIALIZED', 'READY'].includes(props.job?.status || ''))
    return 'finish';
  return 'process';
});

const statusCopy = computed(() => {
  if (props.job?.status === 'RULE_BLOCKED') {
    return '生成结果未通过确定性规则，请检查阻断项后重新生成。';
  }
  if (props.job?.status === 'STALE') {
    return `来源${props.sourceTitle || '单据'}已经变化，本次建议已失效，请基于最新版本重新生成。`;
  }
  if (props.job?.status === 'EXPIRED') {
    return '生成任务已过期，请重新发起生成。';
  }
  if (props.job?.status === 'CANCELLED') return '生成任务已取消。';
  return props.error || props.job?.errorMessage || 'AI 生成失败，请稍后重试。';
});
</script>

<template>
  <section class="ai-generation-progress" aria-live="polite">
    <div class="ai-generation-progress__hero">
      <Spin v-if="status === 'process'" size="large" />
      <div>
        <Tag color="purple">后台生成任务</Tag>
        <h2>
          {{
            cancelling
              ? '正在取消生成任务'
              : status === 'error'
                ? '生成未完成'
                : status === 'finish'
                  ? '建议已生成'
                  : `正在生成${targetTitle || '需求计划'}建议`
          }}
        </h2>
        <p>
          {{
            status === 'process'
              ? '可离开本页，稍后使用任务编号恢复；页面不会保存业务草稿到浏览器。'
              : '生成任务不会自动确认任何业务单据。'
          }}
        </p>
      </div>
    </div>

    <Steps
      :current="current"
      direction="vertical"
      :items="stages"
      size="small"
      :status="status"
    />

    <Alert
      v-if="status === 'error'"
      :description="job?.traceId ? `追踪编号：${job.traceId}` : undefined"
      :message="statusCopy"
      show-icon
      type="error"
    >
      <template #action>
        <Button size="small" @click="emit('retry')">
          {{
            job?.status === 'FAILED'
              ? '重试生成'
              : job?.status === 'RULE_BLOCKED'
                ? '重新生成建议'
                : ['CANCELLED', 'EXPIRED', 'STALE'].includes(job?.status || '')
                  ? '重新发起生成'
                  : '重新读取任务'
          }}
        </Button>
      </template>
    </Alert>

    <footer v-if="job">
      <span>任务 {{ job.id }}</span>
      <span>{{ job.modelName || job.modelId }}</span>
      <span v-if="job.invocationId">调用 {{ job.invocationId }}</span>
      <Button
        v-if="status === 'process' && !cancelling && showCancel !== false"
        danger
        size="small"
        type="link"
        @click="emit('cancel')"
      >
        取消生成
      </Button>
    </footer>
  </section>
</template>

<style scoped>
.ai-generation-progress {
  display: grid;
  gap: 18px;
  max-width: 760px;
  padding: 28px;
  margin: 0 auto;
  background: #fff;
  border: 1px solid #dfe7f0;
  border-radius: 10px;
}

.ai-generation-progress__hero {
  display: flex;
  gap: 16px;
  align-items: center;
}

.ai-generation-progress__hero h2 {
  margin: 6px 0 3px;
  font-size: 20px;
}

.ai-generation-progress__hero p,
.ai-generation-progress footer {
  font-size: 12px;
  color: #64748b;
}

.ai-generation-progress footer {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 20px;
  padding-top: 12px;
  border-top: 1px solid #eef2f6;
}
</style>
