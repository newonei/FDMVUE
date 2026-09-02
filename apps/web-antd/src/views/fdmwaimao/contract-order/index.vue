<script lang="ts" setup>
import type { ColumnsType } from 'ant-design-vue/es/table';
import type { Dayjs } from 'dayjs';

import type { FdmWaimaoContractOrderApi } from '#/api/fdmwaimao/contract-order';
import type { FdmWaimaoDemandPlanApi } from '#/api/fdmwaimao/demand-plan';
import type { TradeRelationLink } from '#/views/fdm-trade-shared/components';

import {
  computed,
  onBeforeUnmount,
  onMounted,
  reactive,
  ref,
  watch,
} from 'vue';
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router';

import { useAccess } from '@vben/access';
import { IconifyIcon } from '@vben/icons';

import {
  Button,
  DatePicker,
  Dropdown,
  Input,
  Menu,
  message,
  Modal,
  Pagination,
  Select,
  Space,
  Table,
  Tag,
} from 'ant-design-vue';
import dayjs from 'dayjs';

import {
  cancelContractOrder,
  confirmContractOrder,
  deleteContractOrder,
  getContractOrder,
  getContractOrderFormOptions,
  getContractOrderPage,
} from '#/api/fdmwaimao/contract-order';
import { getCustomerPage } from '#/api/fdmwaimao/customer';
import { getDemandPlanSummaryByOrder } from '#/api/fdmwaimao/demand-plan';
import { useFdmWaimaoAiContext } from '#/views/fdm-trade-shared/ai-assistant/context';
import {
  TradeBusinessLink,
  TradeDetailDrawer,
  TradeListShell,
} from '#/views/fdm-trade-shared/components';
import { fdmTradeDocumentRoute } from '#/views/fdm-trade-shared/document-links';

import { formatCurrencyAmount } from './amount';
import ContractOrderDetail from './components/ContractOrderDetail.vue';
import { buildContractFulfillmentContext } from './form-model';

defineOptions({ name: 'FdmWaimaoContractOrder' });

interface CustomerSelectOption {
  label: string;
  value: string;
}

const route = useRoute();
const router = useRouter();
const { hasAccessByCodes } = useAccess();

const columns: ColumnsType<FdmWaimaoContractOrderApi.PageItem> = [
  { fixed: 'left', key: 'order', title: '合同单号 / 主题', width: 230 },
  {
    dataIndex: 'alibabaTradeAssuranceNo',
    key: 'alibabaTradeAssuranceNo',
    title: '阿里信保单号',
    width: 170,
  },
  { key: 'customer', title: '对应客户 / 联系人', width: 210 },
  { key: 'orderType', title: '类型', width: 100 },
  { dataIndex: 'signDate', key: 'signDate', title: '签单日期', width: 115 },
  {
    dataIndex: 'companyName',
    key: 'companyName',
    title: '订单所属公司',
    width: 180,
  },
  {
    dataIndex: 'ownerUserName',
    key: 'ownerUserName',
    title: '所有者',
    width: 140,
  },
  { key: 'totalAmount', title: '总金额', width: 145 },
  { key: 'settlement', title: '现金回款 / 消费 / 未回款', width: 230 },
  { key: 'updateTime', title: '更新时间', width: 155 },
  { fixed: 'right', key: 'actions', title: '操作', width: 210 },
];

const filters = reactive<FdmWaimaoContractOrderApi.PageReq>({
  pageNo: 1,
  pageSize: 20,
});
const signDateRange = ref<[Dayjs, Dayjs]>();
const rows = ref<FdmWaimaoContractOrderApi.PageItem[]>([]);
const total = ref(0);
const loading = ref(false);
const formOptions = ref<FdmWaimaoContractOrderApi.FormOptions>({
  companies: [],
  owners: [],
});
const customerOptions = ref<CustomerSelectOption[]>([]);
const customerSearching = ref(false);
const deletingIds = ref(new Set<string>());
const transitioningIds = ref(new Set<string>());
const cancelOpen = ref(false);
const cancelReason = ref('');
const cancelTarget = ref<FdmWaimaoContractOrderApi.PageItem>();
const cancelling = ref(false);

const detailOpen = ref(false);
const detailLoading = ref(false);
const detail = ref<FdmWaimaoContractOrderApi.ContractDetail>();
const detailDemandPlan = ref<FdmWaimaoDemandPlanApi.OrderSummary>();

