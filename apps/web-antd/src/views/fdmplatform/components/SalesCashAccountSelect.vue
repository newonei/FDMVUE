<script setup lang="ts">
import type { ReceiptAccountSnapshot } from '#/api/fdmplatform';

import { computed, ref, watch } from 'vue';

import { Select } from 'ant-design-vue';

import { listCashAccountOptions } from '#/api/fdmcaiwu/bank-account';

const props = defineProps<{
  allowUnlinked?: boolean;
  companyId?: number;
  disabled?: boolean;
  snapshot?: null | ReceiptAccountSnapshot;
  value?: number;
}>();
const emit = defineEmits<{ 'update:value': [value: number | undefined] }>();

const accounts = ref<Awaited<ReturnType<typeof listCashAccountOptions>>>([]);
const loading = ref(false);
const unavailable = ref(false);

function accountLabel(account: {
  accountName?: null | string;
  accountNumberTail?: null | string;
  currency?: string;
  name: string;
}) {
  return [
    account.name,
    account.accountName === account.name ? undefined : account.accountName,
    account.accountNumberTail ? `尾号 ${account.accountNumberTail}` : undefined,
    account.currency,
  ]
    .filter(Boolean)
    .join(' · ');
}

const options = computed(() => {
  const list: { disabled?: boolean; label: string; value: number }[] =
    accounts.value.map((account) => ({
      label: accountLabel(account),
      value: account.id,
    }));
  if (
    props.snapshot &&
    !list.some((item) => item.value === props.snapshot?.id)
  ) {
    list.unshift({
      disabled: true,
      label:
        accountLabel(props.snapshot) +
        (!loading.value && !unavailable.value ? '（当前不可选）' : ''),
      value: props.snapshot.id,
    });
  }
  if (props.allowUnlinked) {
    list.unshift({ label: '本次不关联资金账户', value: 0 });
  }
  return list;
});

watch(
  () => props.companyId,
  async (companyId, _previous, onCleanup) => {
    let current = true;
    onCleanup(() => {
      current = false;
    });
    accounts.value = [];
    unavailable.value = false;
    loading.value = Boolean(companyId && companyId > 0);
    if (!loading.value) return;
    try {
      const result = await listCashAccountOptions(companyId);
      if (current) accounts.value = result;
    } catch {
      if (current) unavailable.value = true;
    } finally {
      if (current) loading.value = false;
    }
  },
  { immediate: true },
);
</script>

<template>
  <Select
    :allow-clear="!allowUnlinked"
    :disabled="disabled || !companyId"
    :loading="loading"
    :not-found-content="unavailable ? '账户加载失败' : '暂无可选账户'"
    :options="options"
    :placeholder="companyId ? '请选择资金账户' : '请先选择签约主体'"
    :value="value"
    option-filter-prop="label"
    show-search
    style="width: 100%"
    @update:value="
      (selected) =>
        emit(
          'update:value',
          typeof selected === 'number' ? selected : undefined,
        )
    "
  />
</template>
