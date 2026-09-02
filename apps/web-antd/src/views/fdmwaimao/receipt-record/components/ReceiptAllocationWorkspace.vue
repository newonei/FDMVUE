<script lang="ts" setup>
import type { ColumnsType } from 'ant-design-vue/es/table';

import type { FdmWaimaoContractOrderApi } from '#/api/fdmwaimao/contract-order';
import type { FdmWaimaoReceiptAllocationApi } from '#/api/fdmwaimao/receipt-allocation';

import {
  computed,
  onBeforeUnmount,
  onMounted,
  reactive,
  ref,
  watch,
} from 'vue';

import { useAccess } from '@vben/access';
import { IconifyIcon } from '@vben/icons';

import {
  Alert,
  Button,
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
import BigNumber from 'bignumber.js';
import dayjs from 'dayjs';

import { getContractOrderFormOptions } from '#/api/fdmwaimao/contract-order';
import { getCustomerPage } from '#/api/fdmwaimao/customer';
import {
  applyReceiptAllocation,
  cancelReceiptAllocation,
  getReceiptAllocation,
  getReceiptAllocationPage,
  isReceiptAllocationDuplicateConfirmationError,
  voidReceiptAllocation,
} from '#/api/fdmwaimao/receipt-allocation';
import TradeListShell from '#/views/fdm-trade-shared/components/TradeListShell.vue';

import {
  clearAllocationCommand,
  getOrCreateAllocationCommand,
} from '../allocation-command-store';
import ReceiptAllocationDetail from './ReceiptAllocationDetail.vue';
import ReceiptAllocationDraftModal from './ReceiptAllocationDraftModal.vue';
import ReceiptAllocationGenerationModal from './ReceiptAllocationGenerationModal.vue';

defineOptions({ name: 'FdmWaimaoReceiptAllocationWorkspace' });

const props = defineProps<{
  intent?: {
    bankReceiptId: string;
    mode: 'AI' | 'MANUAL';
    token: number;
  };
}>();

type ActionType = 'APPLY' | 'CANCEL' | 'VOID';

interface SelectOption {
  label: string;
  value: string;
}

const { hasAccessByCodes } = useAccess();
const columns: ColumnsType<FdmWaimaoReceiptAllocationApi.Allocation> = [
  { fixed: 'left', key: 'allocation', title: '分配编号', width: 185 },
  { key: 'bank', title: '银行到账', width: 190 },
  { key: 'company', title: '公司 / 客户', width: 220 },
  { key: 'amount', title: '分配原币金额', width: 155 },
  { key: 'creation', title: '建立方式', width: 130 },
  { key: 'status', title: '状态', width: 110 },
  { key: 'time', title: '应用 / 作废时间', width: 170 },
  { dataIndex: 'remark', key: 'remark', title: '备注', width: 210 },
  { fixed: 'right', key: 'actions', title: '操作', width: 280 },
];

const filters = reactive<FdmWaimaoReceiptAllocationApi.PageReq>({
  pageNo: 1,
  pageSize: 20,
});
const rows = ref<FdmWaimaoReceiptAllocationApi.Allocation[]>([]);
const total = ref(0);
const loading = ref(false);
const formOptions = ref<FdmWaimaoContractOrderApi.FormOptions>({
  companies: [],
  owners: [],
});
const customerOptions = ref<SelectOption[]>([]);
const customerSearching = ref(false);

const detailOpen = ref(false);
const detailLoading = ref(false);
const detail = ref<FdmWaimaoReceiptAllocationApi.Allocation>();
const manualOpen = ref(false);
const manualBankReceiptId = ref<string>();
const aiOpen = ref(false);
const aiBankReceiptId = ref<string>();

const actionOpen = ref(false);
const actionType = ref<ActionType>();
const actionTarget = ref<FdmWaimaoReceiptAllocationApi.Allocation>();
const actionReason = ref('');
const actionSaving = ref(false);

let pageRequestId = 0;
let detailRequestId = 0;
let customerRequestId = 0;
let customerSearchTimer: ReturnType<typeof setTimeout> | undefined;

const canCreate = computed(() =>
  hasAccessByCodes(['fdmwaimao:receipt-allocation:create']),
);
const canGenerate = computed(() =>
  [
    'fdmwaimao:receipt-allocation:create',
    'fdmwaimao:receipt-allocation:generate',
    'fdmwaimao:ai:use',
  ].every((permission) => hasAccessByCodes([permission])),
);
const canApply = computed(() =>
  hasAccessByCodes(['fdmwaimao:receipt-allocation:apply']),
);
const canCancel = computed(() =>
  hasAccessByCodes(['fdmwaimao:receipt-allocation:update']),
);
const canVoid = computed(() =>
  hasAccessByCodes(['fdmwaimao:receipt-allocation:void']),
);
const companyOptions = computed(() =>
  (formOptions.value.companies ?? []).map((company) => ({
    label: company.name,
    value: company.id,
  })),
);

function asAllocation(record: Record<string, unknown>) {
  return record as unknown as FdmWaimaoReceiptAllocationApi.Allocation;
}

function money(value?: null | string, currency = '') {
  if (value === null || value === undefined || value === '') return '—';
  return `${currency ? `${currency} ` : ''}${new BigNumber(value).toFormat(2)}`;
}

function formatDateTime(value?: null | number | string) {
  if (value === null || value === undefined || value === '') return '—';
  const parsed = dayjs(value);
  return parsed.isValid() ? parsed.format('YYYY-MM-DD HH:mm') : String(value);
}

function shortId(value: string) {
  return value.length > 14 ? `${value.slice(0, 6)}…${value.slice(-6)}` : value;
}

function statusMeta(status: FdmWaimaoReceiptAllocationApi.AllocationStatus) {
  const map = {
    APPLIED: { color: 'green', label: '已应用' },
    CANCELLED: { color: 'default', label: '已取消' },
    DRAFT: { color: 'blue', label: '草稿' },
    VOIDED: { color: 'default', label: '已作废' },
  } as const;
  return map[status];
}

function actionLabel(action?: ActionType) {
  if (action === 'APPLY') return '应用分配';
  if (action === 'CANCEL') return '取消草稿';
  if (action === 'VOID') return '作废并冲回';
  return '更新分配状态';
}

async function loadPage(reset = false) {
  if (reset) filters.pageNo = 1;
  const requestId = ++pageRequestId;
  loading.value = true;
  try {
    const result = await getReceiptAllocationPage({
      ...filters,
      bankReceiptId: filters.bankReceiptId?.trim() || undefined,
      keyword: filters.keyword?.trim() || undefined,
    });
    if (requestId !== pageRequestId) return;
    rows.value = result.list ?? [];
    total.value = result.total ?? 0;
  } finally {
    if (requestId === pageRequestId) loading.value = false;
  }
}

async function loadOptions() {
  formOptions.value = await getContractOrderFormOptions();
}

async function searchCustomersNow(keyword = '') {
  const requestId = ++customerRequestId;
  customerSearching.value = true;
  try {
    const result = await getCustomerPage({
      keyword: keyword.trim() || undefined,
      pageNo: 1,
      pageSize: 30,
    });
    if (requestId !== customerRequestId) return;
    customerOptions.value = (result.list ?? []).map((customer) => ({
      label: `${customer.name} · ${customer.customerCode}`,
      value: customer.id,
    }));
  } finally {
    if (requestId === customerRequestId) customerSearching.value = false;
  }
}

function searchCustomers(keyword: string) {
  if (customerSearchTimer) clearTimeout(customerSearchTimer);
  customerSearchTimer = setTimeout(() => void searchCustomersNow(keyword), 300);
}

function resetFilters() {
  filters.keyword = undefined;
  filters.bankReceiptId = undefined;
  filters.companyId = undefined;
  filters.customerId = undefined;
  filters.status = undefined;
  void loadPage(true);
}

function changePage(pageNo: number, pageSize: number) {
  filters.pageNo = pageNo;
  filters.pageSize = pageSize;
  void loadPage();
}

async function openDetail(id: string) {
  const requestId = ++detailRequestId;
  detailOpen.value = true;
  detailLoading.value = true;
  try {
    const result = await getReceiptAllocation(id);
    if (requestId === detailRequestId) detail.value = result;
  } finally {
    if (requestId === detailRequestId) detailLoading.value = false;
  }
}

function openManual(bankReceiptId?: string) {
  manualBankReceiptId.value = bankReceiptId;
  manualOpen.value = true;
}

function openAi(bankReceiptId?: string) {
  aiBankReceiptId.value = bankReceiptId;
  aiOpen.value = true;
}

async function handleCreated(id: string) {
  manualOpen.value = false;
  aiOpen.value = false;
  await Promise.all([loadPage(true), openDetail(id)]);
}

function openAction(
  allocation: FdmWaimaoReceiptAllocationApi.Allocation,
  action: ActionType,
) {
  actionTarget.value = allocation;
  actionType.value = action;
  actionReason.value = '';
  actionOpen.value = true;
}

async function submitAction(
  confirmPotentialDuplicate = false,
  confirmedIdempotencyKey?: string,
) {
  const allocation = actionTarget.value;
  const action = actionType.value;
  if (!allocation || !action) return;
  if (action !== 'APPLY' && !actionReason.value.trim()) {
    message.warning(`请填写${actionLabel(action)}原因`);
    return;
  }
  const facts = {
    expectedVersion: allocation.version,
    id: allocation.id,
    reason: action === 'APPLY' ? undefined : actionReason.value.trim(),
  };
  const identity = `${action.toLowerCase()}:${allocation.id}:${allocation.version}`;
  const execute = {
    APPLY: applyReceiptAllocation,
    CANCEL: cancelReceiptAllocation,
    VOID: voidReceiptAllocation,
  }[action];
  const idempotencyKey =
    confirmedIdempotencyKey ??
    (await getOrCreateAllocationCommand(
      identity,
      JSON.stringify(facts),
      `allocation-${action.toLowerCase()}`,
    ));
  actionSaving.value = true;
  try {
    const result = await execute({
      ...facts,
      confirmPotentialDuplicate,
      idempotencyKey,
    });
    clearAllocationCommand(identity);
    message.success(
      result.newlyCreated
        ? `${actionLabel(action)}成功`
        : `相同${actionLabel(action)}命令已处理，已返回冻结回执`,
    );
    actionOpen.value = false;
    await loadPage();
    if (detailOpen.value && detail.value?.id === allocation.id) {
      await openDetail(allocation.id);
    }
  } catch (error) {
    if (
      action === 'APPLY' &&
      !confirmPotentialDuplicate &&
      isReceiptAllocationDuplicateConfirmationError(error)
    ) {
      actionSaving.value = false;
      Modal.confirm({
        cancelText: '返回核对',
        content:
          '服务端发现某条待应用分配与旧直接回款在公司、客户、日期、币种和金额上完全一致。继续只代表你已核对确为两笔独立业务；系统会保留跨账本确认审计。',
        okText: '我已核对，仍要应用',
        onOk: () => submitAction(true, idempotencyKey),
        title: '发现跨账本疑似重复入账',
      });
      return;
    }
    message.error(error instanceof Error ? error.message : '分配状态更新失败');
  } finally {
    actionSaving.value = false;
  }
}

watch(
  () => props.intent?.token,
  () => {
    const intent = props.intent;
    if (!intent) return;
    if (intent.mode === 'AI') openAi(intent.bankReceiptId);
    else openManual(intent.bankReceiptId);
  },
);

onMounted(() => {
  void Promise.all([loadPage(), loadOptions(), searchCustomersNow()]);
});

onBeforeUnmount(() => {
  if (customerSearchTimer) clearTimeout(customerSearchTimer);
  pageRequestId += 1;
  detailRequestId += 1;
  customerRequestId += 1;
});
</script>

<template>
  <TradeListShell
    description="分配草稿不会影响合同；应用时服务端原子锁定到账与合同，验证余额和应收后才计入合同已收金额。"
    :loading="loading"
    title="到账分配"
  >
    <template #actions>
      <Space wrap>
        <Button v-if="canCreate" @click="openManual()">
          <template #icon><IconifyIcon icon="lucide:rows-3" /></template>
          手工多合同分配
        </Button>
        <Button v-if="canGenerate" type="primary" @click="openAi()">
          <template #icon><IconifyIcon icon="lucide:wand-sparkles" /></template>
          AI 生成分配草稿
        </Button>
      </Space>
    </template>

    <template #scope>
      <Alert
        description="DRAFT 只冻结建议与汇率证据，不影响合同。APPLIED 才参与合同结算；VOIDED 会冲回。每次状态命令均使用当前版本与稳定幂等键，超时重试不会重复入账。"
        message="草稿 → 应用 → 必要时作废冲回"
        show-icon
        type="info"
      />
    </template>

    <template #filters>
      <Input
        v-model:value="filters.keyword"
        allow-clear
        placeholder="分配编号、客户或合同"
        @press-enter="loadPage(true)"
      />
      <Input
        v-model:value="filters.bankReceiptId"
        allow-clear
        placeholder="银行到账 ID（精确）"
        @press-enter="loadPage(true)"
      />
      <Select
        v-model:value="filters.companyId"
        allow-clear
        :options="companyOptions"
        placeholder="全部公司"
      />
      <Select
        v-model:value="filters.customerId"
        allow-clear
        :filter-option="false"
        :loading="customerSearching"
        :options="customerOptions"
        placeholder="全部客户"
        show-search
        @dropdown-visible-change="
          (open: boolean) => open && searchCustomersNow()
        "
        @search="searchCustomers"
      />
      <Select
        v-model:value="filters.status"
        allow-clear
        :options="[
          { label: '草稿', value: 'DRAFT' },
          { label: '已应用', value: 'APPLIED' },
          { label: '已取消', value: 'CANCELLED' },
          { label: '已作废', value: 'VOIDED' },
        ]"
        placeholder="全部状态"
      />
    </template>

    <template #filter-actions>
      <Button type="primary" @click="loadPage(true)">查询</Button>
      <Button @click="resetFilters">重置</Button>
    </template>

    <div class="allocation-list">
      <Table
        :columns="columns"
        :data-source="rows"
        :loading="loading"
        :pagination="false"
        row-key="id"
        :scroll="{ x: 1515, y: 'calc(100vh - 420px)' }"
        size="middle"
      >
        <template #emptyText>
          <div class="allocation-list__empty">
            <IconifyIcon icon="lucide:split" />
            <strong>还没有到账分配</strong>
            <p>从有效银行到账建立人工草稿，或明确选择模型生成 AI 建议。</p>
          </div>
        </template>

        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'allocation'">
            <div class="allocation-list__stack">
              <Button type="link" @click="openDetail(record.id)">
                {{ record.allocationNo }}
              </Button>
              <span>版本 V{{ record.version }}</span>
            </div>
          </template>
          <template v-else-if="column.key === 'bank'">
            <div class="allocation-list__stack">
              <strong>到账 {{ shortId(record.bankReceiptId) }}</strong>
              <TypographyText :title="record.bankReceiptId" type="secondary">
                冻结版本 V{{ record.bankReceiptVersionSnapshot }}
              </TypographyText>
            </div>
          </template>
          <template v-else-if="column.key === 'company'">
            <div class="allocation-list__stack">
              <strong>{{ record.companyName }}</strong>
              <span>{{ record.customerName }}</span>
            </div>
          </template>
          <template v-else-if="column.key === 'amount'">
            <strong>{{
              money(record.totalSourceAmount, record.sourceCurrency)
            }}</strong>
          </template>
          <template v-else-if="column.key === 'creation'">
            <Tag :color="record.creationMode === 'AI' ? 'purple' : 'blue'">
              {{ record.creationMode === 'AI' ? 'AI 建议物化' : '人工建立' }}
            </Tag>
          </template>
          <template v-else-if="column.key === 'status'">
            <Tag :color="statusMeta(record.status).color">
              {{ statusMeta(record.status).label }}
            </Tag>
          </template>
          <template v-else-if="column.key === 'time'">
            <div class="allocation-list__stack">
              <span>应用 {{ formatDateTime(record.appliedAt) }}</span>
              <span>作废 {{ formatDateTime(record.voidedAt) }}</span>
            </div>
          </template>
          <template v-else-if="column.key === 'remark'">
            <TypographyText :ellipsis="{ tooltip: record.remark }">
              {{ record.remark || '—' }}
            </TypographyText>
          </template>
          <template v-else-if="column.key === 'actions'">
            <Space :size="2" wrap>
              <Button size="small" type="link" @click="openDetail(record.id)">
                查看
              </Button>
              <Button
                v-if="record.status === 'DRAFT' && canApply"
                size="small"
                type="link"
                @click="openAction(asAllocation(record), 'APPLY')"
              >
                应用
              </Button>
              <Button
                v-if="record.status === 'DRAFT' && canCancel"
                danger
                size="small"
                type="link"
                @click="openAction(asAllocation(record), 'CANCEL')"
              >
                取消
              </Button>
              <Button
                v-if="record.status === 'APPLIED' && canVoid"
                danger
                size="small"
                type="link"
                @click="openAction(asAllocation(record), 'VOID')"
              >
                作废冲回
              </Button>
            </Space>
          </template>
        </template>
      </Table>
    </div>

    <template #summary>
      <div class="allocation-list__pagination">
        <span>共 {{ total }} 张到账分配单</span>
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

  <Drawer
    v-model:open="detailOpen"
    :body-style="{ padding: '16px' }"
    destroy-on-close
    :title="detail?.allocationNo || '到账分配详情'"
    width="min(1240px, 96vw)"
  >
    <template #extra>
      <Space v-if="detail" wrap>
        <Button
          v-if="detail.status === 'DRAFT' && canApply"
          size="small"
          type="primary"
          @click="openAction(detail, 'APPLY')"
        >
          应用分配
        </Button>
        <Button
          v-if="detail.status === 'DRAFT' && canCancel"
          danger
          size="small"
          @click="openAction(detail, 'CANCEL')"
        >
          取消草稿
        </Button>
        <Button
          v-if="detail.status === 'APPLIED' && canVoid"
          danger
          size="small"
          @click="openAction(detail, 'VOID')"
        >
          作废冲回
        </Button>
      </Space>
    </template>
    <Spin :spinning="detailLoading">
      <ReceiptAllocationDetail :allocation="detail" />
    </Spin>
  </Drawer>

  <ReceiptAllocationDraftModal
    :bank-receipt-id="manualBankReceiptId"
    :open="manualOpen"
    @close="manualOpen = false"
    @created="handleCreated"
  />
  <ReceiptAllocationGenerationModal
    :bank-receipt-id="aiBankReceiptId"
    :open="aiOpen"
    @close="aiOpen = false"
    @created="handleCreated"
  />

  <Modal
    :confirm-loading="actionSaving"
    :open="actionOpen"
    :ok-text="actionLabel(actionType)"
    :title="actionLabel(actionType)"
    @cancel="actionOpen = false"
    @ok="() => submitAction()"
  >
    <Alert
      v-if="actionType === 'APPLY'"
      description="服务端将按固定锁顺序重新校验银行到账版本、每张合同结算版本、应收上限、原币余额、汇率快照和舍入守恒。成功后才一次性计入合同已收。"
      message="应用是原子财务操作"
      show-icon
      type="warning"
    />
    <Alert
      v-else
      :description="
        actionType === 'VOID'
          ? '作废已应用分配会从合同结算中冲回，但保留完整分配行和状态事件。'
          : '取消只适用于尚未应用的草稿，不会影响合同结算。'
      "
      :message="actionLabel(actionType)"
      show-icon
      type="warning"
    />
    <Input.TextArea
      v-if="actionType !== 'APPLY'"
      v-model:value="actionReason"
      class="allocation-list__action-reason"
      :maxlength="500"
      :placeholder="`请输入${actionLabel(actionType)}原因`"
      :rows="4"
      show-count
    />
  </Modal>
</template>

<style scoped>
.allocation-list {
  min-height: 280px;
  overflow: hidden;
  border: 1px solid #e5eaf1;
  border-radius: 8px;
}

.allocation-list__stack {
  display: grid;
  gap: 3px;
  min-width: 0;
}

.allocation-list__stack :deep(.ant-btn-link) {
  justify-self: flex-start;
  height: auto;
  padding: 0;
  font-weight: 650;
}

.allocation-list__stack span,
.allocation-list__stack :deep(.ant-typography) {
  font-size: 12px;
  color: #64748b;
}

.allocation-list__empty {
  display: grid;
  place-items: center;
  min-height: 250px;
  padding: 32px;
  color: #94a3b8;
}

.allocation-list__empty > svg {
  font-size: 42px;
  color: #91caff;
}

.allocation-list__empty strong {
  font-size: 16px;
  color: #334155;
}

.allocation-list__empty p {
  margin: 0;
}

.allocation-list__pagination {
  display: flex;
  gap: 16px;
  align-items: center;
  justify-content: space-between;
  width: 100%;
}

.allocation-list__pagination > span {
  color: #64748b;
}

.allocation-list__action-reason {
  margin-top: 14px;
}

@media (max-width: 720px) {
  .allocation-list__pagination {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>