let pageRequestId = 0;
let detailRequestId = 0;
let customerRequestId = 0;
let customerSearchTimer: ReturnType<typeof setTimeout> | undefined;

useFdmWaimaoAiContext(() => ({
  businessId: detailOpen.value ? detail.value?.id : undefined,
  context: detailOpen.value
    ? {
        loading: detailLoading.value,
        selectedOrder: detail.value,
        fulfillmentConstraints: detail.value
          ? buildContractFulfillmentContext(detail.value)
          : undefined,
      }
    : {
        filters: { ...filters },
        total: total.value,
        visibleRows: rows.value,
      },
  contextMode: detailOpen.value ? 'detail' : 'list',
  entityLabel:
    detailOpen.value && detail.value
      ? `${detail.value.orderNo} · ${detail.value.subject}`
      : undefined,
  surfaceKey: 'contract-order',
}));

const canCreate = computed(() =>
  hasAccessByCodes(['fdmwaimao:contract-order:create']),
);
const canUpdate = computed(() =>
  hasAccessByCodes(['fdmwaimao:contract-order:update']),
);
const canDelete = computed(() =>
  hasAccessByCodes(['fdmwaimao:contract-order:delete']),
);
const canConfirm = computed(() =>
  hasAccessByCodes(['fdmwaimao:contract-order:confirm']),
);
const canCancel = computed(() =>
  hasAccessByCodes(['fdmwaimao:contract-order:cancel']),
);
const canCreateReceipt = computed(() =>
  hasAccessByCodes(['fdmwaimao:receipt-record:create']),
);
const canCreateConsumption = computed(() =>
  hasAccessByCodes(['fdmwaimao:consumption-record:create']),
);
const canQueryCustomer = computed(() =>
  hasAccessByCodes(['fdmwaimao:customer:query']),
);
const canQueryDemandPlan = computed(() =>
  hasAccessByCodes(['fdmwaimao:demand-plan:query']),
);

function demandPlanStatusLabel(status?: null | string) {
  switch (status) {
    case 'AI_DRAFT': {
      return 'AI 草稿';
    }
    case 'CONFIRMED': {
      return '已确认';
    }
    case 'NEEDS_REPLAN': {
      return '需要重排';
    }
    case 'VOIDED': {
      return '已作废';
    }
    default: {
      return '草稿';
    }
  }
}

function demandPlanStatusTone(
  status?: null | string,
): TradeRelationLink['statusTone'] {
  if (status === 'CONFIRMED') return 'success';
  if (status === 'NEEDS_REPLAN') return 'warning';
  return 'processing';
}

const detailRelatedDocuments = computed<TradeRelationLink[]>(() => {
  const summary = detailDemandPlan.value;
  if (!summary?.latestPlanId || !canQueryDemandPlan.value) return [];
  return [
    {
      icon: 'lucide:route',
      key: `demand-plan-${summary.latestPlanId}`,
      label: summary.latestPlanNo || '履约需求计划',
      meta: `修订 R${summary.latestRevisionNo || 1}`,
      status: demandPlanStatusLabel(summary.latestPlanStatus),
      statusTone: demandPlanStatusTone(summary.latestPlanStatus),
      to: fdmTradeDocumentRoute('demand-plan', summary.latestPlanId),
      type: '履约需求计划',
    },
  ];
});
const activeRelationFilters = computed(() => {
  if (!filters.customerId) return [];
  const customer = customerOptions.value.find(
    (option) => option.value === filters.customerId,
  );
  return [
    {
      key: 'customerId',
      label: '关联客户',
      value: customer?.label || filters.customerId,
    },
  ];
});

const companyOptions = computed(() =>
  (formOptions.value.companies ?? []).map((item) => ({
    label: item.name,
    value: item.id,
  })),
);

const ownerOptions = computed(() =>
  (formOptions.value.owners ?? []).map((item) => ({
    label: item.deptName ? `${item.name} · ${item.deptName}` : item.name,
    value: item.id,
  })),
);

function display(value: null | string | undefined) {
  return value || '—';
}

function formatDateTime(
  value: FdmWaimaoContractOrderApi.DateTimeValue | null | undefined,
) {
  if (value === null || value === undefined || value === '') return '—';
  const parsed = dayjs(value);
  return parsed.isValid() ? parsed.format('YYYY-MM-DD HH:mm') : String(value);
}

