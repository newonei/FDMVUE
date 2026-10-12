<script setup lang="ts">
import type {
  ProcurementOrderView,
  PurchaseInvoice,
} from '#/api/fdmplatform/procurement';

import { computed, h, ref, watch } from 'vue';

import {
  Alert,
  Button,
  Checkbox,
  Input,
  InputNumber,
  message,
  Modal,
  Select,
  Table,
  Tag,
} from 'ant-design-vue';
import BigNumber from 'bignumber.js';

import {
  createPurchaseInvoice,
  getOrderInvoices,
  setOrderNoInvoice,
  voidPurchaseInvoice,
} from '#/api/fdmplatform/procurement';

import { errorText } from '../../../data';
import { localDate } from '../../quotes/comparison';

/**
 * 采购收票（金智「付款发票」）：和入库、付款各自独立；发票合计到采购金额，或勾「无需收票」，收票才算办完。
 */
const props = defineProps<{
  orderAmount?: unknown;
  view: ProcurementOrderView;
}>();
const emit = defineEmits<{ changed: [] }>();

const TYPE_NAMES: Record<PurchaseInvoice['invoiceType'], string> = {
  SPECIAL: '增值税专票',
  ORDINARY: '增值税普票',
  OTHER: '其他',
};
const today = localDate();
const invoices = ref<PurchaseInvoice[]>([]);
const invoiced = ref('0');
const loading = ref(false);
const saving = ref(false);
const error = ref('');
const form = ref({
  invoiceNo: '',
  invoiceDate: today,
  invoiceType: 'SPECIAL' as PurchaseInvoice['invoiceType'],
  taxRate: '13',
  amount: undefined as string | undefined,
  remark: '',
});
let idempotencyKey = crypto.randomUUID();

const currency = computed(() => String(props.view.order.currency ?? 'CNY'));
const gap = computed(() => {
  const amount = new BigNumber(String(props.orderAmount ?? ''));
  if (!amount.isFinite()) return undefined;
  return amount.minus(invoiced.value);
});
const noInvoice = computed(() => !!props.view.details.noInvoice);

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const result = await getOrderInvoices(props.view.contractId, props.view.id);
    invoices.value = result.invoices.toSorted((a, b) =>
      b.createdAt.localeCompare(a.createdAt),
    );
    invoiced.value = String(result.invoicedAmount);
    if (!form.value.amount && gap.value?.gt(0))
      form.value.amount = gap.value.toFixed(2);
  } catch (error_) {
    error.value = errorText(error_);
  } finally {
    loading.value = false;
  }
}
async function save() {
  if (!form.value.invoiceNo.trim()) {
    error.value = '请填写发票号码';
    return;
  }
  if (!new BigNumber(form.value.amount ?? '').gt(0)) {
    error.value = '发票金额须大于 0';
    return;
  }
  saving.value = true;
  error.value = '';
  try {
    await createPurchaseInvoice({
      idempotencyKey,
      contractId: props.view.contractId,
      orderId: props.view.id,
      invoiceNo: form.value.invoiceNo.trim(),
      invoiceDate: form.value.invoiceDate || undefined,
      invoiceType: form.value.invoiceType,
      taxRate: form.value.taxRate || undefined,
      amount: form.value.amount!,
      remark: form.value.remark.trim() || undefined,
    });
    idempotencyKey = crypto.randomUUID();
    message.success('发票已登记');
    form.value = {
      ...form.value,
      invoiceNo: '',
      amount: undefined,
      remark: '',
    };
    await load();
    emit('changed');
  } catch (error_) {
    error.value = errorText(error_);
  } finally {
    saving.value = false;
  }
}
function remove(invoice: PurchaseInvoice) {
  let reason = '';
  Modal.confirm({
    title: `作废发票 ${invoice.invoiceNo}？`,
    content: () =>
      h('div', [
        h('p', '作废后不再计入收票合计，记录保留。'),
        h(Input, {
          placeholder: '作废原因（必填）',
          'onUpdate:value': (value: string) => {
            reason = value;
          },
        }),
      ]),
    okText: '作废',
    okButtonProps: { danger: true },
    onOk: async () => {
      if (!reason.trim()) {
        message.error('请填写作废原因');
        throw new Error('missing reason');
      }
      await voidPurchaseInvoice(invoice.id, {
        idempotencyKey: crypto.randomUUID(),
        reason: reason.trim(),
      });
      message.success('发票已作废');
      await load();
      emit('changed');
    },
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

    <section class="entry" aria-label="登记收票">
      <label>
        <span>发票号码</span>
        <Input v-model:value="form.invoiceNo" placeholder="必填" />
      </label>
      <label>
        <span>开票日期</span>
        <Input v-model:value="form.invoiceDate" type="date" :max="today" />
      </label>
      <label>
        <span>发票类型</span>
        <Select
          v-model:value="form.invoiceType"
          :options="
            Object.entries(TYPE_NAMES).map(([value, label]) => ({
              value,
              label,
            }))
          "
        />
      </label>
      <label>
        <span>税率 %</span>
        <InputNumber
          v-model:value="form.taxRate"
          string-mode
          :min="0"
          :max="100"
          :controls="false"
          style="width: 100%"
        />
      </label>
      <label>
        <span>发票金额（{{ currency }}）</span>
        <InputNumber
          v-model:value="form.amount"
          string-mode
          :min="0"
          :controls="false"
          style="width: 100%"
        />
      </label>
      <label class="wide">
        <span>备注</span>
        <Input v-model:value="form.remark" />
      </label>
      <Button type="primary" :loading="saving" @click="save">登记收票</Button>
    </section>

    <Table
      size="small"
      row-key="id"
      :data-source="invoices"
      :loading="loading"
      :pagination="false"
      :columns="[
        { title: '发票号码', dataIndex: 'invoiceNo' },
        { title: '类型', key: 'type' },
        { title: '税率', key: 'tax' },
        { title: '金额', key: 'amount', align: 'right' },
        { title: '开票日期', dataIndex: 'invoiceDate' },
        { title: '状态', key: 'status' },
        { title: '', key: 'action', width: 70 },
      ]"
    >
      <template #emptyText>还没有登记发票</template>
      <template #bodyCell="{ column, record }">
        <span v-if="column.key === 'type'">{{
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
        <Tag
          v-else-if="column.key === 'status'"
          :color="record.status === 'VALID' ? 'success' : 'default'"
          :title="record.voidReason"
        >
          {{ record.status === 'VALID' ? '有效' : '已作废' }}
        </Tag>
        <Button
          v-else-if="column.key === 'action' && record.status === 'VALID'"
          type="link"
          size="small"
          danger
          @click="remove(record as PurchaseInvoice)"
        >
          作废
        </Button>
      </template>
    </Table>
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

.summary span,
.entry span {
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

.entry {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 10px 12px;
  align-items: end;
}

.entry label {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.entry .wide {
  grid-column: 1 / 5;
}

.num {
  font-variant-numeric: tabular-nums;
}

@media (max-width: 900px) {
  .entry {
    grid-template-columns: minmax(0, 1fr);
  }

  .entry .wide {
    grid-column: auto;
  }
}
</style>
