<script setup lang="ts">
import type { DocumentRow } from '#/api/fdmplatform';
import type {
  ProcurementFinanceRecord,
  ProcurementFinanceType,
} from '#/api/fdmplatform/procurement-finance';

import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { useAccess } from '@vben/access';
import { Page } from '@vben/common-ui';

import {
  Alert,
  Button,
  Card,
  Input,
  message,
  Select,
  Space,
  Table,
  TableSummary,
  TableSummaryCell,
  TableSummaryRow,
  Tag,
} from 'ant-design-vue';

import {
  getProcurementFinancePage,
  getProcurementFinanceSummary,
} from '#/api/fdmplatform/procurement-finance';

import { useInMergedView } from '../../components/merged-view';
import { rows as businessRows, errorText } from '../../data';
import BusinessDocumentDetail from '../../documents/BusinessDocumentDetail.vue';
import { withoutDetailQuery } from '../../documents/navigation';
import { useRouteOwner } from '../../documents/useRouteOwner';
import OrderPicker from '../../purchase/manage/components/OrderPicker.vue';
import FinanceDocument from './components/FinanceDocument.vue';
import InvoiceSourcesDialog from './components/InvoiceSourcesDialog.vue';
import PaymentRecordDialog from './components/PaymentRecordDialog.vue';
import {
  financeRecordStatus,
  financeTitles,
  invoiceStates,
  PAYMENT_AUDIT,
  paymentSavedMessage,
  paymentStatus,
  reviewedPayment,
} from './model';

import '../../components/compact-tables.css';