function orderTypeLabel(value: FdmWaimaoContractOrderApi.OrderType) {
  return value === 'SAMPLE' ? '样品' : '大货';
}

function statusLabel(value: FdmWaimaoContractOrderApi.OrderStatus) {
  if (value === 'CONFIRMED') return '已确认';
  if (value === 'CANCELLED') return '已取消';
  return '草稿';
}

function statusColor(value: FdmWaimaoContractOrderApi.OrderStatus) {
  if (value === 'CONFIRMED') return 'success';
  if (value === 'CANCELLED') return 'default';
  return 'processing';
}

async function loadPage(resetPage = false) {
  if (resetPage) filters.pageNo = 1;
  const requestId = ++pageRequestId;
  loading.value = true;
  try {
    const result = await getContractOrderPage({
      ...filters,
      keyword: filters.keyword?.trim() || undefined,
    });
    if (requestId === pageRequestId) {
      rows.value = result.list ?? [];
      total.value = result.total ?? 0;
      const selectedCustomer = rows.value.find(
        (item) => item.customerId === filters.customerId,
      );
      if (
        selectedCustomer &&
        !customerOptions.value.some(
          (option) => option.value === selectedCustomer.customerId,
        )
      ) {
        customerOptions.value.unshift({
          label: selectedCustomer.customerName,
          value: selectedCustomer.customerId,
        });
      }
    }
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
    const options = (result.list ?? []).map((item) => ({
      label: `${item.name} · ${item.customerCode}`,
      value: item.id,
    }));
    const current = rows.value.find(
      (item) => item.customerId === filters.customerId,
    );
    if (
      filters.customerId &&
      current &&
      !options.some((item) => item.value === filters.customerId)
    ) {
      options.unshift({
        label: current.customerName,
        value: current.customerId,
      });
    }
    customerOptions.value = options;
  } finally {
    if (requestId === customerRequestId) customerSearching.value = false;
  }
}

function searchCustomers(keyword: string) {
  if (customerSearchTimer) clearTimeout(customerSearchTimer);
  customerSearchTimer = setTimeout(() => void searchCustomersNow(keyword), 300);
}

function handleCustomerDropdown(open: boolean) {
  if (open) void searchCustomersNow();
}

function changeSignDateRange(value: [Dayjs, Dayjs] | [string, string] | null) {
  const normalized = value
    ? ([dayjs(value[0]), dayjs(value[1])] as [Dayjs, Dayjs])
    : undefined;
  signDateRange.value = normalized;
  filters.signDate = normalized
    ? [normalized[0].format('YYYY-MM-DD'), normalized[1].format('YYYY-MM-DD')]
    : undefined;
}

function resetFilters() {
  filters.keyword = undefined;
  filters.customerId = undefined;
  filters.ownerUserId = undefined;
  filters.companyId = undefined;
  filters.status = undefined;
  filters.signDate = undefined;
  signDateRange.value = undefined;
  void loadPage(true);
}

function removeRelationFilter(key: string) {
  if (key === 'customerId') filters.customerId = undefined;
  void loadPage(true);
}

function routeQueryValue(value: unknown) {
  return Array.isArray(value) ? String(value[0] || '') : String(value || '');
}

function hydrateRouteFilters() {
  filters.customerId = routeQueryValue(route.query.customerId) || undefined;
}

async function changePage(pageNo: number, pageSize: number) {
  filters.pageNo = pageNo;
  filters.pageSize = pageSize;
  await loadPage();
}

function createOrder() {
  void router.push('/fdmwaimao/contract-order/create');
}

function createReceipt(id: string) {
  detailOpen.value = false;
  void router.push({
    path: '/fdmwaimao/receipt-record/create',
    query: { orderId: id, type: 'receipt' },
  });
}

function createConsumption(id: string) {
  detailOpen.value = false;
  void router.push({
    path: '/fdmwaimao/receipt-record/consumption/create',
    query: { orderId: id, type: 'consumption' },
  });
}

function editOrder(id: string) {
  detailOpen.value = false;
  void router.push(`/fdmwaimao/contract-order/edit/${id}`);
}

