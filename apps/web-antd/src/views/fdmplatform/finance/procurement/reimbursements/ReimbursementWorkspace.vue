<script setup lang="ts">
import type { ReimbursementView } from './workspace';

import type { Directory } from '#/api/fdmplatform';
import type { ProcurementFinanceRecord } from '#/api/fdmplatform/procurement-finance';

import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { Page } from '@vben/common-ui';
import { formatDate } from '@vben/utils';

import { Alert, Button, Empty, Input, Table, Tag } from 'ant-design-vue';

import { getDirectory } from '#/api/fdmplatform';
import { getProcurementFinancePage } from '#/api/fdmplatform/procurement-finance';

import { errorText } from '../../../data';
import BusinessDocumentDetail from '../../../documents/BusinessDocumentDetail.vue';
import { withoutDetailQuery } from '../../../documents/navigation';
import { useRouteOwner } from '../../../documents/useRouteOwner';
import FinanceDocument from '../components/FinanceDocument.vue';
import { financeStatus } from '../model';
import {
  expenseAction,
  expenseMoney,
  expensePayment,
  reimbursementQuery,
  reimbursementViews,
} from './workspace';

import '../../../documents/procurement-tabs';

const route = useRoute();
const router = useRouter();
const active = useRouteOwner();
const view = ref<ReimbursementView>('all');
const keyword = ref('');
const search = ref('');
const page = ref(1);
const pageSize = ref(15);
const result = ref<{ list: ProcurementFinanceRecord[]; total: number }>();
const loading = ref(false);
const pageError = ref('');
const directory = ref<Directory>();
const open = ref(false);
const selectedId = ref<string>();
const context = ref<Record<string, unknown>>({});
const contractId = computed(() =>
  typeof route.query.contractId === 'string'
    ? route.query.contractId
    : undefined,
);
const orderId = computed(() =>
  typeof route.query.orderId === 'string' ? route.query.orderId : undefined,
);
const standaloneId = computed(() =>
  typeof route.query.standaloneId === 'string'
    ? route.query.standaloneId
    : undefined,
);
let sequence = 0;
let lastQuery = '';
let disposed = false;
let openedFromRoute = false;
function applicant(record: ProcurementFinanceRecord) {
  if (record.createdBy === undefined || record.createdBy === null)
    return '申请人待核实';
  return (
    directory.value?.users.find(
      (user) => String(user.id) === String(record.createdBy),
    )?.nickname ?? `用户 #${record.createdBy}`
  );
}
function dateText(value: unknown) {
  return value
    ? formatDate(String(value), 'YYYY-MM-DD') || '日期待核实'
    : '日期待核实';
}
async function load() {
  if (!active.value) return;
  const params = {
    type: 'REIMBURSEMENT' as const,
    ...reimbursementQuery(view.value),
    contractId: contractId.value,
    orderId: orderId.value,
    keyword: search.value || undefined,
    pageNo: page.value,
    pageSize: pageSize.value,
  };
  const signature = JSON.stringify(params);
  if (signature !== lastQuery) result.value = undefined;
  lastQuery = signature;
  const run = ++sequence;
  loading.value = true;
  pageError.value = '';
  try {
    const value = await getProcurementFinancePage(params);
    if (disposed || run !== sequence || !active.value) return;
    const lastPage = Math.max(1, Math.ceil(value.total / pageSize.value));
    if (page.value > lastPage) {
      page.value = lastPage;
      await load();
      return;
    }
    result.value = value;
  } catch (error) {
    if (run === sequence && !disposed) pageError.value = errorText(error);
  } finally {
    if (run === sequence && !disposed) loading.value = false;
  }
}
function filter(value: ReimbursementView) {
  if (view.value === value) return;
  view.value = value;
  page.value = 1;
  void load();
}
function searchRecords() {
  search.value = keyword.value.trim();
  page.value = 1;
  void load();
}
function create() {
  openedFromRoute = false;
  if (route.query.financeId || standaloneId.value) {
    const query = withoutDetailQuery(route.query);
    delete query.financeId;
    void router.replace({ query });
  }
  selectedId.value = undefined;
  context.value = { contractId: contractId.value, orderId: orderId.value };
  open.value = true;
}
function show(record: ProcurementFinanceRecord) {
  openedFromRoute = false;
  if (record.standaloneId) {
    open.value = false;
    const query = withoutDetailQuery(route.query);
    delete query.financeId;
    void router.push({
      query: { ...query, standaloneId: record.standaloneId },
    });
  } else {
    selectedId.value = record.id;
    context.value = {};
    open.value = true;
  }
}
function close() {
  openedFromRoute = false;
  open.value = false;
  if (!active.value) return;
  const query = withoutDetailQuery(route.query);
  delete query.financeId;
  void router.replace({ query });
}
function clearSource() {
  const query = withoutDetailQuery(route.query);
  delete query.financeId;
  delete query.contractId;
  delete query.orderId;
  void router.replace({ query });
}
watch(
  () => [active.value, contractId.value, orderId.value],
  () => {
    ++sequence;
    open.value = false;
    page.value = 1;
    if (active.value) void load();
  },
  { immediate: true },
);
watch(
  () => [
    active.value,
    route.query.financeId,
    standaloneId.value,
    contractId.value,
    orderId.value,
  ],
  () => {
    if (
      active.value &&
      !standaloneId.value &&
      typeof route.query.financeId === 'string'
    ) {
      openedFromRoute = true;
      selectedId.value = route.query.financeId;
      context.value = {};
      open.value = true;
    } else if (openedFromRoute || standaloneId.value) {
      openedFromRoute = false;
      open.value = false;
      selectedId.value = undefined;
    }
  },
  { immediate: true, flush: 'post' },
);
onMounted(async () => {
  try {
    directory.value = await getDirectory(0);
  } catch {
    /* IDs remain visible if the directory is unavailable. */
  }
});
onBeforeUnmount(() => {
  disposed = true;
  ++sequence;
});
</script>

