<script setup lang="ts">
import type {
  ProcurementFinanceRecord,
  ProcurementFinanceType,
} from '#/api/fdmplatform/procurement-finance';

import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { Page } from '@vben/common-ui';

import {
  Alert,
  Button,
  Card,
  Input,
  Select,
  Space,
  Table,
  Tag,
} from 'ant-design-vue';

import { getProcurementFinancePage } from '#/api/fdmplatform/procurement-finance';

import { useInMergedView } from '../../components/merged-view';
import { rows as businessRows, errorText } from '../../data';
import BusinessDocumentDetail from '../../documents/BusinessDocumentDetail.vue';
import { withoutDetailQuery } from '../../documents/navigation';
import { useRouteOwner } from '../../documents/useRouteOwner';
import FinanceDocument from './components/FinanceDocument.vue';
import { financeStatus, financeTitles } from './model';

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
const loading = ref(false);
const pageError = ref('');
const open = ref(false);
const selectedId = ref<string>();
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
    const result = await getProcurementFinancePage({
      type: effectiveType.value,
      contractId: contractId.value,
      orderId: orderId.value,
      status: status.value,
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
        { title: '单据号 / 名称', key: 'name', width: 300 },
        { title: '供应商 / 收款方', key: 'payee', width: 200, ellipsis: true },
        { title: '付款日期', key: 'paidAt', width: 110 },
        { title: '金额', key: 'money', width: 150, align: 'right' as const },
        { title: '付款账户', key: 'payer', width: 180, ellipsis: true },
        { title: '状态', key: 'state', width: 100 },
        { title: '操作', key: 'action', width: 120, fixed: 'right' as const },
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
    return String(
      record.payerSnapshot?.name ??
        (record as Record<string, unknown>).payerAccount ??
        '—',
    );
  return payerSummary(record);
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
    description="独立办理采购资金与费用，确认付款后才计入已付，成本按自身来源与归属单独管理。"
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
          /><Button type="primary" @click="create(effectiveType)">
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
</Space><Table
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
          <template #bodyCell="{ column, record }">
            <Button
              v-if="column.key === 'name'"
              type="link"
              :title="[record.code, record.name].filter(Boolean).join(' · ')"
              @click="show(record as ProcurementFinanceRecord)"
            >
              {{ record.code }} · {{ record.name }}
</Button><span
              v-else-if="column.key === 'payer'"
              class="fdm-cell-line"
              :title="payerText(record as ProcurementFinanceRecord)"
              >{{ payerText(record as ProcurementFinanceRecord) }}</span><Tag v-else-if="column.key === 'state'">
              {{ financeStatus(record.status) }}
</Tag><Button
              v-else-if="column.key === 'action'"
              type="link"
              @click="show(record as ProcurementFinanceRecord)"
            >
              查看 / 办理
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
          </template>
        </Table>
      </Space>
</Card><FinanceDocument
      :open="open && active"
      :type="newType"
      :record-id="selectedId"
      :context="context"
      @close="close"
      @updated="load"
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

.num {
  font-variant-numeric: tabular-nums;
}

.muted {
  font-size: 12px;
  color: hsl(var(--muted-foreground));
}
</style>
