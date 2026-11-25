<script setup lang="ts">
import type { CashPostingMatch } from '#/api/fdmcaiwu/bank-account';

import { computed, ref, watch } from 'vue';

import { FormItem, Select } from 'ant-design-vue';

import { listCashPostingMatches } from '#/api/fdmcaiwu/bank-account';

const props = defineProps<{
  accountId?: null | number;
  amount?: null | number | string;
  companyId?: null | number;
  currency?: null | string;
  date?: null | string;
  direction: 'EXPENSE' | 'INCOME';
  disabled?: boolean;
}>();
const value = defineModel<null | number>('value');
const matches = ref<CashPostingMatch[]>([]);
const loading = ref(false);
const options = computed(() => [
  ...matches.value.map((match) => ({
    label: [match.summary || `日记账 #${match.id}`, match.counterparty, match.companyName]
      .filter(Boolean)
      .join(' · '),
    value: match.id,
  })),
  { label: '确认另记一笔', value: 0 },
]);

watch(
  () => [props.accountId, props.companyId, props.direction, props.date, props.currency, props.amount] as const,
  async ([accountId, companyId, direction, date, currency, amount], previous, onCleanup) => {
    let current = true;
    onCleanup(() => { current = false; });
    if (previous?.[0] && previous[3] && previous[4] && Number(previous[5]) > 0) value.value = undefined;
    matches.value = [];
    loading.value = false;
    if (!accountId || !date || !currency || amount == null || !(Number(amount) > 0)) return;
    loading.value = true;
    try {
      const rows = await listCashPostingMatches({ accountId, amount, companyId, currency, date, direction });
      if (current) matches.value = rows;
    } catch {
      // 请求层已提示错误。实际确认时，后端仍会核对是否存在待关联的日记账。
    } finally {
      if (current) loading.value = false;
    }
  },
  { immediate: true },
);
</script>

<template>
  <FormItem
    v-if="matches.length || value != null || loading"
    label="日记账关联"
    :extra="matches.length ? '已有同账户、同日、同金额的日记账，确认前请选择处理方式。' : undefined"
  >
    <Select
      :value="value ?? undefined"
      :disabled="disabled"
      :loading="loading"
      :options="options"
      allow-clear
      placeholder="关联已有记录或确认另记一笔"
      @update:value="(next) => { value = typeof next === 'number' ? next : undefined; }"
    />
  </FormItem>
</template>
