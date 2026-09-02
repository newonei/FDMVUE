<script lang="ts" setup>
import { IconifyIcon } from '@vben/icons';

import '../styles.css';

defineOptions({ name: 'FdmTradeDetailSection' });

withDefaults(
  defineProps<{
    description?: string;
    icon?: string;
    title: string;
  }>(),
  {
    description: undefined,
    icon: undefined,
  },
);
</script>

<template>
  <section class="fdm-trade-detail-section">
    <header class="fdm-trade-detail-section__header">
      <div class="fdm-trade-detail-section__identity">
        <span
          class="fdm-trade-detail-section__marker"
          aria-hidden="true"
        ></span>
        <IconifyIcon v-if="icon" :icon="icon" aria-hidden="true" />
        <div>
          <h3>{{ title }}</h3>
          <p v-if="description">{{ description }}</p>
        </div>
      </div>
      <div v-if="$slots.extra" class="fdm-trade-detail-section__extra">
        <slot name="extra"></slot>
      </div>
    </header>
    <div class="fdm-trade-detail-section__body">
      <slot></slot>
    </div>
  </section>
</template>
