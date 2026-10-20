<script setup lang="ts">
import type {
  ProcurementOrderView,
  PurchaseInvoice,
} from '#/api/fdmplatform/procurement';

import { computed, ref, watch } from 'vue';

import { downloadFileFromBlobPart } from '@vben/utils';

import {
  Alert,
  Button,
  Checkbox,
  message,
  Modal,
  Table,
  Tag,
} from 'ant-design-vue';
import BigNumber from 'bignumber.js';

import {
  downloadPurchaseInvoiceFile,
  getOrderInvoices,
  setOrderNoInvoice,
} from '#/api/fdmplatform/procurement';

import { errorText } from '../../../data';
import InvoiceUpload from '../../../finance/procurement/components/InvoiceUpload.vue';
import { confirmVoidInvoice } from '../../../finance/procurement/components/void-invoice';

/**
 * 采购收票（金智「付款发票」）：和入库、付款各自独立；发票合计到采购金额，或勾「无需收票」，收票才算办完。
 */
const props = defineProps<{
  orderAmount?: unknown;
  /** 本单付款记录：发票可挂到某一笔付款下（金智付款发票的「付款计划/记录」） */
  payments?: Array<Record<string, unknown>>;
  view: ProcurementOrderView;
}>();
const emit = defineEmits<{ changed: [] }>();

const TYPE_NAMES: Record<PurchaseInvoice['invoiceType'], string> = {
  SPECIAL: '增值税专票',
  ORDINARY: '增值税普票',
  OTHER: '其他',
};
const invoices = ref<PurchaseInvoice[]>([]);
const invoiced = ref('0');
const loading = ref(false);
const editing = ref<PurchaseInvoice>();
const error = ref('');

const currency = computed(() => String(props.view.order.currency ?? 'CNY'));
const gap = computed(() => {
  const amount = new BigNumber(String(props.orderAmount ?? ''));
  if (!amount.isFinite()) return undefined;
  return amount.minus(invoiced.value);
});
const noInvoice = computed(() => !!props.view.details.noInvoice);
const paymentOptions = computed(() =>
  (props.payments ?? [])
    .filter((row) =>
      ['CONFIRMED', 'PARTIALLY_REVERSED', 'REVERSED'].includes(
        String(row.status),
      ),
    )
    .map((row) => ({
      value: String(row.id),
      label: `${String(row.code)} · ${String(row.paidAt ?? '')} · ${new BigNumber(String(row.amount ?? 0)).toFormat(2)}`,
    })),
);

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const result = await getOrderInvoices(props.view.contractId, props.view.id);
    invoices.value = result.invoices.toSorted((a, b) =>
      b.createdAt.localeCompare(a.createdAt),
    );
    invoiced.value = String(result.invoicedAmount);
  } catch (error_) {
    error.value = errorText(error_);
  } finally {
    loading.value = false;
  }
}
async function saved() {
  message.success('发票已登记');
  await load();
  emit('changed');
}
async function download(invoice: PurchaseInvoice) {
  try {
    const blob = await downloadPurchaseInvoiceFile(invoice.id);
    downloadFileFromBlobPart({
      source: blob,
      fileName: invoice.file?.name ?? `${invoice.invoiceNo ?? '发票'}.pdf`,
    });
  } catch (error_) {
    error.value = errorText(error_);
  }
}
async function edited() {
  editing.value = undefined;
  message.success('发票已修改');
  await load();
  emit('changed');
}
function remove(invoice: PurchaseInvoice) {
  confirmVoidInvoice(invoice, async () => {
    await load();
    emit('changed');
  });
}
async function toggleNoInvoice(value: boolean) {
  try {
    await setOrderNoInvoice(props.view.contractId, props.view.id, value);
    message.success(value ? '已标为无需收票' : '已改为需要收票');
    emit('changed');
  } catch (error_) {
    error.value = errorText(error_);
  }
}
watch(() => props.view.id, load, { immediate: true });
</script>

