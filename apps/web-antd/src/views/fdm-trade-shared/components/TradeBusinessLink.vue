<script lang="ts" setup>
import type { RouteLocationRaw } from 'vue-router';

import { RouterLink } from 'vue-router';

import { IconifyIcon } from '@vben/icons';

import '../styles.css';

defineOptions({ name: 'FdmTradeBusinessLink' });

withDefaults(
  defineProps<{
    ariaLabel?: string;
    disabled?: boolean;
    showArrow?: boolean;
    title?: string;
    to?: RouteLocationRaw;
  }>(),
  {
    ariaLabel: undefined,
    disabled: false,
    showArrow: false,
    title: undefined,
    to: undefined,
  },
);
</script>

<template>
  <RouterLink
    v-if="to && !disabled"
    :aria-label="ariaLabel"
    class="fdm-trade-business-link"
    :title="title"
    :to="to"
  >
    <span class="fdm-trade-business-link__content"><slot></slot></span>
    <IconifyIcon
      v-if="showArrow"
      aria-hidden="true"
      icon="lucide:arrow-up-right"
    />
  </RouterLink>
  <span
    v-else
    :aria-disabled="disabled || undefined"
    class="fdm-trade-business-link fdm-trade-business-link--disabled"
    :title="title"
  >
    <span class="fdm-trade-business-link__content"><slot></slot></span>
  </span>
</template>
