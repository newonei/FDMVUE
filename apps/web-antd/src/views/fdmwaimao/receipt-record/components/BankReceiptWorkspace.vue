<script lang="ts" setup>
import type { ColumnsType } from 'ant-design-vue/es/table';
import type { Dayjs } from 'dayjs';

import type { FdmWaimaoBankReceiptApi } from '#/api/fdmwaimao/bank-receipt';
import type { FdmWaimaoContractOrderApi } from '#/api/fdmwaimao/contract-order';

import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue';

import { useAccess } from '@vben/access';
import { IconifyIcon } from '@vben/icons';

import {
  Alert,
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
import BigNumber from 'bignumber.js';

import {
  getBankReceipt,
  getBankReceiptPage,
  voidBankReceipt,
} from '#/api/fdmwaimao/bank-receipt';
import { getContractOrderFormOptions } from '#/api/fdmwaimao/contract-order';
import { getCustomerPage } from '#/api/fdmwaimao/customer';
import { getExchangeRateCurrencies } from '#/api/fdmwaimao/exchange-rate';
import TradeListShell from '#/views/fdm-trade-shared/components/TradeListShell.vue';

import BankReceiptDetail from './BankReceiptDetail.vue';
import BankReceiptEditModal from './BankReceiptEditModal.vue';

defineOptions({ name: 'FdmWaimaoBankReceiptWorkspace' });

const emit = defineEmits<{
  allocate: [
    intent: {
      bankReceiptId: string;
      mode: 'AI' | 'MANUAL';
    },
  ];
}>();

interface SelectOption {
  label: string;
  value: string;
}

const { hasAccessByCodes } = useAccess();
const columns: ColumnsType<FdmWaimaoBankReceiptApi.BankReceipt> = [
  { fixed: 'left', key: 'receipt', title: '到账编号 / 外部流水', width: 220 },
  { key: 'company', title: '公司 / 客户', width: 220 },
  { key: 'payer', title: '付款方', width: 175 },
  {
    dataIndex: 'receiptDate',
    key: 'receiptDate',
    title: '到账日期',
    width: 112,
  },
  { key: 'arrival', title: '原币到账', width: 145 },
  { key: 'rate', title: '汇率快照', width: 165 },
  { key: 'cny', title: '折人民币', width: 145 },
  { key: 'allocation', title: '合同分配', width: 190 },
  { key: 'status', title: '状态', width: 100 },
  { fixed: 'right', key: 'actions', title: '操作', width: 330 },
];

const filters = reactive<FdmWaimaoBankReceiptApi.PageReq>({
  pageNo: 1,
  pageSize: 20,
});
const dateRange = ref<[Dayjs, Dayjs]>();
const rows = ref<FdmWaimaoBankReceiptApi.BankReceipt[]>([]);
const total = ref(0);
const loading = ref(false);
const formOptions = ref<FdmWaimaoContractOrderApi.FormOptions>({
  companies: [],
  owners: [],
});
const currencyOptions = ref<SelectOption[]>([]);
const customerOptions = ref<SelectOption[]>([]);
const customerSearching = ref(false);

const detailOpen = ref(false);
const detailLoading = ref(false);
const detail = ref<FdmWaimaoBankReceiptApi.BankReceipt>();
const editorOpen = ref(false);
const editorReceipt = ref<FdmWaimaoBankReceiptApi.BankReceipt>();

const voidOpen = ref(false);
const voidTarget = ref<FdmWaimaoBankReceiptApi.BankReceipt>();
const voidReason = ref('');
const voiding = ref(false);

let pageRequestId = 0;
let detailRequestId = 0;
let customerRequestId = 0;
let customerSearchTimer: ReturnType<typeof setTimeout> | undefined;

const canCreate = computed(() =>
  hasAccessByCodes(['fdmwaimao:bank-receipt:create']),
);
const canUpdate = computed(() =>
  hasAccessByCodes(['fdmwaimao:bank-receipt:update']),
);
const canVoid = computed(() =>
  hasAccessByCodes(['fdmwaimao:bank-receipt:void']),
);
const canCreateAllocation = computed(() =>
  hasAccessByCodes(['fdmwaimao:receipt-allocation:create']),
);
const canGenerateAllocation = computed(() =>
  [
    'fdmwaimao:receipt-allocation:create',
    'fdmwaimao:receipt-allocation:generate',
    'fdmwaimao:ai:use',
  ].every((permission) => hasAccessByCodes([permission])),
);
const companyOptions = computed(() =>
  (formOptions.value.companies ?? []).map((company) => ({
    label: company.name,
    value: company.id,
  })),
);

function asReceipt(record: Record<string, unknown>) {
  return record as unknown as FdmWaimaoBankReceiptApi.BankReceipt;
}

function money(value?: null | string, currency = '') {
  if (value === null || value === undefined || value === '') return '—';
  return `${currency ? `${currency} ` : ''}${new BigNumber(value).toFormat(2)}`;
}

function allocationMeta(state: FdmWaimaoBankReceiptApi.AllocationState) {
  if (state === 'FULL') return { color: 'green', label: '全额分配' };
  if (state === 'PARTIAL') return { color: 'blue', label: '部分分配' };
  return { color: 'default', label: '未分配' };
}

function isUnallocated(record: FdmWaimaoBankReceiptApi.BankReceipt) {
  return (
    record.status === 'ACTIVE' &&
    record.allocationState === 'UNALLOCATED' &&
    new BigNumber(record.allocatedAmount).isZero()
  );
}

function canAllocate(record: FdmWaimaoBankReceiptApi.BankReceipt) {
  return (
    record.status === 'ACTIVE' &&
    Boolean(record.customerId) &&
    new BigNumber(record.remainingAmount).gt(0)
  );
}

async function loadPage(reset = false) {
  if (reset) filters.pageNo = 1;
  const requestId = ++pageRequestId;
  loading.value = true;
  try {
    const result = await getBankReceiptPage({
      ...filters,
      keyword: filters.keyword?.trim() || undefined,
      receiptDate: dateRange.value
        ? [
            dateRange.value[0].format('YYYY-MM-DD'),
            dateRange.value[1].format('YYYY-MM-DD'),
          ]
        : undefined,
    });
    if (requestId !== pageRequestId) return;
    rows.value = result.list ?? [];
    total.value = result.total ?? 0;
  } finally {
    if (requestId === pageRequestId) loading.value = false;
  }
}

async function loadOptions() {
  const [contractOptions, currencies] = await Promise.all([
    getContractOrderFormOptions(),
    getExchangeRateCurrencies(),
  ]);
  formOptions.value = contractOptions;
  currencyOptions.value = (currencies ?? []).map((currency) => ({
    label: currency.name
      ? `${currency.code} · ${currency.name}`
      : currency.code,
    value: currency.code,
  }));
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
  filters.companyId = undefined;
  filters.customerId = undefined;
  filters.currency = undefined;
  filters.allocationState = undefined;
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
  const requestId = ++detailRequestId;
  detailOpen.value = true;
  detailLoading.value = true;
  try {
    const result = await getBankReceipt(id);
    if (requestId === detailRequestId) detail.value = result;
  } finally {
    if (requestId === detailRequestId) detailLoading.value = false;
  }
}

function openCreate() {
  editorReceipt.value = undefined;
  editorOpen.value = true;
}

function openEdit(receipt: FdmWaimaoBankReceiptApi.BankReceipt) {
  editorReceipt.value = receipt;
  editorOpen.value = true;
}

async function handleSaved(id: string) {
  editorOpen.value = false;
  await Promise.all([loadPage(), openDetail(id)]);
}

function askVoid(receipt: FdmWaimaoBankReceiptApi.BankReceipt) {
  voidTarget.value = receipt;
  voidReason.value = '';
  voidOpen.value = true;
}

async function confirmVoid() {
  const target = voidTarget.value;
  if (!target || !voidReason.value.trim()) {
    message.warning('请输入可审计的作废原因');
    return;
  }
  voiding.value = true;
  try {
    await voidBankReceipt({
      expectedVersion: target.version,
      id: target.id,
      reason: voidReason.value.trim(),
    });
    message.success('银行到账已作废；服务端未删除任何历史数据');
    voidOpen.value = false;
    if (detail.value?.id === target.id) detailOpen.value = false;
    await loadPage();
  } finally {
    voiding.value = false;
  }
}

function requestAllocation(
  receipt: FdmWaimaoBankReceiptApi.BankReceipt,
  mode: 'AI' | 'MANUAL',
) {
  if (!receipt.customerId) {
    message.warning('请先为银行到账关联交易客户，再创建合同分配');
    return;
  }
  emit('allocate', { bankReceiptId: receipt.id, mode });
}

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
    description="先登记银行真实到账，再将可用余额分配到一个或多个合同。到账汇率与人民币金额由服务端冻结。"
    :loading="loading"
    title="银行到账"
  >
    <template #actions>
      <Button v-if="canCreate" type="primary" @click="openCreate">
        <template #icon><IconifyIcon icon="lucide:landmark" /></template>
        登记银行到账
      </Button>
    </template>

    <template #scope>
      <Alert
        description="本页是新流程的唯一到账入口：银行到账本身不直接计入某张合同，只有“到账分配”应用后才增加合同已收金额。不要再为同一笔银行流水登记旧直接回款。"
        message="银行到账与旧直接回款不能重复登记"
        show-icon
        type="warning"
      />
    </template>

    <template #filters>
      <Input
        v-model:value="filters.keyword"
        allow-clear
        placeholder="到账编号、外部流水、付款方或客户"
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
        v-model:value="filters.currency"
        allow-clear
        :options="currencyOptions"
        placeholder="全部币种"
        show-search
      />
      <DatePicker.RangePicker v-model:value="dateRange" />
      <Select
        v-model:value="filters.allocationState"
        allow-clear
        :options="[
          { label: '未分配', value: 'UNALLOCATED' },
          { label: '部分分配', value: 'PARTIAL' },
          { label: '全额分配', value: 'FULL' },
        ]"
        placeholder="全部分配状态"
      />
      <Select
        v-model:value="filters.status"
        allow-clear
        :options="[
          { label: '有效', value: 'ACTIVE' },
          { label: '已作废', value: 'VOIDED' },
        ]"
        placeholder="全部状态"
      />
    </template>

    <template #filter-actions>
      <Button type="primary" @click="loadPage(true)">查询</Button>
      <Button @click="resetFilters">重置</Button>
    </template>

    <div class="bank-receipt-list">
      <Table
        :columns="columns"
        :data-source="rows"
        :loading="loading"
        :pagination="false"
        row-key="id"
        :scroll="{ x: 1800, y: 'calc(100vh - 430px)' }"
        size="middle"
      >
        <template #emptyText>
          <div class="bank-receipt-list__empty">
            <IconifyIcon icon="lucide:landmark" />
            <strong>还没有银行到账</strong>
            <p>录入真实银行流水后，服务端会冻结当日汇率快照。</p>
            <Button v-if="canCreate" type="primary" @click="openCreate">
              登记第一笔到账
            </Button>
          </div>
        </template>

        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'receipt'">
            <div class="bank-receipt-list__stack">
              <Button type="link" @click="openDetail(record.id)">
                {{ record.receiptNo }}
              </Button>
              <TypographyText
                :ellipsis="{ tooltip: record.externalReceiptKey }"
                type="secondary"
              >
                {{ record.sourceSystem }} · {{ record.externalReceiptKey }}
              </TypographyText>
            </div>
          </template>
          <template v-else-if="column.key === 'company'">
            <div class="bank-receipt-list__stack">
              <strong>{{ record.companyName }}</strong>
              <span>{{ record.customerName || '未关联客户' }}</span>
            </div>
          </template>
          <template v-else-if="column.key === 'payer'">
            <div class="bank-receipt-list__stack">
              <strong>{{ record.payerNameMasked || '—' }}</strong>
              <span>{{ record.payerAccountMasked || '—' }}</span>
            </div>
          </template>
          <template v-else-if="column.key === 'arrival'">
            <strong>{{ money(record.arrivalAmount, record.currency) }}</strong>
          </template>
          <template v-else-if="column.key === 'rate'">
            <div class="bank-receipt-list__stack">
              <strong>{{ record.currencyToCnyRate }}</strong>
              <span>
                {{ record.rateDate }} · {{ record.rateSource }}
                <Tag v-if="record.rateFallbackUsed" color="orange">回退</Tag>
              </span>
            </div>
          </template>
          <template v-else-if="column.key === 'cny'">
            <strong class="bank-receipt-list__cny">
              {{ money(record.arrivalAmountCny, 'CNY') }}
            </strong>
          </template>
          <template v-else-if="column.key === 'allocation'">
            <div class="bank-receipt-list__stack">
              <Tag :color="allocationMeta(record.allocationState).color">
                {{ allocationMeta(record.allocationState).label }}
              </Tag>
              <span>
                已分配 {{ money(record.allocatedAmount, record.currency) }} /
                剩余
                {{ money(record.remainingAmount, record.currency) }}
              </span>
            </div>
          </template>
          <template v-else-if="column.key === 'status'">
            <Tag :color="record.status === 'ACTIVE' ? 'green' : 'default'">
              {{ record.status === 'ACTIVE' ? '有效' : '已作废' }}
            </Tag>
          </template>
          <template v-else-if="column.key === 'actions'">
            <Space :size="2" wrap>
              <Button size="small" type="link" @click="openDetail(record.id)">
                查看
              </Button>
              <Button
                v-if="canCreateAllocation && canAllocate(asReceipt(record))"
                size="small"
                type="link"
                @click="requestAllocation(asReceipt(record), 'MANUAL')"
              >
                手工分配
              </Button>
              <Button
                v-if="canGenerateAllocation && canAllocate(asReceipt(record))"
                size="small"
                type="link"
                @click="requestAllocation(asReceipt(record), 'AI')"
              >
                AI 分配
              </Button>
              <Button
                v-if="canUpdate && isUnallocated(asReceipt(record))"
                size="small"
                type="link"
                @click="openEdit(asReceipt(record))"
              >
                修改
              </Button>
              <Button
                v-if="canVoid && isUnallocated(asReceipt(record))"
                danger
                size="small"
                type="link"
                @click="askVoid(asReceipt(record))"
              >
                作废
              </Button>
            </Space>
          </template>
        </template>
      </Table>
    </div>

    <template #summary>
      <div class="bank-receipt-list__pagination">
        <span>共 {{ total }} 笔银行到账</span>
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
    :title="detail?.receiptNo || '银行到账详情'"
    width="min(1120px, 96vw)"
  >
    <template #extra>
      <Space v-if="detail" wrap>
        <Button
          v-if="canCreateAllocation && canAllocate(detail)"
          size="small"
          type="primary"
          @click="requestAllocation(detail, 'MANUAL')"
        >
          手工分配
        </Button>
        <Button
          v-if="canGenerateAllocation && canAllocate(detail)"
          size="small"
          @click="requestAllocation(detail, 'AI')"
        >
          AI 建议
        </Button>
        <Button
          v-if="canUpdate && isUnallocated(detail)"
          size="small"
          @click="openEdit(detail)"
        >
          修改到账
        </Button>
      </Space>
    </template>
    <Spin :spinning="detailLoading">
      <BankReceiptDetail :receipt="detail" />
    </Spin>
  </Drawer>

  <BankReceiptEditModal
    :open="editorOpen"
    :receipt="editorReceipt"
    @close="editorOpen = false"
    @saved="handleSaved"
  />

  <Modal
    v-model:open="voidOpen"
    :confirm-loading="voiding"
    ok-text="确认作废"
    title="作废银行到账"
    @ok="confirmVoid"
  >
    <Alert
      description="只有未分配到账可作废。作废不会删除流水、汇率快照或审计证据。"
      message="不可逆业务状态变更"
      show-icon
      type="warning"
    />
    <Input.TextArea
      v-model:value="voidReason"
      class="bank-receipt-list__void-reason"
      :maxlength="500"
      placeholder="请输入银行冲正、重复流水等具体原因"
      :rows="4"
      show-count
    />
  </Modal>
