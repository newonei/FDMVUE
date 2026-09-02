<script lang="ts" setup>
import type { TradeRelationLink } from './types';

import { IconifyIcon } from '@vben/icons';

import { Empty } from 'ant-design-vue';

import StatusTag from './StatusTag.vue';
import TradeBusinessLink from './TradeBusinessLink.vue';

import '../styles.css';

defineOptions({ name: 'FdmTradeRelatedDocuments' });

withDefaults(
  defineProps<{
    emptyText?: string;
    items: readonly TradeRelationLink[];
    title?: string;
  }>(),
  {
    emptyText: '暂无关联单据',
    title: '关联单据',
  },
);

const simpleEmptyImage = Empty.PRESENTED_IMAGE_SIMPLE;
</script>

<template>
  <section class="fdm-trade-related-documents">
    <header class="fdm-trade-related-documents__header">
      <span aria-hidden="true"></span>
      <h3>{{ title }}</h3>
      <small>{{ items.length }} 项</small>
    </header>

    <div v-if="items.length" class="fdm-trade-related-documents__list">
      <article
        v-for="item in items"
        :key="item.key"
        class="fdm-trade-related-documents__item"
        :class="{
          'fdm-trade-related-documents__item--disabled': item.disabled,
        }"
      >
        <span class="fdm-trade-related-documents__icon">
          <IconifyIcon
            :icon="item.icon || 'lucide:file-text'"
            aria-hidden="true"
          />
        </span>
        <div class="fdm-trade-related-documents__copy">
          <span class="fdm-trade-related-documents__type">{{ item.type }}</span>
          <TradeBusinessLink
            :aria-label="`打开${item.type} ${item.label}`"
            :disabled="item.disabled"
            show-arrow
            :to="item.to"
          >
            {{ item.label }}
          </TradeBusinessLink>
          <small v-if="item.description">{{ item.description }}</small>
          <small v-if="item.meta" class="fdm-trade-related-documents__meta">
            {{ item.meta }}
          </small>
        </div>
        <StatusTag
          v-if="item.status"
          :text="item.status"
          :tone="item.statusTone || 'default'"
        />
      </article>
    </div>
    <Empty v-else :description="emptyText" :image="simpleEmptyImage" />
  </section>
</template>