const props = defineProps<{ type: ProcurementFinanceType }>();
const inMergedView = useInMergedView();
const route = useRoute();
const router = useRouter();
const active = useRouteOwner();
const effectiveType = computed(() =>
  props.type === 'REQUEST' && route.query.type === 'PAYMENT_PLAN'
    ? 'PAYMENT_PLAN'
    : props.type,
);
const rows = ref<ProcurementFinanceRecord[]>([]);
const total = ref(0);
const page = ref(1);
const keyword = ref('');
const status = ref<string>();
/** 采购付款里金智迁入的 9 千多条历史付款默认不混进来 */
const source = ref<'ALL' | 'JINZHI' | 'NATIVE'>('NATIVE');
const isPayment = computed(() => effectiveType.value === 'PAYMENT');
const { hasAccessByCodes } = useAccess();
const canAudit = computed(() => hasAccessByCodes([PAYMENT_AUDIT]));
type PaymentTab = 'ALL' | 'CONFIRMED' | 'DRAFT' | 'REJECTED' | 'SUBMITTED';
/** 付款记录按办理进度分页签；财务默认看待审核 */
const paymentTab = ref<PaymentTab>(canAudit.value ? 'SUBMITTED' : 'ALL');
const paymentTabs: Array<{ key: PaymentTab; label: string }> = [
  { key: 'SUBMITTED', label: '待财务审核' },
  { key: 'REJECTED', label: '财务退回' },
  { key: 'CONFIRMED', label: '已付款' },
  { key: 'DRAFT', label: '草稿' },
  { key: 'ALL', label: '全部' },
];
/** 待审核、退回的笔数（同样的来源、关键词筛选） */
const tabCounts = ref<Partial<Record<PaymentTab, number>>>({});
const listStatus = computed(() => {
  if (!isPayment.value) return status.value;
  return paymentTab.value === 'ALL' ? undefined : paymentTab.value;
});
function selectTab(value: PaymentTab) {
  if (paymentTab.value === value) return;
  paymentTab.value = value;
  page.value = 1;
  void load();
}
async function loadCounts(run: number) {
  const counts: Partial<Record<PaymentTab, number>> = {};
  await Promise.all(
    (['SUBMITTED', 'REJECTED'] as const).map(async (value) => {
      try {
        const result = await getProcurementFinancePage({
          type: 'PAYMENT',
          contractId: contractId.value,
          orderId: orderId.value,
          status: value,
          keyword: keyword.value || undefined,
          source: source.value === 'ALL' ? undefined : source.value,
          pageNo: 1,
          pageSize: 1,
        });
        counts[value] = result.total;
      } catch {
        /* 角标读不到时不显示，不影响列表 */
      }
    }),
  );
  if (run === sequence) tabCounts.value = counts;
}
const loading = ref(false);
const pageError = ref('');
const open = ref(false);
const selectedId = ref<string>();
/** 发票付款查看来源：经付款记录挂的发票查采购单 */
const sourceInvoiceId = ref<string>();
const standaloneId = computed(() =>
  typeof route.query.standaloneId === 'string'
    ? route.query.standaloneId
    : undefined,
);
const newType = ref<ProcurementFinanceType>(props.type);
const context = ref<Record<string, unknown>>({});
let sequence = 0;
const contractId = computed(() =>
  typeof route.query.contractId === 'string'
    ? route.query.contractId
    : undefined,
);
const orderId = computed(() =>
  typeof route.query.orderId === 'string' ? route.query.orderId : undefined,
);
function payerSummary(record: ProcurementFinanceRecord) {
  if (record.type !== 'PAYMENT_PLAN') return record.payerSnapshot?.name ?? '—';
  const periods = businessRows(record.periods);
  if (periods.length === 0) return '尚未安排分期';
  return [
    ...new Set(
      periods.map((period) =>
        String(
          (period.payerSnapshot as Record<string, unknown> | undefined)?.name ??
            '未维护主体',
        ),
      ),
    ),
  ].join('、');
}
async function load() {
  if (!active.value) return;
  const run = ++sequence;
  loading.value = true;
  pageError.value = '';
  try {
    if (isPayment.value) void loadCounts(run);
    const result = await getProcurementFinancePage({
      type: effectiveType.value,
      contractId: contractId.value,
      orderId: orderId.value,
      status: listStatus.value,
      keyword: keyword.value || undefined,
      source:
        isPayment.value && source.value !== 'ALL' ? source.value : undefined,
      pageNo: page.value,
      pageSize: 10,
    });
    if (run === sequence) {
      rows.value = result.list;
      total.value = result.total;
    }
  } catch (error) {
    if (run === sequence) pageError.value = errorText(error);
  } finally {
    if (run === sequence) loading.value = false;
  }
}
function create(
  type: ProcurementFinanceType,
  initial: Record<string, unknown> = {},
) {
  newType.value = type;
  context.value = {
    contractId: contractId.value,
    orderId: orderId.value,
    ...initial,
  };
  selectedId.value = undefined;
  open.value = true;
}
function selectSource(value: 'ALL' | 'JINZHI' | 'NATIVE') {
  if (source.value === value) return;
  source.value = value;
  page.value = 1;
  void load();
}
const columns = computed(() =>
  isPayment.value
    ? [
        // 列顺序参考金智「付款记录」：付款金额、供应商、采购单、付款日期、付款分类、是否收票
        {
          title: '付款金额',
          key: 'money',
          width: 140,
          align: 'right' as const,
        },
        { title: '供应商 / 收款方', key: 'payee', width: 200, ellipsis: true },
        { title: '采购单 / 付款单号', key: 'name', width: 260 },
        { title: '付款日期', key: 'paidAt', width: 110 },
        { title: '付款分类', key: 'method', width: 110 },
        { title: '是否收票', key: 'invoice', width: 100 },
        {
          title: '所属公司 / 付款方式',
          key: 'payer',
          width: 200,
          ellipsis: true,
        },
        { title: '状态', key: 'state', width: 110 },
        { title: '登记人', key: 'creator', width: 100, ellipsis: true },
        { title: '操作', key: 'action', width: 100, fixed: 'right' as const },
      ]
    : [
        { title: '单据号 / 名称', key: 'name', width: 330 },
        { title: '金额', key: 'money', width: 170, align: 'right' as const },
        { title: '付款主体', key: 'payer', width: 250, ellipsis: true },
        { title: '状态', key: 'state', width: 120 },
        { title: '操作', key: 'action', width: 140, fixed: 'right' as const },
      ],
);
function moneyText(record: ProcurementFinanceRecord) {
  if (record.amount === null || record.amount === undefined) return '未注明';
  const amount = Number(record.amount).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return record.currency ? `${record.currency} ${amount}` : amount;
}
function payerText(record: ProcurementFinanceRecord) {
  if (isPayment.value)
    return (
      [record.payerSnapshot?.name, record.payerAccount]
        .filter(Boolean)
        .join(' · ') || '—'
    );
  return payerSummary(record);
}
/** 本页合计（金智列表底部），按币种分开 */
const pageTotal = computed(() => {
  const totals = new Map<string, number>();
  for (const row of rows.value) {
    const value = Number(row.amount);
    if (!Number.isFinite(value)) continue;
    const currency = row.currency || '';
    totals.set(currency, (totals.get(currency) ?? 0) + value);
  }
  return (
    [...totals.entries()]
      .map(([currency, value]) =>
        `${currency} ${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`.trim(),
      )
      .join(' / ') || '—'
  );
});
/** 列表「新建」：先选采购单，再登记付款记录（不经请款） */
const pickingOrder = ref(false);
/** 不挂采购单的其他付款（集团内往来款等） */
const otherPayment = ref(false);
const paymentOrder = ref<{
  available?: unknown;
  code?: string;
  contractId: string;
  currency?: string;
  orderId: string;
  previous: Array<Record<string, unknown>>;
  reference: Record<string, unknown>;
  supplierName?: string;
}>();
async function orderPicked(row: DocumentRow) {
  pickingOrder.value = false;
  const orderId = String(row.standaloneId ?? row.id);
  const contractId = row.standaloneId
    ? 'standalone'
    : String(row.contractId ?? '');
  try {
    const summary = await getProcurementFinanceSummary(contractId, orderId);
    paymentOrder.value = {
      contractId,
      orderId,
      code: String(row.record?.code ?? row.record?.orderCode ?? ''),
      supplierName: String(row.record?.supplierName ?? ''),
      currency: String(summary.currency ?? row.record?.currency ?? ''),
      available: summary.availablePaymentAmount,
      previous: Array.isArray(summary.payments)
        ? (summary.payments as Array<Record<string, unknown>>)
        : [],
      reference: {
        orderAmount: summary.orderAmount,
        paid: summary.paidAmount,
        pending: summary.pendingPaymentAmount,
        unpaid: summary.unpaidAmount,
      },
    };
  } catch (error) {
    message.error(errorText(error));
  }
}
function paymentSaved(record: ProcurementFinanceRecord) {
  paymentOrder.value = undefined;
  otherPayment.value = false;
  message.success(paymentSavedMessage(record));
  void load();
}
function close() {
  open.value = false;
  if (!active.value) return;
  const query = withoutDetailQuery(route.query);
  delete query.financeId;
  void router.replace({ query });
}
function show(record: ProcurementFinanceRecord) {
  if (record.standaloneId) {
    const query = withoutDetailQuery(route.query);
    delete query.financeId;
    void router.push({
      query: { ...query, standaloneId: record.standaloneId },
    });
    return;
  }
  newType.value = record.type;
  selectedId.value = record.id;
  context.value = {};
  open.value = true;
}
function clear() {
  const query = withoutDetailQuery(route.query);
  delete query.contractId;
  delete query.orderId;
  delete query.financeId;
  void router.replace({ query });
}
watch(
  () => [active.value, effectiveType.value, contractId.value, orderId.value],
  () => {
    open.value = false;
    if (active.value) {
      page.value = 1;
      void load();
    }
  },
  { immediate: true },
);
watch(
  () => [active.value, route.query.financeId],
  () => {
    open.value = false;
    if (active.value && typeof route.query.financeId === 'string') {
      selectedId.value = route.query.financeId;
      newType.value = effectiveType.value;
      open.value = true;
    }
  },
  { immediate: true, flush: 'post' },
);
</script>
<template>
  <Page
    :title="inMergedView ? undefined : financeTitles[effectiveType]"
    :description="
      isPayment
        ? '采购登记付款记录，提交后由财务审核；财务确认已付款后才计入采购单已付。'
        : '独立办理采购资金与费用，确认付款后才计入已付，成本按自身来源与归属单独管理。'
    "
  >
    <Card>
      <Space direction="vertical" size="middle" style="width: 100%">
        <Alert v-if="pageError" type="error" :message="pageError" /><Alert
          v-if="contractId || orderId"
          type="info"
          message="当前列表按来源合同 / 采购单筛选"
        >
          <template #action>
            <Button @click="clear">清除来源筛选</Button>
          </template>
