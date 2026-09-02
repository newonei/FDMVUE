<script lang="ts" setup>
import type { ColumnsType } from 'ant-design-vue/es/table';
import type { Dayjs } from 'dayjs';

import type { FdmWaimaoOrderExpenseApi } from '#/api/fdmwaimao/order-expense';

import { computed, onMounted, reactive, ref } from 'vue';

import { useAccess } from '@vben/access';
import { IconifyIcon } from '@vben/icons';

import {
  Button,
  DatePicker,
  Drawer,
  Input,
  message,
  Modal,
  Pagination,
  Select,
  Space,
  Spin,
  Table,
  Tag,
  TypographyText,
} from 'ant-design-vue';

import { getExchangeRateCurrencies } from '#/api/fdmwaimao/exchange-rate';
import {
  approveOrderExpense,
  cancelOrderExpense,
  getOrderExpense,
  getOrderExpensePage,
  rejectOrderExpense,
  reopenOrderExpense,
  submitOrderExpense,
  voidOrderExpense,
} from '#/api/fdmwaimao/order-expense';
import { useFdmWaimaoAiContext } from '#/views/fdm-trade-shared/ai-assistant/context';
import TradeListShell from '#/views/fdm-trade-shared/components/TradeListShell.vue';

import {
  clearExpenseCommand,
  getOrCreateExpenseCommand,
} from './command-store';
import OrderExpenseDetail from './components/OrderExpenseDetail.vue';
import OrderExpenseEditModal from './components/OrderExpenseEditModal.vue';
import OrderExpenseGenerationModal from './components/OrderExpenseGenerationModal.vue';
import {
  expenseActionRequiresReason,
  hasEveryExpensePermission,
  hasExpenseSourcePermission,
} from './workflow-policy';

defineOptions({ name: 'FdmWaimaoOrderExpense' });

type ExpenseAction =
  | 'APPROVE'
  | 'CANCEL'
  | 'REJECT'
  | 'REOPEN'
  | 'SUBMIT'
  | 'VOID';

const { hasAccessByCodes } = useAccess();
const columns: ColumnsType<FdmWaimaoOrderExpenseApi.Expense> = [
  { fixed: 'left', key: 'expenseNo', title: '费用编号', width: 176 },
  { key: 'source', title: '来源单据', width: 210 },
  { key: 'customer', title: '客户 / 公司', width: 210 },
  { key: 'expenseDate', title: '费用日期', width: 110 },
  { key: 'category', title: '费用分类', width: 190 },
  { key: 'amount', title: '原币金额', width: 145 },
  { key: 'amountCny', title: '折人民币', width: 145 },
  { key: 'rate', title: '汇率快照', width: 150 },
  { key: 'status', title: '状态', width: 100 },
  { fixed: 'right', key: 'actions', title: '操作', width: 260 },
];

const filters = reactive<FdmWaimaoOrderExpenseApi.PageReq>({
  pageNo: 1,
  pageSize: 20,
});
const dateRange = ref<[Dayjs, Dayjs]>();
const rows = ref<FdmWaimaoOrderExpenseApi.Expense[]>([]);
const total = ref(0);
const loading = ref(false);
const currencies = ref<Array<{ code: string; name: string }>>([]);
let pageRequestVersion = 0;

const generationOpen = ref(false);
const detailOpen = ref(false);
const detailLoading = ref(false);
const detail = ref<FdmWaimaoOrderExpenseApi.Expense>();
let detailRequestVersion = 0;
const editOpen = ref(false);

const actionOpen = ref(false);
const actionTarget = ref<FdmWaimaoOrderExpenseApi.Expense>();
const actionType = ref<ExpenseAction>();
const actionReason = ref('');
const actionSaving = ref(false);

useFdmWaimaoAiContext(() => ({
  businessId: detailOpen.value ? detail.value?.id : undefined,
  companyId: detailOpen.value ? detail.value?.companyId : filters.companyId,
  // Foreign-trade page AI no longer sends this browser snapshot. The empty object is
  // retained only for compatibility with product-center context registration.
  context: {},
  contextMode: detailOpen.value ? 'detail' : 'list',
  entityLabel: detailOpen.value ? detail.value?.expenseNo : undefined,
  surfaceKey: 'order-expense',
}));