</template>

<style scoped>
.bank-receipt-list {
  min-height: 280px;
  overflow: hidden;
  border: 1px solid #e5eaf1;
  border-radius: 8px;
}

.bank-receipt-list__stack {
  display: grid;
  gap: 3px;
  min-width: 0;
}

.bank-receipt-list__stack :deep(.ant-btn-link) {
  justify-self: flex-start;
  height: auto;
  padding: 0;
  font-weight: 650;
}

.bank-receipt-list__stack > span,
.bank-receipt-list__stack :deep(.ant-typography) {
  font-size: 12px;
  color: #64748b;
}

.bank-receipt-list__cny {
  color: #0f4c81;
  white-space: nowrap;
}

.bank-receipt-list__empty {
  display: grid;
  place-items: center;
  min-height: 250px;
  padding: 32px;
  color: #94a3b8;
}

.bank-receipt-list__empty > svg {
  font-size: 42px;
  color: #91caff;
}

.bank-receipt-list__empty strong {
  font-size: 16px;
  color: #334155;
}

.bank-receipt-list__empty p {
  margin: 0 0 8px;
}

.bank-receipt-list__pagination {
  display: flex;
  gap: 16px;
  align-items: center;
  justify-content: space-between;
  width: 100%;
}

.bank-receipt-list__pagination > span {
  color: #64748b;
}

.bank-receipt-list__void-reason {
  margin-top: 14px;
}

@media (max-width: 720px) {
  .bank-receipt-list__pagination {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>