<template>
  <Page>
    <section class="expense-workspace">
      <header class="expense-heading">
        <div>
          <span class="expense-eyebrow">财务管理 / 费用报销</span>
          <h1>费用报销</h1>
          <p>填写费用与凭证，提交生效后继续办理实际付款。</p>
        </div>
        <Button type="primary" size="large" @click="create">新建报销</Button>
      </header>
      <Alert v-if="pageError" type="error" :message="pageError" show-icon />
      <Alert
        v-if="contractId || orderId"
        type="info"
        message="正在查看来源合同 / 采购单的费用报销"
        show-icon
      >
        <template #action>
          <Button size="small" @click="clearSource"> 查看全部报销 </Button>
        </template>
      </Alert>
      <section class="expense-records">
        <nav class="expense-views" aria-label="报销状态">
          <button
            v-for="item in reimbursementViews"
            :key="item.key"
            type="button"
            :aria-pressed="view === item.key"
            :class="{ active: view === item.key }"
            @click="filter(item.key)"
          >
            {{ item.label }}
          </button>
        </nav>
        <div class="expense-toolbar">
          <Input.Search
            v-model:value="keyword"
            allow-clear
            placeholder="搜索报销主题或单号"
            aria-label="搜索报销主题或单号"
            @search="searchRecords"
          />
          <span class="expense-count">{{
            result
              ? `共 ${result.total} 笔报销`
              : loading
                ? '正在查询…'
                : '数量待查询'
          }}</span>
          <Button :loading="loading" @click="load">刷新</Button>
        </div>
        <Table
          :data-source="result?.list ?? []"
          :loading="loading"
          row-key="id"
          size="middle"
          :scroll="{ x: 1130 }"
          :pagination="{
            current: page,
            pageSize,
            total: result?.total ?? 0,
            showSizeChanger: true,
            pageSizeOptions: ['15', '30', '50'],
          }"
          :columns="[
            { title: '报销主题 / 单号', key: 'subject', width: 270 },
            { title: '申请人 / 日期', key: 'applicant', width: 150 },
            { title: '费用所属公司', key: 'company', width: 190 },
            { title: '报销金额', key: 'amount', width: 150, align: 'right' },
            { title: '单据状态', key: 'status', width: 105 },
            { title: '付款进度', key: 'payment', width: 165 },
            { title: '办理', key: 'action', width: 100, fixed: 'right' },
          ]"
          @change="
            (value) => {
              page = value.pageSize !== pageSize ? 1 : (value.current ?? 1);
              pageSize = value.pageSize ?? 15;
              load();
            }
          "
        >
          <template #bodyCell="{ column, record: row }">
            <template v-if="column.key === 'subject'">
              <button
                class="expense-subject"
                type="button"
                @click="show(row as ProcurementFinanceRecord)"
              >
                {{ row.name || row.code }}
