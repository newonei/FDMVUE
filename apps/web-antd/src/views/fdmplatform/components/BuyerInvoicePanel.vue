<script setup lang="ts">
import type { Customer } from '#/api/fdmplatform/customers';

import { computed, ref, watch } from 'vue';

import { useClipboard } from '@vueuse/core';
import { Alert, Button, message } from 'ant-design-vue';

import { getCustomer } from '#/api/fdmplatform/customers';

import { errorText } from '../data';
import {
  invoiceFields,
  invoiceMissingFields,
  invoiceTypeOptions,
} from '../trade/customers/model';

/** 登记内销发票时显示购方开票信息，方便照着开票或核对；登记时后端另存一份快照 */
const props = defineProps<{ customerId: string }>();
const emit = defineEmits<{ type: [value: string] }>();
const customer = ref<Customer>();
const loading = ref(false);
const loadError = ref('');
const { copy } = useClipboard({ legacy: true });
let sequence = 0;

watch(
  () => props.customerId,
  async (id) => {
    const run = ++sequence;
    customer.value = undefined;
    loadError.value = '';
    if (!id) return;
    loading.value = true;
    try {
      const result = await getCustomer(id);
      if (run === sequence) {
        customer.value = result;
        if (result.invoice?.type) emit('type', result.invoice.type);
      }
    } catch (error) {
      if (run === sequence) loadError.value = errorText(error);
    } finally {
      if (run === sequence) loading.value = false;
    }
  },
  { immediate: true },
);

const invoice = computed(() => customer.value?.invoice);
const typeLabel = computed(
  () =>
    invoiceTypeOptions.find((option) => option.value === invoice.value?.type)
      ?.label ?? '',
);
const rows = computed(() =>
  invoiceFields
    .map(([key, title]) => ({ key, title, value: invoice.value?.[key] ?? '' }))
    .filter((row) => row.value),
);
const missing = computed(() =>
  invoiceMissingFields({ ...invoice.value, type: invoice.value?.type ?? '' }),
);

async function copyValue(value: string) {
  await copy(value);
  message.success('已复制');
}
</script>

<template>
  <section class="buyer-invoice" aria-labelledby="buyer-invoice-title">
    <h3 id="buyer-invoice-title">
      购方开票信息<small v-if="typeLabel">{{ typeLabel }}</small>
    </h3>
    <p v-if="loading" class="muted">正在读取客户开票信息…</p>
    <Alert v-else-if="loadError" type="error" show-icon :message="loadError" />
    <template v-else-if="customer">
      <Alert
        v-if="rows.length === 0"
        type="warning"
        show-icon
        message="客户还没有填写开票信息，请先在内销客户档案里补齐。"
      />
      <template v-else>
        <dl>
          <template v-for="row in rows" :key="row.key">
            <dt>{{ row.title }}</dt>
            <dd>
              <span>{{ row.value }}</span>
              <Button size="small" type="link" @click="copyValue(row.value)">
                复制
              </Button>
            </dd>
          </template>
        </dl>
        <Alert
          v-if="missing.length > 0"
          type="warning"
          show-icon
          :message="`专用发票还缺：${missing.join('、')}`"
        />
      </template>
    </template>
  </section>
</template>

<style scoped>
.buyer-invoice {
  padding: 12px 16px;
  border: 1px solid var(--ant-color-border-secondary);
  border-radius: 8px;
}

.buyer-invoice h3 {
  margin: 0 0 8px;
  font-size: 14px;
  font-weight: 600;
}

.buyer-invoice h3 small {
  margin-left: 8px;
  font-weight: 400;
  color: var(--ant-color-text-secondary);
}

dl {
  display: grid;
  grid-template-columns: max-content minmax(0, 1fr);
  gap: 2px 12px;
  margin: 0;
}

dt {
  line-height: 24px;
  color: var(--ant-color-text-secondary);
}

dd {
  display: flex;
  gap: 4px;
  align-items: center;
  min-width: 0;
  margin: 0;
}

dd span {
  overflow-wrap: anywhere;
}

.muted {
  margin: 0;
  color: var(--ant-color-text-secondary);
}
</style>
