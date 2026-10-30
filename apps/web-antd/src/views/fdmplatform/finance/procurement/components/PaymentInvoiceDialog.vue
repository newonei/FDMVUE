<script setup lang="ts">
import type { PurchaseInvoice } from '#/api/fdmplatform/procurement';
import type { ProcurementFinanceRecord } from '#/api/fdmplatform/procurement-finance';

import { computed, ref, watch } from 'vue';

import { Alert, Button, Modal, Radio, Select } from 'ant-design-vue';
import BigNumber from 'bignumber.js';

import {
  assignInvoicePayment,
  getOrderInvoices,
} from '#/api/fdmplatform/procurement';

import { errorText } from '../../../data';
import InvoiceUpload from './InvoiceUpload.vue';

/**
 * 付款记录下登记付款发票（金智付款发票挂「付款计划/记录」）：上传发票原件登记，
 * 或把采购单上已登记、还没挂付款的发票挂过来。发票仍计入采购单收票合计。
 */
const props = defineProps<{
  contractId: string;
  open: boolean;
  orderId: string;
  payment?: ProcurementFinanceRecord;
}>();
const emit = defineEmits<{ close: []; saved: [] }>();

const mode = ref<'existing' | 'new'>('new');
const loose = ref<PurchaseInvoice[]>([]);
const existingId = ref<string>();
const saving = ref(false);
const error = ref('');
let key = crypto.randomUUID();

const currency = computed(() => props.payment?.currency ?? 'CNY');
/** 默认带入这笔付款还没收票的金额 */
const gap = computed(() => {
  if (!props.payment) return undefined;
  const paid = new BigNumber(
    String(props.payment.summary?.paidAmount ?? props.payment.amount ?? ''),
  );
  const value = paid.minus(String(props.payment.invoicedAmount ?? 0));
  return value.isFinite() && value.gt(0) ? value.toFixed(0) : undefined;
});

watch(
  () => props.open,
  async (open) => {
    if (!open || !props.payment) return;
    key = crypto.randomUUID();
    error.value = '';
    existingId.value = undefined;
    mode.value = 'new';
    try {
      const result = await getOrderInvoices(props.contractId, props.orderId);
      loose.value = result.invoices.filter(
        (row) => row.status === 'VALID' && !row.paymentId,
      );
    } catch (error_) {
      error.value = errorText(error_);
    }
  },
  { immediate: true },
);

async function attach() {
  if (!props.payment) return;
  if (!existingId.value) {
    error.value = '请选择发票';
    return;
  }
  saving.value = true;
  error.value = '';
  try {
    await assignInvoicePayment(existingId.value, {
      idempotencyKey: key,
      paymentId: props.payment.id,
    });
    emit('saved');
  } catch (error_) {
    key = crypto.randomUUID();
    error.value = errorText(error_);
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <Modal
    :open="open"
    :title="`付款发票 · ${payment?.code ?? ''}`"
    width="720px"
    :mask-closable="false"
    @cancel="emit('close')"
  >
    <div class="invoice">
      <Alert v-if="error" type="error" :message="error" show-icon />
      <Radio.Group v-model:value="mode" button-style="solid">
        <Radio.Button value="new">上传发票</Radio.Button>
        <Radio.Button value="existing" :disabled="loose.length === 0">
          挂已登记的发票{{ loose.length > 0 ? `（${loose.length}）` : '' }}
        </Radio.Button>
      </Radio.Group>
      <label v-if="mode === 'existing'">
        <span>采购单上还没挂付款的发票</span>
        <Select
          v-model:value="existingId"
          :options="
            loose.map((row) => ({
              value: row.id,
              label: `${row.invoiceNo ?? row.file?.name ?? '发票'} · ${row.invoiceDate} · ${currency} ${new BigNumber(String(row.amount)).toFormat(2)}`,
            }))
          "
          placeholder="选择发票"
        />
      </label>
      <InvoiceUpload
        v-else-if="payment"
        :contract-id="contractId"
        :order-id="orderId"
        :payment-id="payment.id"
        :currency="currency"
        :default-amount="gap"
        @saved="emit('saved')"
      />
    </div>
    <template #footer>
      <Button @click="emit('close')">取消</Button>
      <Button
        v-if="mode === 'existing'"
        type="primary"
        :loading="saving"
        @click="attach"
      >
        挂到这笔付款
      </Button>
    </template>
  </Modal>
</template>

<style scoped>
.invoice {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

label {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 13px;
}

label span {
  color: hsl(var(--muted-foreground));
}
</style>
