<script setup lang="ts">
import type { FdmAiCheckApi } from '#/api/fdmaicheck';

import { Tag, Tooltip } from 'ant-design-vue';

import { listTagVisible, SEVERITY_COLORS, SEVERITY_LABELS } from './risk';

/** 列表里的风险标记：只有高风险、需核对时显示。 */
defineProps<{ level?: FdmAiCheckApi.Severity }>();
</script>

<template>
  <Tooltip
    v-if="level && listTagVisible(level)"
    title="AI 风险检查发现待处理的问题，打开单据查看"
  >
    <Tag :color="SEVERITY_COLORS[level]" class="ai-risk-tag">
      {{ SEVERITY_LABELS[level] }}
    </Tag>
  </Tooltip>
</template>

<style scoped>
.ai-risk-tag {
  padding-inline: 4px;
  margin-inline-end: 0;
  font-size: 12px;
  line-height: 18px;
}
</style>