async function openOrder(id: string) {
  if (typeof window !== 'undefined' && window.innerWidth < 768) {
    await router.push(`/fdmwaimao/contract-order/detail/${id}`);
    return;
  }
  const requestId = ++detailRequestId;
  detailOpen.value = true;
  detail.value = undefined;
  detailDemandPlan.value = undefined;
  detailLoading.value = true;
  try {
    const result = await getContractOrder(id);
    if (requestId === detailRequestId) {
      detail.value = result;
      if (canQueryDemandPlan.value) {
        void getDemandPlanSummaryByOrder(id)
          .then((summary) => {
            if (requestId === detailRequestId) {
              detailDemandPlan.value = summary;
            }
          })
          .catch(() => undefined);
      }
    }
  } finally {
    if (requestId === detailRequestId) detailLoading.value = false;
  }
}

async function openIndependentPage() {
  if (!detail.value) return;
  await router.push(`/fdmwaimao/contract-order/detail/${detail.value.id}`);
  detailOpen.value = false;
}

async function reloadChangedOrder(id: string) {
  await loadPage();
  if (detailOpen.value && detail.value?.id === id) {
    detail.value = await getContractOrder(id);
  }
}

function markTransitioning(id: string, active: boolean) {
  const next = new Set(transitioningIds.value);
  if (active) next.add(id);
  else next.delete(id);
  transitioningIds.value = next;
}

function confirmOrder(record: Record<string, any>) {
  const row = record as unknown as FdmWaimaoContractOrderApi.PageItem;
  const fulfillmentContext = buildContractFulfillmentContext(row);
  if (!fulfillmentContext.confirmationReady) {
    message.warning(
      fulfillmentContext.confirmationIssues[0]?.message ||
        '请先完善合同的履约与合规约束',
    );
    return;
  }
  Modal.confirm({
    content:
      '确认后合同内容、产品成交快照及履约合规约束将冻结，之后才能登记回款或消费冲销。',
    okText: '确认合同',
    title: `确认合同 ${row.orderNo}？`,
    async onOk() {
      if (transitioningIds.value.has(row.id)) return;
      markTransitioning(row.id, true);
      try {
        await confirmContractOrder({
          expectedVersion: row.version,
          id: row.id,
        });
        await reloadChangedOrder(row.id);
        message.success('合同已确认，现可登记回款或消费记录');
      } finally {
        markTransitioning(row.id, false);
      }
    },
  });
}

function firstFulfillmentIssue(record: Record<string, any>) {
  const row = record as unknown as FdmWaimaoContractOrderApi.PageItem;
  return buildContractFulfillmentContext(row).confirmationIssues[0]?.message;
}

function openCancel(record: Record<string, any>) {
  cancelTarget.value = record as unknown as FdmWaimaoContractOrderApi.PageItem;
  cancelReason.value = '';
  cancelOpen.value = true;
}

async function submitCancel() {
  const target = cancelTarget.value;
  const reason = cancelReason.value.trim();
  if (!target) return;
  if (!reason) {
    message.warning('请填写取消原因');
    return;
  }
  cancelling.value = true;
  markTransitioning(target.id, true);
  try {
    await cancelContractOrder({
      expectedVersion: target.version,
      id: target.id,
      reason,
    });
    cancelOpen.value = false;
    await reloadChangedOrder(target.id);
    message.success('合同草稿已取消');
  } finally {
    cancelling.value = false;
    markTransitioning(target.id, false);
  }
}

function confirmDelete(record: Record<string, unknown>) {
  const row = record as unknown as FdmWaimaoContractOrderApi.PageItem;
  Modal.confirm({
    content: `删除后合同草稿“${row.orderNo}”将不再显示。`,
    okButtonProps: { danger: true },
    okText: '删除草稿',
    title: '确认删除合同草稿？',
    async onOk() {
      if (deletingIds.value.has(row.id)) return;
      deletingIds.value = new Set(deletingIds.value).add(row.id);
      try {
        await deleteContractOrder(row.id);
        if (detail.value?.id === row.id) detailOpen.value = false;
        await loadPage();
        message.success('合同草稿已删除');
      } finally {
        const next = new Set(deletingIds.value);
        next.delete(row.id);
        deletingIds.value = next;
      }
    },
  });
}

function hasSecondaryActions(source: unknown) {
  const row = source as FdmWaimaoContractOrderApi.PageItem;
  return (
    (row.status === 'CONFIRMED' && canCreateConsumption.value) ||
    (row.status === 'DRAFT' &&
      (canConfirm.value || canCancel.value || canDelete.value))
  );
}