</Alert><Space wrap>
          <Input.Search
            v-model:value="keyword"
            placeholder="搜索单据名称或编号"
            @search="
              page = 1;
              load();
            "
          /><Select
            v-if="!isPayment"
            v-model:value="status"
            :options="
              [
                'DRAFT',
                'SUBMITTED',
                'APPROVED',
                'REJECTED',
                'CONFIRMED',
                'CANCELLED',
                'REVERSED',
              ].map((value) => ({
                value,
                label: {
                  DRAFT: '草稿',
                  SUBMITTED: '待生效',
                  APPROVED: '已生效',
                  REJECTED: '待补充',
                  CONFIRMED: '已确认',
                  CANCELLED: '已取消',
                  REVERSED: '已冲销',
                }[value],
              }))
            "
            allow-clear
            placeholder="全部状态"
            style="width: 140px"
            @change="
              page = 1;
              load();
            "
          /><Button
            v-if="isPayment"
            type="primary"
            @click="pickingOrder = true"
          >
            登记付款记录
</Button><Button v-if="isPayment" @click="otherPayment = true">
            登记其他付款
</Button><Button v-else type="primary" @click="create(effectiveType)">
            新建{{ financeTitles[effectiveType] }}
</Button><Button
            v-if="effectiveType === 'REQUEST'"
            @click="create('PAYMENT_PLAN')"
          >
            新建付款计划
