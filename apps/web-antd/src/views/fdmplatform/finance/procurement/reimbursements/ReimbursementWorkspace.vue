<script setup lang="ts">
import type { ReimbursementView } from './workspace';

import type { ExpenseContext } from '#/api/fdmplatform/expense';
import type { ProcurementFinanceRecord } from '#/api/fdmplatform/procurement-finance';

import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { Page } from '@vben/common-ui';
import { formatDate } from '@vben/utils';

import {
  Alert,
  Button,
  DatePicker,
  Empty,
  Input,
  Select,
  Table,
  Tag,
} from 'ant-design-vue';

import { getExpenseContext, getExpensePage } from '#/api/fdmplatform/expense';

import { useInMergedView } from '../../../components/merged-view';
import { errorText, expenseCategories } from '../../../data';
import BusinessDocumentDetail from '../../../documents/BusinessDocumentDetail.vue';
import { withoutDetailQuery } from '../../../documents/navigation';
import { useRouteOwner } from '../../../documents/useRouteOwner';
import FinanceDocument from '../components/FinanceDocument.vue';
import { expenseStatus } from '../model';
import ExpenseSummaryPanel from './ExpenseSummaryPanel.vue';
import {
  expenseAction,
  expenseMoney,
  expensePayment,
  reimbursementQuery,
  reimbursementViews,
} from './workspace';

const props = withDefaults(
  defineProps<{
    /** 页头所属部门，四个部门菜单共用这个列表。 */
    department?: string;
    /** 外贸、内销只办报销本身；付款与成本归集归采购、财务。 */
    payable?: boolean;
  }>(),
  { department: '财务管理', payable: true },
);
const inMergedView = useInMergedView();
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
const me = ref<ExpenseContext>();
const showSummary = ref(false);
const category = ref<string>();
const dateRange = ref<[string, string] | undefined>();
/** 付款只有财务能办，外贸、内销入口的 payable=false 继续生效。 */
const canPay = computed(() => props.payable && me.value?.canPay === true);
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
  return String(record.applicantName ?? `用户 #${record.createdBy}`);
}
function dateText(value: unknown) {
  return typeof value === 'number' || typeof value === 'string'
    ? formatDate(value) || '日期待核实'
    : '日期待核实';
}
async function load() {
  if (!active.value) return;
  const params = {
    ...reimbursementQuery(view.value),
    category: category.value,
    from: dateRange.value?.[0],
    to: dateRange.value?.[1],
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
    const value = await getExpensePage(params);
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
  showSummary.value = false;
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
    me.value = await getExpenseContext();
    // 有待审批的单时，审批人打开就看到自己要办的
    if (me.value.canAudit && view.value === 'all') filter('pending');
  } catch {
    /* 取不到身份时不显示财务操作，列表照常。 */
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
          <template v-if="!inMergedView">
            <span class="expense-eyebrow">{{ props.department }} / 费用报销</span>
            <h1>费用报销</h1>
          </template>
          <p>
            {{
              '填写费用和凭证后提交，部门负责人同意、财务审核后付款。费用可以关联合同或采购单，也可以不关联。'
            }}
          </p>
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
            :aria-pressed="!showSummary && view === item.key"
            :class="{ active: !showSummary && view === item.key }"
            @click="filter(item.key)"
          >
            {{ item.label }}
          </button>
          <button
            v-if="me?.canSummarize"
            type="button"
            :aria-pressed="showSummary"
            :class="{ active: showSummary }"
            @click="showSummary = true"
          >
            费用汇总
          </button>
        </nav>
        <ExpenseSummaryPanel v-if="showSummary" />
        <div v-show="!showSummary" class="expense-toolbar">
          <Input.Search
            v-model:value="keyword"
            allow-clear
            placeholder="搜索主题、单号或收款人"
            aria-label="搜索主题、单号或收款人"
            @search="searchRecords"
          />
          <Select
            v-model:value="category"
            allow-clear
            class="expense-filter"
            placeholder="费用类别"
            :options="expenseCategories"
            @change="searchRecords"
          />
          <DatePicker.RangePicker
            v-model:value="dateRange"
            value-format="YYYY-MM-DD"
            allow-clear
            @change="searchRecords"
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
          v-show="!showSummary"
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
            { title: '部门 / 费用归属', key: 'company', width: 190 },
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
              <span>{{ row.applicantDeptName || '未记录部门' }}</span><small>{{
                row.expenseEntitySnapshot?.name || '财务审核时确认'
              }}</small>
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
              {{ expenseStatus(row) }}
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
              {{ expenseAction(row as ProcurementFinanceRecord, canPay) }}
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
      :hide-payment="!canPay"
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
.expense-filter {
  min-width: 140px;
}

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
