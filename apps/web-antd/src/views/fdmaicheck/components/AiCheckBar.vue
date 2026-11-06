<script setup lang="ts">
import type { Checklist } from './checklist';

import { computed } from 'vue';

import { headline, segments } from './checklist';

/** 一行结果条：比例条、各结论数量、最要紧的问题。右侧按钮由使用方放进 default 插槽。 */
const props = defineProps<{ list: Checklist; summary?: string }>();

const seg = computed(() => segments(props.list));
const title = computed(() => headline(props.list));
const allPass = computed(
  () =>
    props.list.total > 0 &&
    props.list.tally.PASS === props.list.total &&
    props.list.openIssues.length === 0,
);
</script>

<template>
  <div class="bar">
    <span class="bar-title">AI 检查</span>
    <template v-if="list.total > 0">
      <span class="bar-seg" aria-hidden="true">
        <i class="f" :style="{ width: seg.fail }"></i>
        <i class="w" :style="{ width: seg.warn }"></i>
        <i class="p" :style="{ width: seg.pass }"></i>
      </span>
      <span v-if="allPass" class="bar-counts">
        <span class="p">✓ {{ list.total }} 项全部通过</span>
      </span>
      <span v-else class="bar-counts">
        <span v-if="list.tally.FAIL" class="f" title="不通过">✕ {{ list.tally.FAIL }}</span>
        <span v-if="list.tally.WARN" class="w" title="提醒">! {{ list.tally.WARN }}</span>
        <span class="p" title="通过">✓ {{ list.tally.PASS }}</span>
        <span
          v-if="list.tally.NOT_APPLICABLE + list.tally.UNKNOWN"
          class="n"
          title="不适用或资料不足"
          >— {{ list.tally.NOT_APPLICABLE + list.tally.UNKNOWN }}</span>
      </span>
    </template>
    <span v-if="title" class="bar-headline" :title="title">{{ title }}</span>
    <span v-else-if="summary" class="bar-headline muted" :title="summary">{{
      summary
    }}</span>
    <span class="bar-right"><slot></slot></span>
  </div>
</template>

<style scoped>
.bar {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 10px;
  align-items: center;
}

.bar-title {
  font-weight: 600;
}

.bar-seg {
  display: inline-flex;
  width: 110px;
  height: 8px;
  overflow: hidden;
  background: var(--ant-color-fill-secondary, rgb(0 0 0 / 6%));
  border-radius: 4px;
}

.bar-seg i {
  display: block;
  height: 100%;
}

.bar-seg .f {
  background: var(--ant-color-error, #ff4d4f);
}

.bar-seg .w {
  background: var(--ant-color-warning, #faad14);
}

.bar-seg .p {
  background: var(--ant-color-success, #52c41a);
}

.bar-counts {
  display: inline-flex;
  gap: 8px;
  font-size: 13px;
  font-variant-numeric: tabular-nums;
}

.bar-counts .f {
  color: var(--ant-color-error, #ff4d4f);
}

.bar-counts .w {
  color: var(--ant-color-warning, #faad14);
}

.bar-counts .p {
  color: var(--ant-color-success, #52c41a);
}

.bar-counts .n {
  color: var(--ant-color-text-tertiary, #8c8c8c);
}

.bar-headline {
  flex: 1 1 200px;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 13px;
  color: var(--ant-color-error, #ff4d4f);
  white-space: nowrap;
}

.bar-headline.muted {
  color: var(--ant-color-text-secondary, #595959);
}

.bar-right {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  margin-inline-start: auto;
  font-size: 12px;
  color: var(--ant-color-text-tertiary, #8c8c8c);
}
</style>
