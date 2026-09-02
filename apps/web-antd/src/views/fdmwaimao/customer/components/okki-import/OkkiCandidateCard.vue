<script lang="ts" setup>
import type { FdmWaimaoCustomerApi } from '#/api/fdmwaimao/customer';

import { computed } from 'vue';

import { IconifyIcon } from '@vben/icons';

import { Tag } from 'ant-design-vue';

import { cleanOkkiText } from './display';

const props = defineProps<{
  candidate: FdmWaimaoCustomerApi.OkkiCandidate;
  selected: boolean;
}>();

const emit = defineEmits<{
  select: [candidate: FdmWaimaoCustomerApi.OkkiCandidate];
}>();

const companyName = computed(
  () => cleanOkkiText(props.candidate.name) || '未命名客户',
);
const shortName = computed(() => {
  const value = cleanOkkiText(props.candidate.shortName);
  return value && value !== companyName.value ? value : '';
});
const mappingLabel = computed(() => {
  if (!props.candidate.mapped) return '';
  return props.candidate.mappedCustomerVisible === false
    ? '已导入 · 无权查看'
    : '已导入';
});
</script>

<template>
  <button
    :aria-label="`选择 ${companyName}`"
    :aria-selected="selected"
    class="okki-candidate"
    :class="{ 'okki-candidate--selected': selected }"
    role="option"
    type="button"
    @click="emit('select', candidate)"
  >
    <span class="okki-candidate__icon" aria-hidden="true">
      <IconifyIcon icon="lucide:building-2" />
    </span>

    <span class="okki-candidate__body">
      <span class="okki-candidate__headline">
        <strong :title="companyName">{{ companyName }}</strong>
        <span class="okki-candidate__tags">
          <Tag v-if="mappingLabel" color="success">{{ mappingLabel }}</Tag>
          <Tag v-if="candidate.publicCustomer" color="orange">公海</Tag>
        </span>
      </span>
      <span v-if="shortName" class="okki-candidate__short" :title="shortName">
        {{ shortName }}
      </span>
      <span class="okki-candidate__meta">
        <IconifyIcon icon="lucide:badge-check" aria-hidden="true" />
        OKKI {{ cleanOkkiText(candidate.serialId) || candidate.companyId }}
      </span>
    </span>

    <IconifyIcon
      class="okki-candidate__indicator"
      :icon="selected ? 'lucide:circle-check' : 'lucide:chevron-right'"
      aria-hidden="true"
    />
  </button>
</template>

<style scoped>
.okki-candidate {
  display: grid;
  grid-template-columns: 40px minmax(0, 1fr) 20px;
  gap: 10px;
  align-items: center;
  width: 100%;
  padding: 12px;
  color: var(--ant-color-text);
  text-align: left;
  cursor: pointer;
  background: var(--ant-color-bg-container);
  border: 1px solid var(--ant-color-border-secondary);
  border-radius: 10px;
  transition:
    border-color 160ms ease,
    box-shadow 160ms ease,
    background-color 160ms ease;
}

.okki-candidate:hover {
  border-color: var(--ant-color-primary-border);
  box-shadow: 0 4px 14px rgb(15 23 42 / 6%);
}

.okki-candidate:focus-visible {
  outline: 2px solid var(--ant-color-primary);
  outline-offset: 2px;
}

.okki-candidate--selected {
  background: var(--ant-color-primary-bg);
  border-color: var(--ant-color-primary);
  box-shadow: 0 0 0 2px var(--ant-color-primary-bg);
}

.okki-candidate__icon {
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  font-size: 18px;
  color: var(--ant-color-primary);
  background: var(--ant-color-primary-bg);
  border-radius: 10px;
}

.okki-candidate__body {
  display: grid;
  gap: 4px;
  min-width: 0;
}

.okki-candidate__headline {
  display: flex;
  gap: 6px;
  align-items: center;
  justify-content: space-between;
  min-width: 0;
}

.okki-candidate__headline strong,
.okki-candidate__short {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.okki-candidate__headline strong {
  min-width: 0;
  font-size: 14px;
  line-height: 22px;
}

.okki-candidate__tags {
  display: inline-flex;
  flex: none;
  gap: 4px;
}

.okki-candidate__tags :deep(.ant-tag) {
  margin-inline-end: 0;
  font-size: 11px;
  line-height: 18px;
}

.okki-candidate__short,
.okki-candidate__meta {
  font-size: 12px;
  color: var(--ant-color-text-secondary);
}

.okki-candidate__meta {
  display: inline-flex;
  gap: 5px;
  align-items: center;
}

.okki-candidate__indicator {
  font-size: 18px;
  color: var(--ant-color-text-quaternary);
}

.okki-candidate--selected .okki-candidate__indicator {
  color: var(--ant-color-primary);
}
</style>