const canQueryContractSource = computed(() =>
  hasAccessByCodes(['fdmwaimao:contract-order:query']),
);
const canQueryShipmentSource = computed(() =>
  hasAccessByCodes(['fdmwaimao:shipment:query']),
);
const canCreate = computed(
  () =>
    hasEveryExpensePermission(
      [
        'fdmwaimao:order-expense:query',
        'fdmwaimao:order-expense:create',
        'fdmwaimao:order-expense:ai-generate',
        'fdmwaimao:ai:use',
      ],
      (code) => hasAccessByCodes([code]),
    ) &&
    hasExpenseSourcePermission(
      canQueryContractSource.value,
      canQueryShipmentSource.value,
    ),
);
const canUpdate = computed(() =>
  hasAccessByCodes(['fdmwaimao:order-expense:update']),
);
const canSubmit = computed(() =>
  hasAccessByCodes(['fdmwaimao:order-expense:submit']),
);
const canApprove = computed(() =>
  hasAccessByCodes(['fdmwaimao:order-expense:approve']),
);
const canCancel = computed(() =>
  hasAccessByCodes(['fdmwaimao:order-expense:cancel']),
);
const canVoid = computed(() =>
  hasAccessByCodes(['fdmwaimao:order-expense:void']),
);
const currencyOptions = computed(() =>
  currencies.value.map((item) => ({
    label: item.name ? `${item.code} · ${item.name}` : item.code,
    value: item.code,
  })),
);

function statusMeta(status: FdmWaimaoOrderExpenseApi.ExpenseStatus) {
  const map: Record<string, { color: string; label: string }> = {
    APPROVED: { color: 'green', label: '已审核' },
    CANCELLED: { color: 'default', label: '已取消' },
    DRAFT: { color: 'blue', label: '草稿' },
    REJECTED: { color: 'red', label: '已驳回' },
    SUBMITTED: { color: 'gold', label: '待审核' },
    VOIDED: { color: 'default', label: '已作废' },
  };
  return map[status] ?? { color: 'default', label: status };
}

function sourceLabel(type: FdmWaimaoOrderExpenseApi.SourceType) {
  return type === 'FDM_WAIMAO_SHIPMENT' ? '发货计划' : '合同订单';
}

function money(value?: null | string, currency = '') {
  if (value === null || value === undefined || value === '') return '待填写';
  return `${currency ? `${currency} ` : ''}${value}`;
}

function categorySummary(record: FdmWaimaoOrderExpenseApi.Expense) {
  const names = [
    ...new Set((record.lines ?? []).map((item) => item.categoryName)),
  ];
  if (names.length === 0) return '—';
  return names.length > 2
    ? `${names.slice(0, 2).join('、')} 等 ${names.length} 项`
    : names.join('、');
}

function asExpense(record: Record<string, unknown>) {
  return record as unknown as FdmWaimaoOrderExpenseApi.Expense;
}

async function loadPage(reset = false) {
  if (reset) filters.pageNo = 1;
  const version = ++pageRequestVersion;
  loading.value = true;
  try {
    const result = await getOrderExpensePage({
      ...filters,
      expenseDate: dateRange.value
        ? [
            dateRange.value[0].format('YYYY-MM-DD'),
            dateRange.value[1].format('YYYY-MM-DD'),
          ]
        : undefined,
      keyword: filters.keyword?.trim() || undefined,
    });
    if (version !== pageRequestVersion) return;
    rows.value = result.list ?? [];
    total.value = result.total ?? 0;
  } finally {
    if (version === pageRequestVersion) loading.value = false;
  }
}

function resetFilters() {
  filters.keyword = undefined;
  filters.sourceType = undefined;
  filters.currency = undefined;
  filters.status = undefined;
  dateRange.value = undefined;
  void loadPage(true);
}

function changePage(pageNo: number, pageSize: number) {
  filters.pageNo = pageNo;
  filters.pageSize = pageSize;
  void loadPage();
}

async function openDetail(id: string) {
  const version = ++detailRequestVersion;
  detailOpen.value = true;
  detailLoading.value = true;
  try {
    const result = await getOrderExpense(id);
    if (version !== detailRequestVersion) return;
    detail.value = result;
  } finally {
    if (version === detailRequestVersion) detailLoading.value = false;
  }
}

