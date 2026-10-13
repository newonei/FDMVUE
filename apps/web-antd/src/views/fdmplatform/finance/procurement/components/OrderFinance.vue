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
  message,
  Space,
  Table,
  Tag,
} from 'ant-design-vue';
import BigNumber from 'bignumber.js';

import {
  getProcurementFinanceSummary,
  procurementFinanceAction,
} from '#/api/fdmplatform/procurement-finance';

import { errorText } from '../../../data';
import BusinessDocumentDetail from '../../../documents/BusinessDocumentDetail.vue';
import { useRouteOwner } from '../../../documents/useRouteOwner';
import {
  financeStatus,
  financeTitles,
  hasPayableBalance,
  invoiceStates,
} from '../model';
import FinanceDocument from './FinanceDocument.vue';
import PaymentInvoiceDialog from './PaymentInvoiceDialog.vue';
import PaymentRecordDialog from './PaymentRecordDialog.vue';
import RefundTable from './RefundTable.vue';

/**
 * 采购单的付款与费用：付款记录（金智「付款记录」）每付一笔登记一张，分期就是多张；
 * 每张付款记录下挂付款发票。历史请款单和付款计划只读保留，不再新建。
 */
const props = defineProps<{
  contractId: string;
  /** 采购单已收票合计（付款表单的数据参考） */
  invoiced?: unknown;
  mode: 'costs' | 'payments';
  orderCode?: string;
  orderId: string;
  supplierName?: string;
}>();
const emit = defineEmits<{ busy: [value: boolean]; changed: [] }>();
const active = useRouteOwner();
const summary = ref<Record<string, unknown>>({});
const pageError = ref('');
const loading = ref(false);
const open = ref(false);
const selectedId = ref<string>();
const standaloneId = ref<string>();
const paymentOpen = ref(false);
const invoiceFor = ref<ProcurementFinanceRecord>();
watch(
  () =>
    open.value ||
    !!standaloneId.value ||
    paymentOpen.value ||
    !!invoiceFor.value,
  (value) => emit('busy', value),
);
onBeforeUnmount(() => emit('busy', false));
const type = ref<ProcurementFinanceType>('PAYMENT');
const context = ref<Record<string, unknown>>({});
let sequence = 0;
/** 历史请款和付款计划只有存在时才显示；新付款一律走付款记录。 */
const legacySections = computed(() =>
  [
    { key: 'plans', type: 'PAYMENT_PLAN' as const },
    { key: 'requests', type: 'REQUEST' as const },
  ].filter((section) => records(section.key).length > 0),
);
const paymentRecords = computed(() =>
  records('payments').toSorted((a, b) =>
    String(b.paidAt ?? '').localeCompare(String(a.paidAt ?? '')),
  ),
);
function records(key: string) {
  return (
    Array.isArray(summary.value[key]) ? summary.value[key] : []
  ) as ProcurementFinanceRecord[];
}
function money(value: unknown) {
  const amount = new BigNumber(String(value ?? ''));
  return amount.isFinite() ? amount.toFormat(2) : '—';
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
function paymentSaved(record: ProcurementFinanceRecord) {
  paymentOpen.value = false;
  message.success(`已登记付款 ${record.code}`);
  updated();
}
function invoiceSaved() {
  invoiceFor.value = undefined;
  message.success('付款发票已保存');
  updated();
}
async function toggleNoInvoice(record: ProcurementFinanceRecord) {
  try {
    await procurementFinanceAction(record.id, {
      action: 'SET_NO_INVOICE',
      expectedVersion: record.version,
      idempotencyKey: crypto.randomUUID(),
      payload: { noInvoice: !record.noInvoice },
    });
    updated();
  } catch (error) {
    message.error(errorText(error));
  }
}
watch(
  () => [props.contractId, props.orderId],
  () => {
    open.value = false;
    standaloneId.value = undefined;
    paymentOpen.value = false;
    invoiceFor.value = undefined;
    void load();
  },
  { immediate: true },
);
</script>
<template>
  <Space direction="vertical" size="middle" style="width: 100%">
    <Alert v-if="pageError" type="error" :message="pageError" />
    <Descriptions bordered size="small" :column="mode === 'payments' ? 4 : 3">
      <Descriptions.Item label="采购货款">
        {{ summary.currency }} {{ money(summary.orderAmount) }}
      </Descriptions.Item>
      <Descriptions.Item label="实际已付款">
        {{ money(summary.paidAmount) }}
      </Descriptions.Item>
      <Descriptions.Item label="尚未付款">
        {{ money(summary.unpaidAmount) }}
      </Descriptions.Item>
      <Descriptions.Item v-if="mode === 'payments'" label="还可登记付款">
        {{ money(summary.availablePaymentAmount) }}
      </Descriptions.Item>
    </Descriptions>
    <Space v-if="mode === 'payments'" wrap>
      <Button
        type="primary"
        :disabled="!hasPayableBalance(summary.availablePaymentAmount)"
        :title="
          hasPayableBalance(summary.availablePaymentAmount)
            ? undefined
            : '已付清，或付款摘要未读取'
        "
        @click="paymentOpen = true"
      >
        登记付款
      </Button>
      <Button @click="create('REIMBURSEMENT')">新建关联报销</Button>
      <Button :loading="loading" @click="load">刷新</Button>
    </Space>
    <Space v-else>
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
      </Button>
      <Button :loading="loading" @click="load">刷新</Button>
      <Alert
        type="info"
        message="成本归属独立于付款主体。付款不会再次累计同一成本来源。"
      />
    </Space>

    <template v-if="mode === 'payments'">
      <Card title="付款记录" size="small">
        <Table
          :data-source="paymentRecords"
          row-key="id"
          size="small"
          :pagination="false"
          :columns="[
            { title: '付款单号', key: 'code' },
            { title: '付款日期', dataIndex: 'paidAt', width: 110 },
            { title: '金额', key: 'amount', align: 'right' },
            { title: '类型', key: 'kind' },
            { title: '所属公司 / 付款方式', key: 'payer' },
            { title: '付款分类', dataIndex: 'paymentMethod' },
            { title: '收票', key: 'invoice' },
            { title: '状态', key: 'state' },
          ]"
        >
          <template #emptyText>
            还没有付款记录；每付一笔钱点「登记付款」登记一张
          </template>
          <template #bodyCell="{ column, record }">
            <Button
              v-if="column.key === 'code'"
              type="link"
              size="small"
              @click="show(record as ProcurementFinanceRecord)"
            >
              {{ record.code }}
            </Button>
            <span v-else-if="column.key === 'amount'" class="num">
              {{ record.currency }} {{ money(record.amount) }}
              <small
                v-if="
                  record.summary?.paidAmount !== undefined &&
                  !new BigNumber(String(record.summary.paidAmount)).eq(
                    String(record.amount),
                  )
                "
                class="muted"
              >
                净付 {{ money(record.summary.paidAmount) }}
              </small>
            </span>
            <span v-else-if="column.key === 'kind'">
              {{
                record.batchNo
                  ? '集中付款'
                  : record.sourceType === 'PURCHASE_ORDER'
                    ? '常规付款'
                    : '历史请款付款'
              }}
              <small v-if="record.batchNo" class="muted">{{
                record.batchNo
              }}</small>
            </span>
            <span v-else-if="column.key === 'payer'">
              {{ record.payerSnapshot?.name ?? record.payerEntityId ?? '—' }}
              <small class="muted">{{ record.payerAccount }}</small>
            </span>
            <template v-else-if="column.key === 'invoice'">
              <Tag
                v-if="record.invoiceState"
                :color="invoiceStates[record.invoiceState]?.color"
              >
                {{ invoiceStates[record.invoiceState]?.label }}
              </Tag>
              <small
                v-if="new BigNumber(String(record.invoicedAmount ?? 0)).gt(0)"
                class="muted"
              >
                {{ money(record.invoicedAmount) }}
              </small>
            </template>
            <Tag v-else-if="column.key === 'state'">
              {{ financeStatus(record.status) }}
            </Tag>
          </template>
          <template #expandedRowRender="{ record }">
            <div class="invoices">
              <Space wrap>
                <Button
                  size="small"
                  :disabled="
                    !record.allowedActions?.includes('SET_NO_INVOICE') ||
                    record.noInvoice
                  "
                  @click="invoiceFor = record as ProcurementFinanceRecord"
                >
                  登记付款发票
                </Button>
                <Button
                  v-if="record.allowedActions?.includes('SET_NO_INVOICE')"
                  size="small"
                  type="link"
                  @click="toggleNoInvoice(record as ProcurementFinanceRecord)"
                >
                  {{ record.noInvoice ? '改为需要发票' : '这笔无需发票' }}
                </Button>
                <span v-if="record.payeeName" class="muted">
                  收款账户信息：{{ record.payeeName }}
                  {{ record.payeeAccount ?? '' }}
                </span>
                <span v-if="record.remark" class="muted">
                  备注：{{ record.remark }}
                </span>
              </Space>
              <Table
                v-if="(record.invoices ?? []).length > 0"
                :data-source="record.invoices"
                row-key="id"
                size="small"
                :pagination="false"
                :columns="[
                  { title: '发票号码', dataIndex: 'invoiceNo' },
                  { title: '开票日期', dataIndex: 'invoiceDate' },
                  { title: '税率', key: 'tax' },
                  { title: '金额', key: 'amount', align: 'right' },
                  { title: '状态', key: 'status' },
                ]"
              >
                <template #bodyCell="{ column: col, record: invoice }">
                  <span v-if="col.key === 'tax'">{{
                    invoice.taxRate === null || invoice.taxRate === undefined
                      ? '—'
                      : `${invoice.taxRate}%`
                  }}</span>
                  <span v-else-if="col.key === 'amount'" class="num">
                    {{ money(invoice.amount) }}
                  </span>
                  <Tag
                    v-else-if="col.key === 'status'"
                    :color="invoice.status === 'VALID' ? 'success' : 'default'"
                  >
                    {{ invoice.status === 'VALID' ? '有效' : '已作废' }}
                  </Tag>
                </template>
              </Table>
            </div>
          </template>
        </Table>
      </Card>
      <Card
        v-for="section in legacySections"
        :key="section.key"
        :title="`${financeTitles[section.type]}（历史）`"
        size="small"
      >
        <Table
          :data-source="records(section.key)"
          row-key="id"
          size="small"
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
            </Button>
            <Tag v-else-if="column.key === 'state'">
              {{ financeStatus(record.status) }}
            </Tag>
          </template>
        </Table>
      </Card>
    </template>
    <Card
      v-for="section in mode === 'costs'
        ? [{ key: 'costAllocations', title: financeTitles.COST_ALLOCATION }]
        : [
            { key: 'reimbursements', title: financeTitles.REIMBURSEMENT },
            { key: 'expensePayments', title: '报销费用实际付款' },
          ]"
      :key="section.key"
      :title="section.title"
      size="small"
    >
      <Table
        :data-source="records(section.key)"
        row-key="id"
        size="small"
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
          </Button>
          <Tag v-else-if="column.key === 'state'">
            {{ financeStatus(record.status) }}
          </Tag>
        </template>
      </Table>
    </Card>
    <Card v-if="mode === 'payments'" title="退款记录" size="small">
      <RefundTable
        :order-id="orderId"
        @open-payment="
          (id) => show({ id, type: 'PAYMENT' } as ProcurementFinanceRecord)
        "
      />
    </Card>
    <FinanceDocument
      :open="open && active"
      :type="type"
      :record-id="selectedId"
      :context="context"
      @close="open = false"
      @updated="updated"
    />
    <BusinessDocumentDetail
      :id="standaloneId"
      :open="Boolean(standaloneId) && active"
      embedded
      @close="standaloneId = undefined"
      @updated="updated"
    />
    <PaymentRecordDialog
      :open="paymentOpen && active"
      :contract-id="contractId"
      :order-id="orderId"
      :order-code="orderCode"
      :supplier-name="supplierName"
      :currency="String(summary.currency ?? '')"
      :available="summary.availablePaymentAmount"
      :previous="records('payments')"
      :reference="{
        orderAmount: summary.orderAmount,
        paid: summary.paidAmount,
        unpaid: summary.unpaidAmount,
        invoiced,
      }"
      @close="paymentOpen = false"
      @saved="paymentSaved"
    />
    <PaymentInvoiceDialog
      :open="!!invoiceFor && active"
      :contract-id="contractId"
      :order-id="orderId"
      :payment="invoiceFor"
      @close="invoiceFor = undefined"
      @saved="invoiceSaved"
    />
  </Space>
</template>

<style scoped>
.num {
  font-variant-numeric: tabular-nums;
}

.muted {
  display: block;
  font-size: 12px;
  color: hsl(var(--muted-foreground));
}

.invoices {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.invoices .muted {
  display: inline;
}
</style>
