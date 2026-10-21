<script setup lang="ts">
import type {
  InvoiceSourceOrder,
  InvoiceSources,
} from '#/api/fdmplatform/procurement';

import { ref, watch } from 'vue';

import { Alert, Modal, Spin } from 'ant-design-vue';

import { getPurchaseInvoiceSources } from '#/api/fdmplatform/procurement';

import { errorText } from '../../../data';
import InvoiceSourceTable from './InvoiceSourceTable.vue';

/**
 * 查看来源（集中收票）：付款发票关联的全部采购单。付款记录查看来源也用它，
 * 传付款记录挂的发票，采购单由发票关联得到，付款记录自己不存采购单。
 */
const props = defineProps<{
  invoiceId?: string;
  open: boolean;
  title?: string;
}>();
const emit = defineEmits<{
  close: [];
  openOrder: [order: InvoiceSourceOrder];
}>();

const sources = ref<InvoiceSources>();
const loading = ref(false);
const error = ref('');

watch(
  () => [props.open, props.invoiceId] as const,
  async ([open, id]) => {
    if (!open || !id) return;
    loading.value = true;
    error.value = '';
    sources.value = undefined;
    try {
      sources.value = await getPurchaseInvoiceSources(id);
    } catch (error_) {
      error.value = errorText(error_);
    } finally {
      loading.value = false;
    }
  },
  { immediate: true },
);
</script>

<template>
  <Modal
    :open="open"
    :title="`${title ?? '集中收票'} · 查看来源${
      sources ? `（${sources.code ?? sources.invoiceNo ?? ''}）` : ''
    }`"
    width="1080px"
    :footer="null"
    @cancel="emit('close')"
  >
    <Alert v-if="error" type="error" :message="error" show-icon />
    <Spin :spinning="loading">
      <InvoiceSourceTable
        v-if="sources"
        :orders="sources.orders"
        :currency="sources.currency"
        @open="(order) => emit('openOrder', order)"
      />
    </Spin>
  </Modal>
</template>
