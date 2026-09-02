<script lang="ts" setup>
import type { TradeStatusTone } from './types';

import { computed } from 'vue';

import { IconifyIcon } from '@vben/icons';

import { Card, Statistic } from 'ant-design-vue';

import '../styles.css';

defineOptions({ name: 'FdmTradeMetricCard' });

const props = withDefaults(
  defineProps<{
    help?: string;
    icon?: string;
    label: string;
    precision?: number;
    prefix?: string;
    suffix?: string;
    tone?: TradeStatusTone;
    value: number | string;
  }>(),
  {
    help: undefined,
    icon: undefined,
    precision: undefined,
    prefix: undefined,
    suffix: undefined,
    tone: 'default',
  },
);

const statisticPrecision = computed(() =>
  typeof props.value === 'number' ? props.precision : undefined,
);
</script>

<template>
  <Card
    :bordered="false"
    class="fdm-trade-metric-card"
    :data-tone="tone"
    size="small"
  >
    <div class="fdm-trade-metric-card__heading">
      <div class="fdm-trade-metric-card__label">
        <span v-if="icon" class="fdm-trade-metric-card__icon">
          <IconifyIcon :icon="icon" aria-hidden="true" />
        </span>
        <span>{{ label }}</span>
      </div>
      <slot name="extra"></slot>
    </div>

    <slot name="value">
      <Statistic
        :precision="statisticPrecision"
        :prefix="prefix"
        :suffix="suffix"
        :value="value"
      />
    </slot>

    <div v-if="help || $slots.help" class="fdm-trade-metric-card__help">
      <slot name="help">{{ help }}</slot>
    </div>
  </Card>
</template>