function handleSecondaryAction(key: string, record: Record<string, unknown>) {
  const row = record as unknown as FdmWaimaoContractOrderApi.PageItem;
  if (key === 'consumption') createConsumption(row.id);
  if (key === 'confirm') confirmOrder(record);
  if (key === 'cancel') openCancel(record);
  if (key === 'delete') confirmDelete(record);
}

onMounted(async () => {
  hydrateRouteFilters();
  await Promise.all([loadPage(), loadOptions(), searchCustomersNow()]);
});

onBeforeRouteLeave(() => {
  detailOpen.value = false;
  detailRequestId += 1;
});

watch(
  () => route.query.customerId,
  async () => {
    const customerId = routeQueryValue(route.query.customerId) || undefined;
    if (customerId === filters.customerId) return;
    filters.customerId = customerId;
    await Promise.all([loadPage(true), searchCustomersNow()]);
  },
);

onBeforeUnmount(() => {
  if (customerSearchTimer) clearTimeout(customerSearchTimer);
  pageRequestId += 1;
  detailRequestId += 1;
  customerRequestId += 1;
});
</script>

<template>
  <TradeListShell
    :active-filters="activeRelationFilters"
    description="从草稿确认成交合同，冻结成交快照后登记真实回款与消费冲销。"
    :loading="loading"
    title="合同订单"
    @clear-filters="resetFilters"
    @remove-filter="removeRelationFilter"
  >
    <template #actions>
      <Button v-if="canCreate" type="primary" @click="createOrder">
        <template #icon>
          <IconifyIcon icon="lucide:plus" aria-hidden="true" />
        </template>
        新建合同草稿
      </Button>
    </template>

    <template #filters>
      <Input
        v-model:value="filters.keyword"
        allow-clear
        placeholder="主题、合同号、信保号或客户"
        @press-enter="loadPage(true)"
      />
      <Select
        v-model:value="filters.customerId"
        allow-clear
        :filter-option="false"
        :loading="customerSearching"
        :options="customerOptions"
        placeholder="全部客户"
        show-search
        @dropdown-visible-change="handleCustomerDropdown"
        @search="searchCustomers"
      />
      <Select
        v-model:value="filters.ownerUserId"
        allow-clear
        :options="ownerOptions"
        placeholder="全部所有者"
        show-search
      />
      <Select
        v-model:value="filters.companyId"
        allow-clear
        :options="companyOptions"
        placeholder="全部公司"
        show-search
      />
      <DatePicker.RangePicker
        :value="signDateRange"
        @change="changeSignDateRange"
      />
      <Select
        v-model:value="filters.status"
        allow-clear
        :options="[
          { label: '草稿', value: 'DRAFT' },
          { label: '已确认', value: 'CONFIRMED' },
          { label: '已取消', value: 'CANCELLED' },
        ]"
        placeholder="全部合同状态"
      />
    </template>

    <template #filter-actions>
      <Button type="primary" @click="loadPage(true)">查询</Button>
      <Button @click="resetFilters">重置</Button>
    </template>

    <div class="contract-order-page__table">
      <Table
        :columns="columns"
        :data-source="rows"
        :loading="loading"
        :pagination="false"
        row-key="id"
        :scroll="{ x: 1900, y: 'calc(100vh - 390px)' }"
        size="middle"
      >
        <template #emptyText>
          <div class="contract-order-page__empty">
            <IconifyIcon icon="lucide:file-signature" aria-hidden="true" />
            <strong>还没有合同订单</strong>
            <p>从真实交易客户开始录入第一张合同草稿，确认后进入结算。</p>
            <Button
              v-if="canCreate"
              size="small"
              type="primary"
              @click="createOrder"
            >
              新建合同草稿
            </Button>
          </div>
        </template>
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'order'">
            <div class="contract-order-page__identity">
              <div>
                <Button type="link" @click="openOrder(record.id)">
                  {{ record.orderNo }}
                </Button>
                <Tag :color="statusColor(record.status)">
                  {{ statusLabel(record.status) }}
                </Tag>
              </div>
              <div class="contract-order-page__subject">
                <button
                  :title="record.subject"
                  type="button"
                  @click="openOrder(record.id)"
                >
                  {{ record.subject }}
                </button>
              </div>
            </div>
          </template>
          <template v-else-if="column.key === 'alibabaTradeAssuranceNo'">
            {{ record.alibabaTradeAssuranceNo }}
          </template>
          <template v-else-if="column.key === 'customer'">
            <div class="contract-order-page__stack">
              <TradeBusinessLink
                :disabled="!canQueryCustomer"
                :to="
                  canQueryCustomer
                    ? fdmTradeDocumentRoute('customer', record.customerId)
                    : undefined
                "
              >
                {{ record.customerName }}
              </TradeBusinessLink>
              <span>{{ display(record.contactName) }}</span>
            </div>
          </template>
          <template v-else-if="column.key === 'orderType'">
            <Tag :color="record.orderType === 'SAMPLE' ? 'purple' : 'cyan'">
              {{ orderTypeLabel(record.orderType) }}
            </Tag>
          </template>
          <template v-else-if="column.key === 'ownerUserName'">
            {{ display(record.ownerUserName) }}
          </template>
          <template v-else-if="column.key === 'totalAmount'">
            <strong class="contract-order-page__money">
              {{ record.currency }}
              {{ formatCurrencyAmount(record.totalAmount) }}
            </strong>
          </template>
          <template v-else-if="column.key === 'settlement'">
            <div class="contract-order-page__settlement">
              <span>
                现金
                <strong>
                  {{ record.currency }}
                  {{ formatCurrencyAmount(record.cashReceivedAmount) }}
                </strong>
              </span>
              <span>
                消费
                <strong>
                  {{ record.currency }}
                  {{ formatCurrencyAmount(record.consumptionAmount) }}
                </strong>
              </span>
              <span>
                未回
                <strong>
                  {{ record.currency }}
                  {{
                    formatCurrencyAmount(
                      record.outstandingAmount ?? record.totalAmount,
                    )
                  }}
                </strong>
              </span>
            </div>
          </template>
          <template v-else-if="column.key === 'updateTime'">
            {{ formatDateTime(record.updateTime) }}
          </template>
          <template v-else-if="column.key === 'actions'">
            <Space :size="4">
              <Button size="small" type="link" @click="openOrder(record.id)">
                查看
              </Button>
              <Button
                v-if="canCreateReceipt && record.status === 'CONFIRMED'"
                size="small"
                type="link"
                @click="createReceipt(record.id)"
              >
                登记回款
              </Button>
              <Button
                v-if="canUpdate && record.status === 'DRAFT'"
                size="small"
                type="link"
                @click="editOrder(record.id)"
              >
                编辑
              </Button>
              <Dropdown v-if="hasSecondaryActions(record)" :trigger="['click']">
                <Button size="small" type="link">
                  更多
                  <IconifyIcon icon="lucide:chevron-down" aria-hidden="true" />
                </Button>
                <template #overlay>
                  <Menu
                    @click="handleSecondaryAction(String($event.key), record)"
                  >
                    <Menu.Item
                      v-if="
                        canCreateConsumption && record.status === 'CONFIRMED'
                      "
                      key="consumption"
                    >
                      记消费 / 冲销
                    </Menu.Item>
                    <Menu.Item
                      v-if="canConfirm && record.status === 'DRAFT'"
                      key="confirm"
                      :disabled="transitioningIds.has(record.id)"
                    >
                      确认合同
                    </Menu.Item>
                    <Menu.Item
                      v-if="canCancel && record.status === 'DRAFT'"
                      key="cancel"
                      :disabled="transitioningIds.has(record.id)"
                    >
                      取消合同
                    </Menu.Item>
                    <Menu.Divider
                      v-if="canDelete && record.status === 'DRAFT'"
                    />
                    <Menu.Item
                      v-if="canDelete && record.status === 'DRAFT'"
                      key="delete"
                      danger
                      :disabled="deletingIds.has(record.id)"
                    >
                      删除草稿
                    </Menu.Item>
                  </Menu>
                </template>
              </Dropdown>
            </Space>
          </template>
        </template>
      </Table>
    </div>

    <template #summary>
      <div class="contract-order-page__pagination">
        <span>共 {{ total }} 张合同</span>
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

  <TradeDetailDrawer
    v-model:open="detailOpen"
    document-type="合同单"
    :loading="detailLoading"
    show-independent-page
    :status="detail ? statusLabel(detail.status) : undefined"
    :status-tone="
      detail?.status === 'CONFIRMED'
        ? 'success'
        : detail?.status === 'CANCELLED'
          ? 'default'
          : 'processing'
    "
    :subtitle="detail?.subject"
    :title="detail?.orderNo || '合同订单详情'"
    @independent-page="openIndependentPage"
  >
    <template #header-actions>
      <Space>
        <Button
          v-if="canCreateReceipt && detail?.status === 'CONFIRMED'"
          size="small"
          @click="createReceipt(detail.id)"
        >
          登记回款
        </Button>
        <Button
          v-if="canCreateConsumption && detail?.status === 'CONFIRMED'"
          size="small"
          @click="createConsumption(detail.id)"
        >
          记消费
        </Button>
        <Button
          v-if="canConfirm && detail?.status === 'DRAFT'"
          :disabled="Boolean(firstFulfillmentIssue(detail))"
          :loading="transitioningIds.has(detail.id)"
          size="small"
          :title="firstFulfillmentIssue(detail)"
          type="primary"
          @click="confirmOrder(detail)"
        >
          确认合同
        </Button>
        <Button
          v-if="canCancel && detail?.status === 'DRAFT'"
          :loading="transitioningIds.has(detail.id)"
          size="small"
          @click="openCancel(detail)"
        >
          取消合同
        </Button>
        <Button
          v-if="canUpdate && detail?.status === 'DRAFT'"
          size="small"
          type="primary"
          @click="editOrder(detail.id)"
        >
          编辑草稿
        </Button>
      </Space>
    </template>
    <ContractOrderDetail
      :order="detail"
      :related-documents="detailRelatedDocuments"
    />
  </TradeDetailDrawer>

  <Modal
    v-model:open="cancelOpen"
    :confirm-loading="cancelling"
    ok-text="确认取消"
    title="取消合同草稿"
    @ok="submitCancel"
  >
    <p>
      {{ cancelTarget?.orderNo }} 取消后不可恢复，也不能再登记回款或消费记录。
    </p>
    <Input.TextArea
      v-model:value="cancelReason"
      :auto-size="{ minRows: 3, maxRows: 6 }"
      :maxlength="500"
      placeholder="请填写取消原因（必填）"
      show-count
    />
  </Modal>