async function handleCreated(id: string) {
  generationOpen.value = false;
  await Promise.all([loadPage(true), openDetail(id)]);
  editOpen.value = true;
}

async function handleSaved(id: string) {
  editOpen.value = false;
  await Promise.all([loadPage(), openDetail(id)]);
}

function openAction(
  record: FdmWaimaoOrderExpenseApi.Expense,
  action: ExpenseAction,
) {
  actionTarget.value = record;
  actionType.value = action;
  actionReason.value = '';
  actionOpen.value = true;
}

function actionLabel(action?: ExpenseAction) {
  const labels: Record<ExpenseAction, string> = {
    APPROVE: '审核通过',
    CANCEL: '取消费用单',
    REJECT: '驳回费用单',
    REOPEN: '重新打开草稿',
    SUBMIT: '提交审核',
    VOID: '作废费用单',
  };
  return action ? labels[action] : '更新状态';
}

function actionNeedsReason(action?: ExpenseAction) {
  return expenseActionRequiresReason(action);
}

async function submitAction() {
  const record = actionTarget.value;
  const action = actionType.value;
  if (!record || !action) return;
  if (actionNeedsReason(action) && !actionReason.value.trim()) {
    message.warning(`请填写${actionLabel(action)}原因`);
    return;
  }
  const identity = `${action.toLowerCase()}:${record.id}:${record.version}`;
  const payload = {
    expectedVersion: record.version,
    id: record.id,
    idempotencyKey: await getOrCreateExpenseCommand(
      identity,
      actionReason.value.trim(),
      `expense-${action.toLowerCase()}`,
    ),
    reason: actionReason.value.trim() || undefined,
  };
  actionSaving.value = true;
  try {
    const execute = {
      APPROVE: approveOrderExpense,
      CANCEL: cancelOrderExpense,
      REJECT: rejectOrderExpense,
      REOPEN: reopenOrderExpense,
      SUBMIT: submitOrderExpense,
      VOID: voidOrderExpense,
    }[action];
    await execute(payload);
    clearExpenseCommand(identity);
    message.success(`${actionLabel(action)}成功`);
    actionOpen.value = false;
    await loadPage();
    if (detailOpen.value && detail.value?.id === record.id) {
      await openDetail(record.id);
    }
  } finally {
    actionSaving.value = false;
  }
}

onMounted(async () => {
  await Promise.all([
    loadPage(),
    getExchangeRateCurrencies().then((result) => {
      currencies.value = result ?? [];
    }),
  ]);
});
</script>

