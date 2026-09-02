<script lang="ts" setup>
import type { TradeActiveFilter, TradeSummaryItem } from './types';

import { computed } from 'vue';

import { Page } from '@vben/common-ui';
import { IconifyIcon } from '@vben/icons';

import { Button, Spin, Tag } from 'ant-design-vue';

import '../styles.css';

defineOptions({ name: 'FdmTradeListShell' });

const props = withDefaults(
  defineProps<{
    activeFilters?: readonly TradeActiveFilter[];
    autoContentHeight?: boolean;
    description?: string;
    loading?: boolean;
    showClearFilters?: boolean;
    summaryItems?: readonly TradeSummaryItem[];
    title: string;
  }>(),
  {
    activeFilters: () => [],
    autoContentHeight: true,
    description: undefined,
    loading: false,
    showClearFilters: true,
    summaryItems: () => [],
  },
);

const emit = defineEmits<{
  clearFilters: [];
  removeFilter: [key: string];
}>();

const hasActiveFilters = computed(() => props.activeFilters.length > 0);

function filterText(filter: TradeActiveFilter) {
  return filter.value ? `${filter.label}：${filter.value}` : filter.label;
}
</script>

<template>
  <Page
    :auto-content-height="autoContentHeight"
    :description="description"
    :title="title"
  >
    <template v-if="$slots.actions" #extra>
      <div class="fdm-trade-list-shell__page-actions">
        <slot name="actions"></slot>
      </div>
    </template>

    <Spin class="fdm-trade-list-shell__spin" :spinning="loading">
      <div class="fdm-trade-list-shell">
        <div v-if="$slots.scope" class="fdm-trade-list-shell__scope">
          <slot name="scope"></slot>
        </div>

        <section
          v-if="$slots.filters || $slots['filter-actions']"
          aria-label="筛选条件"
          class="fdm-trade-list-shell__filter-panel"
        >
          <div v-if="$slots.filters" class="fdm-trade-list-shell__filters">
            <slot name="filters"></slot>
          </div>
          <div
            v-if="$slots['filter-actions']"
            class="fdm-trade-list-shell__filter-actions"
          >
            <slot name="filter-actions"></slot>
          </div>
        </section>

        <div
          v-if="hasActiveFilters || $slots['active-filters']"
          aria-label="已启用的筛选条件"
          class="fdm-trade-list-shell__active-filters"
        >
          <span class="fdm-trade-list-shell__active-label">当前条件</span>
          <slot name="active-filters">
            <Tag
              v-for="filter in activeFilters"
              :key="filter.key"
              :closable="filter.closable !== false"
              class="fdm-trade-list-shell__filter-tag"
              @close="emit('removeFilter', filter.key)"
            >
              {{ filterText(filter) }}
            </Tag>
          </slot>
          <Button
            v-if="showClearFilters && hasActiveFilters"
            class="fdm-trade-list-shell__clear-filters"
            size="small"
            type="link"
            @click="emit('clearFilters')"
          >
            <template #icon>
              <IconifyIcon icon="lucide:filter-x" aria-hidden="true" />
            </template>
            清空条件
          </Button>
        </div>

        <main class="fdm-trade-list-shell__content">
          <slot></slot>
        </main>

        <footer
          v-if="$slots.summary || summaryItems.length > 0"
          aria-label="列表汇总"
          class="fdm-trade-list-shell__summary"
        >
          <slot name="summary" :items="summaryItems">
            <div
              v-for="item in summaryItems"
              :key="item.key"
              class="fdm-trade-list-shell__summary-item"
              :data-tone="item.tone || 'default'"
            >
              <span>{{ item.label }}</span>
              <strong>{{ item.value }}</strong>
            </div>
          </slot>
        </footer>
      </div>
    </Spin>
  </Page>
</template>