<template>
  <div class="invoices">
    <Alert v-if="error" type="error" :message="error" show-icon />
    <div class="summary">
      <div>
        <span>已收票</span>
        <b>{{ currency }} {{ new BigNumber(invoiced).toFormat(2) }}</b>
      </div>
      <div>
        <span>收票差额</span>
        <b :class="{ due: gap?.gt(0) && !noInvoice }">{{
          gap === undefined ? '—' : `${currency} ${gap.toFormat(2)}`
        }}</b>
      </div>
      <Checkbox
        :checked="noInvoice"
        @update:checked="(value) => toggleNoInvoice(!!value)"
      >
        这张单无需收票（淘宝、个体等不开票）
      </Checkbox>
    </div>

    <InvoiceUpload
      :contract-id="view.contractId"
      :order-id="view.id"
      :currency="currency"
      :default-amount="gap?.gt(0) ? gap.toFixed(2) : undefined"
      :remaining="gap?.toFixed(2)"
      :payment-options="paymentOptions"
      @saved="saved"
    />

    <Table
      size="small"
      row-key="id"
      :data-source="invoices"
      :loading="loading"
      :pagination="false"
      :columns="[
        { title: '发票号码', key: 'invoiceNo' },
        { title: '原件', key: 'file' },
        { title: '类型', key: 'type' },
        { title: '税率', key: 'tax' },
        { title: '金额', key: 'amount', align: 'right' },
        { title: '开票日期', dataIndex: 'invoiceDate' },
        { title: '对应付款', key: 'payment' },
        { title: '状态', key: 'status' },
        { title: '', key: 'action', width: 100 },
      ]"
    >
      <template #emptyText>还没有登记发票</template>
      <template #bodyCell="{ column, record }">
        <span v-if="column.key === 'invoiceNo'">{{
          record.invoiceNo ?? '—'
        }}</span>
        <Button
          v-else-if="column.key === 'file' && record.file"
          type="link"
          size="small"
          @click="download(record as PurchaseInvoice)"
        >
          {{ record.file.name }}
        </Button>
        <span v-else-if="column.key === 'type'">{{
          TYPE_NAMES[record.invoiceType as PurchaseInvoice['invoiceType']]
        }}</span>
        <span v-else-if="column.key === 'tax'">{{
          record.taxRate === null || record.taxRate === undefined
            ? '—'
            : `${record.taxRate}%`
        }}</span>
        <span v-else-if="column.key === 'amount'" class="num">{{
          new BigNumber(String(record.amount)).toFormat(2)
        }}</span>
        <span v-else-if="column.key === 'payment'">{{
          record.paymentCode ?? '—'
        }}</span>
        <Tag
          v-else-if="column.key === 'status'"
          :color="record.status === 'VALID' ? 'success' : 'default'"
          :title="record.voidReason"
        >
          {{ record.status === 'VALID' ? '有效' : '已作废' }}
        </Tag>
        <span
          v-else-if="column.key === 'action' && record.status === 'VALID'"
          class="actions"
        >
          <Button
            type="link"
            size="small"
            @click="editing = record as PurchaseInvoice"
          >
            修改
          </Button>
          <Button
            type="link"
            size="small"
            danger
            @click="remove(record as PurchaseInvoice)"
          >
            作废
          </Button>
        </span>
      </template>
    </Table>
    <Modal
      :open="!!editing"
      :title="`修改付款发票 ${editing?.invoiceNo ?? ''}`"
      width="760px"
      :footer="null"
      :mask-closable="false"
      destroy-on-close
      @cancel="editing = undefined"
    >
      <InvoiceUpload
        v-if="editing"
        :invoice="editing"
        :contract-id="view.contractId"
        :order-id="view.id"
        :currency="currency"
        :remaining="gap?.toFixed(2)"
        :payment-options="paymentOptions"
        @saved="edited"
      />
    </Modal>
  </div>
</template>

<style scoped>
.invoices {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.summary {
  display: flex;
  flex-wrap: wrap;
  gap: 32px;
  align-items: center;
  padding: 12px 16px;
  background: hsl(var(--accent));
  border-radius: 8px;
}

.summary div {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.summary span {
  font-size: 12px;
  color: hsl(var(--muted-foreground));
}

.summary b {
  font-size: 18px;
  font-variant-numeric: tabular-nums;
}

.summary b.due {
  color: hsl(var(--destructive));
}

.num {
  font-variant-numeric: tabular-nums;
}

.actions {
  white-space: nowrap;
}
</style>