</Button><Button
            v-if="type === 'REQUEST'"
            @click="
              router.push({
                query: {
                  ...route.query,
                  financeId: undefined,
                  type:
                    effectiveType === 'PAYMENT_PLAN'
                      ? undefined
                      : 'PAYMENT_PLAN',
                },
              })
            "
          >
            {{
              effectiveType === 'PAYMENT_PLAN' ? '查看采购请款' : '查看付款计划'
            }}
</Button><Button :loading="loading" @click="load">刷新</Button>
          <div
            v-if="isPayment"
            class="source-switch"
            role="group"
            aria-label="付款来源"
          >
            <button
              v-for="option in [
                { key: 'NATIVE', label: '新系统' },
                { key: 'JINZHI', label: '金智历史' },
                { key: 'ALL', label: '全部' },
              ] as const"
              :key="option.key"
              type="button"
              :class="{ on: source === option.key }"
              :aria-pressed="source === option.key"
              @click="selectSource(option.key)"
            >
              {{ option.label }}
            </button>
          </div>
        </Space>
        <div v-if="isPayment" class="tabs" role="tablist" aria-label="付款进度">
          <button
            v-for="tab in paymentTabs"
            :key="tab.key"
            type="button"
            role="tab"
            :class="{ on: paymentTab === tab.key }"
            :aria-selected="paymentTab === tab.key"
            @click="selectTab(tab.key)"
          >
            {{ tab.label }}
            <span
              v-if="tabCounts[tab.key]"
              class="count"
              :class="{ alert: tab.key === 'SUBMITTED' && canAudit }"
              >{{ tabCounts[tab.key] }}</span>
          </button>
        </div>
        <Table
          class="fdm-business-table"
          size="small"
          table-layout="fixed"
          :scroll="{ x: 1100 }"
          :data-source="rows"
          :loading="loading"
          row-key="id"
          :pagination="{ current: page, pageSize: 10, total }"
          :columns="columns"
          @change="
            (value) => {
              page = value.current ?? 1;
              load();
            }
          "
        >
          <template v-if="isPayment" #summary>
            <TableSummary v-if="rows.length > 0">
              <TableSummaryRow class="sum-row">
                <TableSummaryCell :index="0" align="right">
                  <span class="num">{{ pageTotal }}</span>
                </TableSummaryCell>
                <TableSummaryCell :index="1" :col-span="9">
                  本页合计
                </TableSummaryCell>
              </TableSummaryRow>
            </TableSummary>
          </template>
          <template #bodyCell="{ column, record }">
            <span v-if="column.key === 'name'" class="name-cell"><Button
                type="link"
                :title="[record.code, record.name].filter(Boolean).join(' · ')"
                @click="show(record as ProcurementFinanceRecord)"
              >
                {{ record.code }} · {{ record.name }} </Button><Button
                v-if="record.invoiceId"
                type="link"
                size="small"
                class="source-link"
                @click="sourceInvoiceId = String(record.invoiceId)"
              >
                {{
                  (record.invoice?.orderCount ?? 1) > 1
                    ? `集中收票-查看来源（${record.invoice?.orderCount} 个采购单）`
                    : `付款发票 ${record.invoice?.code ?? ''} · 查看来源`
                }}
              </Button></span><span
              v-else-if="column.key === 'payer'"
              class="fdm-cell-line"
              :title="payerText(record as ProcurementFinanceRecord)"
              >{{ payerText(record as ProcurementFinanceRecord) }}</span><Tag
              v-else-if="column.key === 'state'"
              :color="
                reviewedPayment(record)
                  ? paymentStatus(record).color
                  : undefined
              "
            >
              {{ financeRecordStatus(record) }}
