<script lang="ts" setup>
import type { TradeStatusTone } from './types';

import { computed } from 'vue';

import { IconifyIcon } from '@vben/icons';

import { Tag } from 'ant-design-vue';

import '../styles.css';

defineOptions({ name: 'FdmTradeStatusTag' });

const props = withDefaults(
  defineProps<{
    icon?: string;
    text: string;
    tone?: TradeStatusTone;
  }>(),
  {
    icon: undefined,
    tone: 'default',
  },
);

const tagColor = computed(() => {
  const colors: Record<TradeStatusTone, string | undefined> = {
    danger: 'error',
    default: undefined,
    info: 'blue',
    processing: 'processing',
    success: 'success',
    warning: 'warning',
  };
  return colors[props.tone];
});
</script>

<template>
  <Tag :color="tagColor" class="fdm-trade-status-tag">
    <span class="fdm-trade-status-tag__content">
      <IconifyIcon v-if="icon" :icon="icon" aria-hidden="true" />
      <span>{{ text }}</span>
    </span>
  </Tag>
</template>