<template>
  <TradeListShell
    description="从已确认合同或发货计划识别费用分类，人工补录原币金额，服务端按费用日期冻结汇率；已审核费用不计入回款、消费或合同已收金额。"
    :loading="loading"
    title="订单费用"
  >
    <template #actions>
      <Button v-if="canCreate" type="primary" @click="generationOpen = true">
        <template #icon><IconifyIcon icon="lucide:wand-sparkles" /></template>
        AI 识别订单费用
      </Button>
    </template>

    <template #filters>
      <Input
        v-model:value="filters.keyword"
        allow-clear
        placeholder="费用编号、来源单号、主题或客户"
        @press-enter="loadPage(true)"
      />
      <Select
        v-model:value="filters.sourceType"
        allow-clear
        :options="[
          { label: '合同订单', value: 'FDM_WAIMAO_CONTRACT_ORDER' },
          { label: '发货计划', value: 'FDM_WAIMAO_SHIPMENT' },
        ]"
        placeholder="全部来源"
      />
      <Select
        v-model:value="filters.currency"
        allow-clear
        :options="currencyOptions"
        placeholder="全部币种"
        show-search
      />
      <Select
        v-model:value="filters.status"
        allow-clear
        :options="[
          { label: '草稿', value: 'DRAFT' },
          { label: '待审核', value: 'SUBMITTED' },
          { label: '已审核', value: 'APPROVED' },
          { label: '已驳回', value: 'REJECTED' },
          { label: '已取消', value: 'CANCELLED' },
          { label: '已作废', value: 'VOIDED' },
        ]"
        placeholder="全部状态"
      />
      <DatePicker.RangePicker v-model:value="dateRange" />
    </template>

    <template #filter-actions>
      <Button type="primary" @click="loadPage(true)">查询</Button>
      <Button @click="resetFilters">重置</Button>
    </template>

    <div class="expense-page-table">
      <Table
        :columns="columns"
        :data-source="rows"
        :loading="loading"
        :pagination="false"
        row-key="id"
        size="middle"
        :scroll="{ x: 1580, y: 'calc(100vh - 390px)' }"
      >
        <template #emptyText>
          <div class="expense-empty">
            <IconifyIcon icon="lucide:receipt-text" />
            <strong>还没有订单费用</strong>
            <p>从已确认合同或发货计划开始，让 AI 识别可能发生的费用分类。</p>
            <Button
              v-if="canCreate"
              type="primary"
              @click="generationOpen = true"
            >
              AI 识别首张费用单
            </Button>
          </div>
        </template>

        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'expenseNo'">
            <Button type="link" @click="openDetail(record.id)">
              {{ record.expenseNo }}
            </Button>
            <div>
              <Tag color="purple">
                {{ record.creationMode === 'AI' ? 'AI 分类' : '人工建立' }}
              </Tag>
            </div>
          </template>
          <template v-else-if="column.key === 'source'">
            <div class="expense-cell-stack">
              <strong>{{ record.sourceNo }}</strong>
              <span>{{ sourceLabel(record.sourceType) }} · 版本
                {{ record.sourceVersion }}</span>
              <TypographyText
                v-if="record.sourceSubject"
                ellipsis
                type="secondary"
              >
                {{ record.sourceSubject }}
              </TypographyText>
            </div>
          </template>
          <template v-else-if="column.key === 'customer'">
            <div class="expense-cell-stack">
              <strong>{{ record.customerName || '—' }}</strong>
              <span>{{ record.companyName || record.companyId }}</span>
            </div>
          </template>
          <template v-else-if="column.key === 'expenseDate'">
            {{ record.expenseDate || '待填写' }}
          </template>
          <template v-else-if="column.key === 'category'">
            {{ categorySummary(asExpense(record)) }}
          </template>
          <template v-else-if="column.key === 'amount'">
            <Tag v-if="record.amountOrigin === 'MISSING'" color="gold">
              待人工填写
            </Tag>
            <strong v-else>{{
              money(record.totalAmount, record.currency || '')
            }}</strong>
          </template>
          <template v-else-if="column.key === 'amountCny'">
            {{ money(record.totalAmountCny, 'CNY') }}
          </template>
          <template v-else-if="column.key === 'rate'">
            <div class="expense-cell-stack">
              <span>{{ record.currencyToCnyRate || '待计算' }}</span>
              <TypographyText type="secondary">
                {{ record.rateDate || '—' }}
                <Tag v-if="record.rateFallbackUsed" color="orange">回退</Tag>
              </TypographyText>
            </div>
          </template>
          <template v-else-if="column.key === 'status'">
            <Tag :color="statusMeta(record.status).color">
              {{ statusMeta(record.status).label }}
            </Tag>
          </template>
          <template v-else-if="column.key === 'actions'">
            <Space :size="2" wrap>
              <Button size="small" type="link" @click="openDetail(record.id)">
                查看
              </Button>
              <Button
                v-if="record.status === 'DRAFT' && canUpdate"
                size="small"
                type="link"
                @click="openDetail(record.id).then(() => (editOpen = true))"
              >
                补录金额
              </Button>
              <Button
                v-if="
                  record.status === 'DRAFT' &&
                  record.amountOrigin === 'HUMAN_ENTERED' &&
                  canSubmit
                "
                size="small"
                type="link"
                @click="openAction(asExpense(record), 'SUBMIT')"
              >
                提交
              </Button>
              <Button
                v-if="record.status === 'SUBMITTED' && canApprove"
                size="small"
                type="link"
                @click="openAction(asExpense(record), 'APPROVE')"
              >
                通过
              </Button>
              <Button
                v-if="record.status === 'SUBMITTED' && canApprove"
                danger
                size="small"
                type="link"
                @click="openAction(asExpense(record), 'REJECT')"
              >
                驳回
              </Button>
              <Button
                v-if="record.status === 'REJECTED' && canUpdate"
                size="small"
                type="link"
                @click="openAction(asExpense(record), 'REOPEN')"
              >
                重开
              </Button>
            </Space>
          </template>
        </template>
      </Table>
    </div>

    <template #summary>
      <div class="expense-pagination">
        <span>共 {{ total }} 张订单费用单</span>
        <Pagination
          :current="filters.pageNo"
          :page-size="filters.pageSize"
          :page-size-options="['10', '20', '50', '100']"
          show-size-changer
          :show-total="(value: number) => `共 ${value} 条`"
          :total="total"
          @change="changePage"
        />
      </div>
    </template>
  </TradeListShell>

  <OrderExpenseGenerationModal
    :allow-contract-source="canQueryContractSource"
    :allow-shipment-source="canQueryShipmentSource"
    :open="generationOpen"
    @close="generationOpen = false"
    @created="handleCreated"
  />

  <Drawer
    v-model:open="detailOpen"
    :body-style="{ padding: '16px' }"
    destroy-on-close
    :title="detail?.expenseNo || '订单费用详情'"
    width="min(1180px, 96vw)"
  >
    <template #extra>
      <Space v-if="detail">
        <Button
          v-if="detail.status === 'DRAFT' && canUpdate"
          size="small"
          type="primary"
          @click="editOpen = true"
        >
          补录金额
        </Button>
        <Button
          v-if="
            detail.status === 'DRAFT' &&
            detail.amountOrigin === 'HUMAN_ENTERED' &&
            canSubmit
          "
          size="small"
          @click="openAction(detail, 'SUBMIT')"
        >
          提交审核
        </Button>
        <Button
          v-if="['DRAFT', 'REJECTED'].includes(detail.status) && canCancel"
          danger
          size="small"
          @click="openAction(detail, 'CANCEL')"
        >
          取消
        </Button>
        <Button
          v-if="detail.status === 'APPROVED' && canVoid"
          danger
          size="small"
          @click="openAction(detail, 'VOID')"
        >
          作废
        </Button>
      </Space>
    </template>
    <Spin :spinning="detailLoading">
      <OrderExpenseDetail :expense="detail" />
    </Spin>
  </Drawer>

  <OrderExpenseEditModal
    :expense="detail"
    :open="editOpen"
    @close="editOpen = false"
    @saved="handleSaved"
  />

  <Modal
    :confirm-loading="actionSaving"
    :open="actionOpen"
    :title="actionLabel(actionType)"
    @cancel="actionOpen = false"
    @ok="submitAction"
  >
    <p>
      将费用单 <strong>{{ actionTarget?.expenseNo }}</strong> 执行“{{
        actionLabel(actionType)
      }}”。 状态变更由服务端按当前版本校验并写入追加审计记录。
    </p>
    <Input.TextArea
      v-if="actionNeedsReason(actionType)"
      v-model:value="actionReason"
      :maxlength="500"
      :placeholder="`请输入${actionLabel(actionType)}原因`"
      :rows="4"
      show-count
    />
  </Modal>
</template>

<style scoped>
.expense-page-table {
  min-height: 0;
  overflow: hidden;
  background: var(--ant-color-bg-container, #fff);
  border: 1px solid var(--ant-color-border-secondary, #f0f0f0);
  border-radius: 10px;
}

.expense-cell-stack {
  display: grid;
  gap: 3px;
}

.expense-cell-stack > span,
.expense-cell-stack :deep(.ant-typography) {
  font-size: 12px;
  color: #8c8c8c;
}

.expense-empty {
  display: grid;
  place-items: center;
  padding: 56px 16px;
  color: #8c8c8c;
}

.expense-empty > svg {
  margin-bottom: 12px;
  font-size: 42px;
  color: #91caff;
}

.expense-empty strong {
  font-size: 16px;
  color: #262626;
}

.expense-empty p {
  margin: 7px 0 16px;
}

.expense-pagination {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
}

@media (max-width: 720px) {
  .expense-pagination {
    display: grid;
    gap: 12px;
  }
}
</style>