</Tag><span v-else-if="column.key === 'creator'" class="fdm-cell-line">{{
              record.createdByName || '—'
            }}</span><Button
              v-else-if="column.key === 'action'"
              :type="
                record.allowedActions?.includes('APPROVE') ? 'primary' : 'link'
              "
              :size="
                record.allowedActions?.includes('APPROVE') ? 'small' : 'middle'
              "
              @click="show(record as ProcurementFinanceRecord)"
            >
              {{
                record.allowedActions?.includes('APPROVE')
                  ? '审核'
                  : isPayment
                    ? '查看'
                    : '查看 / 办理'
              }}
            </Button>
            <span v-else-if="column.key === 'money'" class="num">{{ moneyText(record as ProcurementFinanceRecord)
              }}<small v-if="!record.currency" class="muted">
                币种未注明</small></span>
            <span
              v-else-if="column.key === 'payee'"
              class="fdm-cell-line"
              :title="String(record.payeeName ?? '')"
              >{{ record.payeeName || '—' }}</span>
            <span v-else-if="column.key === 'paidAt'" class="num">{{
              record.paidAt ?? '—'
            }}</span>
            <span v-else-if="column.key === 'method'">{{
              record.paymentMethod || '—'
            }}</span>
            <Tag
              v-else-if="column.key === 'invoice' && record.invoiceState"
              :color="invoiceStates[String(record.invoiceState)]?.color"
            >
              {{ invoiceStates[String(record.invoiceState)]?.label }}
            </Tag>
          </template>
        </Table>
      </Space>
</Card><InvoiceSourcesDialog
      :open="!!sourceInvoiceId && active"
      :invoice-id="sourceInvoiceId"
      title="付款记录"
      @close="sourceInvoiceId = undefined"
    /><FinanceDocument
      :open="open && active"
      :type="newType"
      :record-id="selectedId"
      :context="context"
      @close="close"
      @updated="load"
    />
    <OrderPicker
      :open="pickingOrder && active"
      @close="pickingOrder = false"
      @selected="orderPicked"
    />
    <PaymentRecordDialog
      v-if="otherPayment"
      :open="otherPayment && active"
      contract-id=""
      order-id=""
      other
      @close="otherPayment = false"
      @saved="paymentSaved"
    />
    <PaymentRecordDialog
      v-if="paymentOrder"
      :open="!!paymentOrder && active"
      :contract-id="paymentOrder.contractId"
      :order-id="paymentOrder.orderId"
      :order-code="paymentOrder.code"
      :supplier-name="paymentOrder.supplierName"
      :currency="paymentOrder.currency"
      :available="paymentOrder.available"
      :previous="paymentOrder.previous"
      :reference="paymentOrder.reference"
      @close="paymentOrder = undefined"
      @saved="paymentSaved"
    />
  </Page>
  <BusinessDocumentDetail
    :id="standaloneId"
    :open="Boolean(standaloneId) && active"
    @close="close"
    @updated="load"
  />
</template>

<style scoped>
.name-cell {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
}

.name-cell .source-link {
  height: auto;
  padding: 0 15px;
  font-size: 12px;
}

.source-switch {
  display: inline-flex;
  overflow: hidden;
  border: 1px solid hsl(var(--border));
  border-radius: 8px;
}

.source-switch button {
  padding: 4px 12px;
  font: inherit;
  font-size: 13px;
  color: hsl(var(--muted-foreground));
  cursor: pointer;
  background: transparent;
  border: 0;
}

.source-switch button.on {
  font-weight: 600;
  color: hsl(var(--primary));
  background: hsl(var(--primary) / 10%);
}

.source-switch button:focus-visible {
  outline: 2px solid hsl(var(--primary));
  outline-offset: -2px;
}

.tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  border-bottom: 1px solid hsl(var(--border));
}

.tabs button {
  display: inline-flex;
  gap: 6px;
  align-items: center;
  padding: 6px 12px;
  margin-bottom: -1px;
  font: inherit;
  font-size: 14px;
  color: hsl(var(--muted-foreground));
  cursor: pointer;
  background: transparent;
  border: 0;
  border-bottom: 2px solid transparent;
}

.tabs button.on {
  font-weight: 600;
  color: hsl(var(--primary));
  border-bottom-color: hsl(var(--primary));
}

.tabs button:focus-visible {
  outline: 2px solid hsl(var(--primary));
  outline-offset: -2px;
}

.tabs .count {
  min-width: 20px;
  padding: 0 6px;
  font-size: 12px;
  font-weight: 600;
  line-height: 18px;
  color: hsl(var(--muted-foreground));
  text-align: center;
  background: hsl(var(--accent));
  border-radius: 9px;
}

.tabs .count.alert {
  color: #fff;
  background: hsl(var(--destructive));
}

.sum-row :deep(td) {
  font-weight: 600;
  background: hsl(var(--accent));
}

.num {
  font-variant-numeric: tabular-nums;
}

.muted {
  font-size: 12px;
  color: hsl(var(--muted-foreground));
}
</style>