</button><small>{{ row.code }}</small>
            </template>
            <template v-else-if="column.key === 'applicant'">
              <span>{{ applicant(row as ProcurementFinanceRecord) }}</span><small>{{ dateText(row.createdAt) }}</small>
            </template>
            <template v-else-if="column.key === 'company'">
              <span>{{ row.expenseEntitySnapshot?.name || '待补充' }}</span><small>付款：{{ row.payerSnapshot?.name || '待选择' }}</small>
            </template>
            <strong
              v-else-if="column.key === 'amount'"
              class="expense-amount"
              >{{ expenseMoney(row.amount, row.currency) }}</strong>
            <Tag
              v-else-if="column.key === 'status'"
              :color="
                row.status === 'APPROVED'
                  ? 'green'
                  : row.status === 'SUBMITTED'
                    ? 'blue'
                    : row.status === 'REJECTED'
                      ? 'orange'
                      : undefined
              "
            >
              {{ financeStatus(row.status) }}
            </Tag>
            <template v-else-if="column.key === 'payment'">
              <Tag
                :color="expensePayment(row as ProcurementFinanceRecord).color"
              >
                {{
                  expensePayment(row as ProcurementFinanceRecord).label
                }}
</Tag><small
                v-if="
                  expensePayment(row as ProcurementFinanceRecord).unpaid !==
                  undefined
                "
                >未付
                {{
                  expenseMoney(
                    expensePayment(row as ProcurementFinanceRecord).unpaid,
                    row.currency,
                  )
                }}</small>
            </template>
            <Button
              v-else-if="column.key === 'action'"
              type="link"
              @click="show(row as ProcurementFinanceRecord)"
            >
              {{ expenseAction(row as ProcurementFinanceRecord) }}
            </Button>
          </template>
          <template #emptyText>
            <Empty
              :description="
                loading
                  ? '正在读取报销单'
                  : pageError
                    ? '查询未完成，请重试'
                    : '当前条件下没有报销单'
              "
            />
          </template>
        </Table>
      </section>
    </section>
    <FinanceDocument
      :open="open && active"
      type="REIMBURSEMENT"
      :record-id="selectedId"
      :context="context"
      @close="close"
      @updated="load"
    />
    <BusinessDocumentDetail
      :id="standaloneId"
      :open="Boolean(standaloneId) && active"
      @close="close"
      @updated="load"
    />
  </Page>
</template>

<style scoped>
.expense-workspace {
  display: grid;
  gap: 16px;
}

.expense-heading {
  display: flex;
  gap: 20px;
  align-items: center;
  justify-content: space-between;
  padding: 8px 0 12px;
}

.expense-eyebrow {
  font-size: 12px;
  color: hsl(var(--muted-foreground));
}

.expense-heading h1 {
  margin: 8px 0;
  font-size: 26px;
  font-weight: 650;
}

.expense-heading p {
  margin: 0;
  color: hsl(var(--muted-foreground));
}

.expense-records {
  overflow: hidden;
  background: hsl(var(--card));
  border: 1px solid hsl(var(--border));
  border-radius: 12px;
}

.expense-views {
  display: flex;
  gap: 24px;
  padding: 0 24px;
  overflow-x: auto;
  border-bottom: 1px solid hsl(var(--border));
}

.expense-views button {
  flex-shrink: 0;
  padding: 18px 0 15px;
  color: hsl(var(--muted-foreground));
  cursor: pointer;
  border-bottom: 3px solid transparent;
}

.expense-views button.active {
  font-weight: 600;
  color: hsl(var(--primary));
  border-bottom-color: hsl(var(--primary));
}

.expense-toolbar {
  display: flex;
  gap: 12px;
  align-items: center;
  padding: 18px 24px;
}

.expense-toolbar :deep(.ant-input-search) {
  max-width: 370px;
}

.expense-count {
  margin-left: auto;
  font-size: 12px;
  color: hsl(var(--muted-foreground));
  white-space: nowrap;
}

.expense-subject {
  display: block;
  max-width: 100%;
  font-weight: 600;
  color: hsl(var(--primary));
  text-align: left;
  overflow-wrap: anywhere;
  cursor: pointer;
}

.expense-records small {
  display: block;
  margin-top: 5px;
  font-size: 12px;
  color: hsl(var(--muted-foreground));
}

.expense-amount {
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.expense-records :deep(.ant-pagination) {
  margin-right: 20px;
  margin-left: 20px;
}

@media (width <= 640px) {
  .expense-heading {
    align-items: flex-start;
  }

  .expense-heading h1 {
    font-size: 22px;
  }

  .expense-heading p {
    max-width: 220px;
    font-size: 12px;
  }

  .expense-views {
    gap: 20px;
    padding: 0 16px;
  }

  .expense-toolbar {
    flex-wrap: wrap;
    padding: 16px;
  }

  .expense-toolbar :deep(.ant-input-search) {
    max-width: none;
  }

  .expense-count {
    margin-right: auto;
    margin-left: 0;
  }
}
</style>
