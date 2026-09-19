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

import { rows as businessRows, errorText } from '../../data';
import BusinessDocumentDetail from '../../documents/BusinessDocumentDetail.vue';
import { withoutDetailQuery } from '../../documents/navigation';
import { useRouteOwner } from '../../documents/useRouteOwner';
import FinanceDocument from './components/FinanceDocument.vue';
import { financeStatus, financeTitles } from './model';

import '../../documents/procurement-tabs';

import '../../components/compact-tables.css';

const props = defineProps<{ type: ProcurementFinanceType }>();
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
    :title="financeTitles[effectiveType]"
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
</Space><Table
          class="fdm-business-table"
          size="small"
          table-layout="fixed"
          :scroll="{ x: 1100 }"
          :data-source="rows"
          :loading="loading"
          row-key="id"
          :pagination="{ current: page, pageSize: 10, total }"
          :columns="[
            { title: '单据号 / 名称', key: 'name', width: 330 },
            { title: '金额', dataIndex: 'amount', width: 150 },
            { title: '币种', dataIndex: 'currency', width: 90 },
            { title: '付款主体', key: 'payer', width: 250, ellipsis: true },
            { title: '状态', key: 'state', width: 120 },
            { title: '操作', key: 'action', width: 140, fixed: 'right' },
          ]"
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
              :title="payerSummary(record as ProcurementFinanceRecord)"
              >{{ payerSummary(record as ProcurementFinanceRecord) }}</span><Tag v-else-if="column.key === 'state'">
              {{ financeStatus(record.status) }}
</Tag><Button
              v-else-if="column.key === 'action'"
              type="link"
              @click="show(record as ProcurementFinanceRecord)"
            >
              查看 / 办理
            </Button>
            <span v-else-if="column.dataIndex === 'amount'">{{
              record.amount ?? '未注明'
            }}</span>
            <span v-else-if="column.dataIndex === 'currency'">{{
              record.currency || '未注明'
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
