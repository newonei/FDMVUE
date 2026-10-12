<script setup lang="ts">
import type { Directory } from '#/api/fdmplatform';
import type { ProcurementRefund } from '#/api/fdmplatform/procurement-finance';

import { onMounted, ref, watch } from 'vue';

import { Alert, Button, Input, Table } from 'ant-design-vue';

import { getDirectory } from '#/api/fdmplatform';
import { getProcurementRefunds } from '#/api/fdmplatform/procurement-finance';

import { errorText } from '../../../data';
import { personName } from '../../../directory';
import { money } from '../../../purchase/warehouse/model';

import '../../../purchase/warehouse/warehouse-pages.css';

defineOptions({ name: 'FdmPlatformProcurementRefunds' });

/**
 * 采购退款记录（金智「采购退款记录」）：各付款单上登记的退款 / 冲销。
 * 传 orderId 时是采购单里的精简表；不传是总列表，可按日期和关键字查。
 * 退款在原付款单上登记，点付款单号打开原付款单。
 */
const props = defineProps<{ contractId?: string; orderId?: string }>();
const emit = defineEmits<{ openPayment: [id: string] }>();

const rows = ref<ProcurementRefund[]>([]);
const total = ref(0);
const pageNo = ref(1);
const keyword = ref('');
const from = ref('');
const to = ref('');
const directory = ref<Directory>();
const loading = ref(false);
const error = ref('');

const columns = [
  { title: '退款日期', key: 'date', width: 110 },
  { title: '原付款单', key: 'payment', width: 170 },
  ...(props.orderId
    ? []
    : [{ title: '采购单 / 供应商', key: 'order', width: 220 }]),
  { title: '收款人', key: 'payee', width: 160 },
  { title: '退款金额', key: 'amount', width: 140, align: 'right' as const },
  { title: '原因 / 凭据', key: 'reason', width: 240 },
  { title: '经办', key: 'actor', width: 90 },
];

async function load(reset = false) {
  if (reset) pageNo.value = 1;
  loading.value = true;
  error.value = '';
  try {
    const page = await getProcurementRefunds({
      pageNo: pageNo.value,
      pageSize: 20,
      contractId: props.contractId || undefined,
      orderId: props.orderId,
      keyword: keyword.value.trim() || undefined,
      from: from.value || undefined,
      to: to.value || undefined,
    });
    rows.value = page.list;
    total.value = page.total;
  } catch (error_) {
    error.value = errorText(error_);
  } finally {
    loading.value = false;
  }
}
watch(
  () => [props.contractId, props.orderId],
  () => load(true),
);
onMounted(async () => {
  void load();
  try {
    directory.value = await getDirectory(0);
  } catch {
    // 只影响经办人显示
  }
});
defineExpose({ load });
</script>

<template>
  <div class="warehouse-page" :class="{ 'refund-compact': orderId }">
    <div v-if="!orderId" class="toolbar">
      <Input.Search
        v-model:value="keyword"
        allow-clear
        placeholder="付款单号、采购单、供应商、收款人、原因"
        style="width: 320px"
        @search="load(true)"
      />
      <Input
        v-model:value="from"
        type="date"
        style="width: 150px"
        aria-label="退款日期从"
        @change="load(true)"
      />
      <span class="muted">至</span>
      <Input
        v-model:value="to"
        type="date"
        style="width: 150px"
        aria-label="退款日期到"
        @change="load(true)"
      />
      <span class="grow"></span>
      <Button :loading="loading" @click="load()">刷新</Button>
    </div>
    <Alert v-if="error" type="error" :message="error" show-icon />
    <Table
      class="fdm-business-table"
      :size="orderId ? 'small' : 'middle'"
      table-layout="fixed"
      row-key="id"
      :columns="columns"
      :data-source="rows"
      :loading="loading"
      :scroll="{ x: orderId ? 910 : 1130 }"
      :pagination="
        orderId && total <= 20
          ? false
          : {
              current: pageNo,
              pageSize: 20,
              total,
              showSizeChanger: false,
              showTotal: (count: number) => `共 ${count} 笔`,
            }
      "
      @change="
        (pagination) => {
          pageNo = pagination.current ?? 1;
          load();
        }
      "
    >
      <template #emptyText>
        {{
          orderId
            ? '这张采购单还没有退款。供应商退回货款时，打开原付款单登记「退款 / 冲销」。'
            : '还没有采购退款记录。供应商退回货款时，在原付款单上登记「退款 / 冲销」。'
        }}
      </template>
      <template #bodyCell="{ column, record }">
        <span v-if="column.key === 'date'" class="num">{{
          record.occurredDate ?? '—'
        }}</span>
        <div v-else-if="column.key === 'payment'" class="cell">
          <Button
            type="link"
            size="small"
            style="padding: 0"
            @click="emit('openPayment', record.paymentId)"
          >
            {{ record.paymentCode ?? '查看付款单' }}
          </Button>
          <span class="muted">原付 {{ money(record.paymentAmount, record.currency) }}</span>
        </div>
        <div v-else-if="column.key === 'order'" class="cell">
          <span class="mono">{{ record.orderCode ?? '—' }}</span>
          <span class="muted ellipsis">{{ record.supplierName }}</span>
        </div>
        <span v-else-if="column.key === 'payee'" class="ellipsis">{{
          record.payeeName ?? '—'
        }}</span>
        <b v-else-if="column.key === 'amount'" class="num">{{
          money(record.amount, record.currency)
        }}</b>
        <div v-else-if="column.key === 'reason'" class="cell">
          <span class="ellipsis" :title="record.reason">{{
            record.reason
          }}</span>
          <span class="muted ellipsis" :title="record.evidenceRef">{{
            record.evidenceRef
          }}</span>
        </div>
        <span v-else-if="column.key === 'actor'" class="muted">{{
          personName(directory, record.actorId)
        }}</span>
      </template>
    </Table>
  </div>
</template>

<style scoped>
.refund-compact {
  padding: 0;
}
</style>
