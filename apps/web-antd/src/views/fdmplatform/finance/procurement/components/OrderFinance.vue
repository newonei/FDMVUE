<script setup lang="ts">
import type {
  ProcurementFinanceRecord,
  ProcurementFinanceType,
} from '#/api/fdmplatform/procurement-finance';

import { computed, onBeforeUnmount, ref, watch } from 'vue';

import {
  Alert,
  Button,
  Card,
  Descriptions,
  Space,
  Table,
  Tag,
} from 'ant-design-vue';

import { getProcurementFinanceSummary } from '#/api/fdmplatform/procurement-finance';

import { errorText } from '../../../data';
import BusinessDocumentDetail from '../../../documents/BusinessDocumentDetail.vue';
import { useRouteOwner } from '../../../documents/useRouteOwner';
import { financeStatus, financeTitles, hasPayableBalance } from '../model';
import FinanceDocument from './FinanceDocument.vue';
const props = defineProps<{
  contractId: string;
  mode: 'costs' | 'payments';
  orderId: string;
}>();
const emit = defineEmits<{ busy: [value: boolean]; changed: [] }>();
const active = useRouteOwner();
const summary = ref<Record<string, unknown>>({});
const pageError = ref('');
const loading = ref(false);
const open = ref(false);
const selectedId = ref<string>();
const standaloneId = ref<string>();
watch(
  () => open.value || !!standaloneId.value,
  (value) => emit('busy', value),
);
onBeforeUnmount(() => emit('busy', false));
const type = ref<ProcurementFinanceType>('REQUEST');
const context = ref<Record<string, unknown>>({});
let sequence = 0;
const sections = computed(() =>
  props.mode === 'costs'
    ? [{ key: 'costAllocations', type: 'COST_ALLOCATION' as const }]
    : [
        { key: 'plans', type: 'PAYMENT_PLAN' as const },
        { key: 'requests', type: 'REQUEST' as const },
        { key: 'payments', type: 'PAYMENT' as const },
        { key: 'reimbursements', type: 'REIMBURSEMENT' as const },
        { key: 'expensePayments', type: 'PAYMENT' as const },
      ],
);
function records(key: string) {
  return (
    Array.isArray(summary.value[key]) ? summary.value[key] : []
  ) as ProcurementFinanceRecord[];
}
async function load() {
  const run = ++sequence;
  loading.value = true;
  pageError.value = '';
  try {
    const value = await getProcurementFinanceSummary(
      props.contractId,
      props.orderId,
    );
    if (run === sequence) summary.value = value;
  } catch (error) {
    if (run === sequence) pageError.value = errorText(error);
  } finally {
    if (run === sequence) loading.value = false;
  }
}
function create(
  kind: ProcurementFinanceType,
  initial: Record<string, unknown> = {},
) {
  selectedId.value = undefined;
  standaloneId.value = undefined;
  type.value = kind;
  context.value = {
    contractId: props.contractId,
    orderId: props.orderId,
    currency: summary.value.currency,
    ...initial,
  };
  open.value = true;
}
function show(record: ProcurementFinanceRecord) {
  if (record.standaloneId) {
    standaloneId.value = record.standaloneId;
    return;
  }
  type.value = record.type;
  selectedId.value = record.id;
  context.value = {};
  open.value = true;
}
function updated() {
  void load();
  emit('changed');
}
watch(
  () => [props.contractId, props.orderId],
  () => {
    open.value = false;
    standaloneId.value = undefined;
    void load();
  },
  { immediate: true },
);
</script>
<template>
  <Space direction="vertical" size="middle" style="width: 100%">
    <Alert v-if="pageError" type="error" :message="pageError" /><Descriptions
      bordered
      size="small"
      :column="3"
    >
      <Descriptions.Item label="采购货款">
        {{ summary.currency }} {{ summary.orderAmount }}
</Descriptions.Item><Descriptions.Item label="有效请款占用">
        {{ summary.requestedAmount }}
</Descriptions.Item><Descriptions.Item label="实际已付款">
        {{ summary.paidAmount }}
</Descriptions.Item><Descriptions.Item label="尚可请款">
        {{ summary.availableRequestAmount }}
</Descriptions.Item><Descriptions.Item label="尚未付款">
        {{ summary.unpaidAmount }}
      </Descriptions.Item>
</Descriptions><Space v-if="mode === 'payments'" wrap>
      <Button
        type="primary"
        :disabled="!hasPayableBalance(summary.availableRequestAmount)"
        @click="create('REQUEST', { amount: summary.availableRequestAmount })"
      >
        发起采购请款
</Button><Button @click="create('PAYMENT_PLAN')">安排分期付款</Button><Button @click="create('REIMBURSEMENT')">新建关联报销</Button>
</Space><Space v-else>
      <Button
        type="primary"
        @click="
          create('COST_ALLOCATION', {
            sourceType: 'PURCHASE_ORDER',
            costScope: 'ORDER',
          })
        "
      >
        新建货款成本分配
</Button><Alert
        type="info"
        message="成本归属独立于付款主体。请款或付款不会再次累计同一成本来源。"
      />
</Space><Button :loading="loading" @click="load">刷新进度</Button><Card
      v-for="section in sections"
      :key="section.key"
      :title="
        section.key === 'expensePayments'
          ? '报销费用实际付款'
          : financeTitles[section.type]
      "
      size="small"
    >
      <Table
        :data-source="records(section.key)"
        row-key="id"
        :pagination="false"
        :columns="[
          { title: '单据号 / 名称', key: 'name' },
          { title: '金额', dataIndex: 'amount' },
          { title: '币种', dataIndex: 'currency' },
          { title: '状态', key: 'state' },
        ]"
      >
        <template #bodyCell="{ column, record }">
          <Button
            v-if="column.key === 'name'"
            type="link"
            @click="show(record as ProcurementFinanceRecord)"
          >
            {{ record.code }} · {{ record.name }}
</Button><Tag v-else-if="column.key === 'state'">
            {{ financeStatus(record.status) }}
          </Tag>
        </template>
      </Table>
</Card><FinanceDocument
      :open="open && active"
      :type="type"
      :record-id="selectedId"
      :context="context"
      @close="open = false"
      @updated="updated"
    /><BusinessDocumentDetail
      :id="standaloneId"
      :open="Boolean(standaloneId) && active"
      embedded
      @close="standaloneId = undefined"
      @updated="updated"
    />
  </Space>
</template>
