<script setup lang="ts">
import type { DisplayReviewStatus } from './useAiReviewStatuses';

import type { FdmAiCheckApi } from '#/api/fdmaicheck';

import { computed } from 'vue';

import { formatDateTime } from '@vben/utils';

import { Tag } from 'ant-design-vue';

import { aiStatusText, SEVERITY_COLORS, SEVERITY_LABELS } from './risk';

const props = defineProps<{ status?: DisplayReviewStatus }>();

const verdicts: {
  color?: string;
  key: FdmAiCheckApi.VerdictResult;
  label: string;
}[] = [
  { key: 'FAIL', label: '不通过', color: 'red' },
  { key: 'WARN', label: '提醒', color: 'orange' },
  { key: 'UNKNOWN', label: '缺资料', color: 'blue' },
  { key: 'PASS', label: '通过', color: 'green' },
  { key: 'NOT_APPLICABLE', label: '不适用' },
];

const chips = computed<{ color?: string; label: string }[]>(() => {
  const status = props.status;
  switch (status?.state) {
    case 'COMPLETED': {
      if (status.aiStatus === 'NO_CHECKPOINTS') return [{ label: '未审核' }];
      const result = verdicts.flatMap(({ color, key, label }) => {
        const count = status.counts?.[key];
        return count ? [{ label: `${label} ${count}`, color }] : [];
      });
      if (aiStatusText(status.aiStatus, undefined, true)) {
        result.unshift({
          label: result.length > 0 ? '仅规则审核' : 'AI 未完成',
          color: 'orange',
        });
      }
      if (result.length > 0) return result;
      if (status.riskLevel && status.riskLevel !== 'NONE') {
        return [
          {
            label: SEVERITY_LABELS[status.riskLevel],
            color: SEVERITY_COLORS[status.riskLevel],
          },
        ];
      }
      return [{ label: '已审核', color: 'green' }];
    }
    case 'FAILED': {
      return [{ label: '审核失败', color: 'red' }];
    }
    case 'LOAD_ERROR': {
      return [{ label: '读取失败', color: 'orange' }];
    }
    case 'NOT_REVIEWED': {
      return [{ label: '未审核' }];
    }
    case 'QUEUED': {
      return [{ label: '待审核', color: 'blue' }];
    }
    case 'RUNNING': {
      return [{ label: '审核中', color: 'processing' }];
    }
    case 'UNAVAILABLE': {
      return [{ label: '结果不可见' }];
    }
    default: {
      return [{ label: '查询中' }];
    }
  }
});

const tooltip = computed(() => {
  const status = props.status;
  if (status?.state !== 'COMPLETED') return undefined;
  const reason =
    status.aiStatus === 'NOT_REQUIRED'
      ? '检查点已由系统规则核对'
      : aiStatusText(status.aiStatus, undefined, true);
  const time = status.checkedAt
    ? `审核时间 ${formatDateTime(status.checkedAt)}`
    : '';
  return [reason, time].filter(Boolean).join(' · ');
});
</script>

<template>
  <span class="ai-review-status" :title="tooltip || undefined">
    <Tag v-for="chip in chips" :key="chip.label" :color="chip.color">
      {{ chip.label }}
    </Tag>
  </span>
</template>

<style scoped>
.ai-review-status {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 3px 4px;
  vertical-align: middle;
}

.ai-review-status :deep(.ant-tag) {
  padding-inline: 4px;
  margin-inline-end: 0;
  font-size: 12px;
  line-height: 18px;
}
</style>