</template>

<style scoped>
.contract-order-page__table {
  min-height: 260px;
  overflow: hidden;
  border: 1px solid #e5eaf1;
  border-radius: 4px;
}

.contract-order-page__identity,
.contract-order-page__stack {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}

.contract-order-page__identity > div {
  display: flex;
  align-items: center;
}

.contract-order-page__identity :deep(.ant-btn-link) {
  height: auto;
  padding: 0 8px 0 0;
  font-weight: 600;
}

.contract-order-page__subject button {
  max-width: 100%;
  padding: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  font: inherit;
  color: var(--ant-color-primary, #1677ff);
  text-align: left;
  white-space: nowrap;
  cursor: pointer;
  background: transparent;
  border: 0;
}

.contract-order-page__subject button:hover {
  text-decoration: underline;
  text-underline-offset: 2px;
}

.contract-order-page__subject button:focus-visible {
  outline: 2px solid var(--ant-color-primary-border, #91caff);
  outline-offset: 2px;
}

.contract-order-page__stack span {
  font-size: 12px;
  color: #94a3b8;
}

.contract-order-page__money {
  color: #0f4c81;
  white-space: nowrap;
}

.contract-order-page__settlement {
  display: grid;
  gap: 3px;
  font-size: 12px;
}

.contract-order-page__settlement span {
  display: flex;
  gap: 10px;
  justify-content: space-between;
  color: #94a3b8;
}

.contract-order-page__settlement strong {
  font-variant-numeric: tabular-nums;
  color: #475569;
  white-space: nowrap;
}

.contract-order-page__empty {
  display: flex;
  flex-direction: column;
  gap: 8px;
  align-items: center;
  justify-content: center;
  min-height: 220px;
  color: #94a3b8;
}

.contract-order-page__empty > :first-child {
  font-size: 34px;
}

.contract-order-page__empty strong {
  color: #475569;
}

.contract-order-page__empty p {
  margin: 0;
}

.contract-order-page__pagination {
  display: flex;
  gap: 18px;
  align-items: center;
  justify-content: space-between;
  width: 100%;
}

.contract-order-page__pagination > span {
  color: #64748b;
}

@media (max-width: 700px) {
  .contract-order-page__pagination {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>
