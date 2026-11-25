<script setup lang="ts">
import { computed, ref, watch } from 'vue';

import { Input, Select } from 'ant-design-vue';

import { listCashAccountOptions } from '#/api/fdmcaiwu/bank-account';

const props = withDefaults(
  defineProps<{
    companyId?: number;
    disabled?: boolean;
    open?: boolean;
    payerSelected: boolean;
  }>(),
  { companyId: undefined, open: true },
);
const accountId = defineModel<number | undefined>('accountId');
const accountText = defineModel<string | undefined>('accountText');
const accounts = ref<Awaited<ReturnType<typeof listCashAccountOptions>>>([]);
const loading = ref(false);
const unavailable = ref(false);

const options = computed(() => {
  const result = accounts.value.map((account) => {
    const tail = account.accountNumberTail;
    const details = [
      account.bankName === account.name ? '' : account.bankName,
      tail ? `尾号 ${tail}` : '',
      account.currency,
    ]
      .filter(Boolean)
      .join(' · ');
    return {
      value: account.id,
      label: [account.name, details, account.companyId ? '' : '未绑定公司']
        .filter(Boolean)
        .join(' · '),
    };
  });
  if (
    accountId.value &&
    !result.some((option) => option.value === accountId.value)
  ) {
    result.unshift({
      value: accountId.value,
      label: accountText.value || '已选择账户',
    });
  }
  return result;
});

watch(
  () => [props.payerSelected && props.open, props.companyId] as const,
  async ([selected, companyId], _previous, onCleanup) => {
    accounts.value = [];
    unavailable.value = false;
    loading.value = false;
    if (!selected) return;
    let stale = false;
    onCleanup(() => {
      stale = true;
    });
    loading.value = true;
    try {
      const loaded = await listCashAccountOptions(companyId);
      if (!stale) accounts.value = loaded;
    } catch {
      if (!stale) unavailable.value = true;
    } finally {
      if (!stale) loading.value = false;
    }
  },
  { immediate: true },
);

function pickAccount(value: unknown) {
  const account = accounts.value.find((entry) => entry.id === value);
  accountId.value = account?.id;
  if (!account) {
    accountText.value = '';
    return;
  }
  accountText.value = account.accountNumberTail
    ? `${account.name}（${account.accountNumberTail}）`
    : account.name;
}
</script>

<template>
  <div class="cash-account-field">
    <Select
      v-if="payerSelected && (options.length > 0 || loading || accountId)"
      :value="accountId"
      :disabled="disabled"
      :loading="loading"
      :options="options"
      allow-clear
      option-filter-prop="label"
      placeholder="选择付款账户"
      show-search
      @update:value="pickAccount"
    />
    <Input
      v-if="!accountId"
      v-model:value="accountText"
      :disabled="disabled"
      placeholder="填写付款账户"
    />
    <small v-if="unavailable" class="cash-account-field__status">
      账户列表暂不可用，可填写付款账户。
    </small>
  </div>
</template>

<style scoped>
.cash-account-field {
  display: grid;
  gap: 6px;
}

.cash-account-field__status {
  color: var(--ant-color-text-secondary);
}
</style>
