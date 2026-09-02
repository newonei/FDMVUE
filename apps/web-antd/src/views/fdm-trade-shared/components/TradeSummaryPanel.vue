<script lang="ts" setup>
import type { TradeSummaryMetric } from './types';

import { Tooltip } from 'ant-design-vue';

import TradeBusinessLink from './TradeBusinessLink.vue';

import '../styles.css';

defineOptions({ name: 'FdmTradeSummaryPanel' });

withDefaults(
  defineProps<{
    metrics: readonly TradeSummaryMetric[];
    title?: string;
  }>(),
  {
    title: '摘要',
  },
);
</script>

<template>
  <section class="fdm-trade-summary-panel">
    <header class="fdm-trade-summary-panel__header">
      <span aria-hidden="true"></span>
      <h3>{{ title }}</h3>
      <slot name="extra"></slot>
    </header>
    <dl class="fdm-trade-summary-panel__grid">
      <div
        v-for="metric in metrics"
        :key="metric.key"
        class="fdm-trade-summary-panel__metric"
        :data-tone="metric.tone || 'default'"
      >
        <dt>
          {{ metric.label }}
          <Tooltip v-if="metric.help" :title="metric.help">
            <span
              :aria-label="`${metric.label}说明`"
              class="fdm-trade-summary-panel__help"
              role="img"
              tabindex="0"
              >?</span>
          </Tooltip>
        </dt>
        <dd>
          <TradeBusinessLink v-if="metric.to" :to="metric.to">
            {{ metric.value }}
          </TradeBusinessLink>
          <template v-else>{{ metric.value }}</template>
        </dd>
      </div>
    </dl>
  </section>
</template>
