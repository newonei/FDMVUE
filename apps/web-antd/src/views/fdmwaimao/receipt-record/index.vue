<script lang="ts" setup>
import type { ColumnsType } from 'ant-design-vue/es/table';
import type { Dayjs } from 'dayjs';

import type { ReceiptWorkspaceKey } from './workspace-route';

import type { FdmWaimaoExchangeRateApi } from '#/api/fdmwaimao/exchange-rate';
import type { FdmWaimaoReceiptRecordApi } from '#/api/fdmwaimao/receipt-record';

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
  Alert,
  Button,
  DatePicker,
  Input,
  message,
  Modal,
  Pagination,
  Select,
  Space,
  Table,
  Tabs,
  Tag,
  TypographyText,
} from 'ant-design-vue';
import dayjs from 'dayjs';

import { getContractOrderPage } from '#/api/fdmwaimao/contract-order';
import { getExchangeRateCurrencies } from '#/api/fdmwaimao/exchange-rate';
import {
  getConsumptionRecord,
  getConsumptionRecordPage,
  getReceiptRecord,
  getReceiptRecordPage,
  voidConsumptionRecord,
  voidReceiptRecord,
} from '#/api/fdmwaimao/receipt-record';
import { useFdmWaimaoAiContext } from '#/views/fdm-trade-shared/ai-assistant/context';
import {
  TradeBusinessLink,
  TradeDetailDrawer,
  TradeListShell,
} from '#/views/fdm-trade-shared/components';
import { fdmTradeDocumentRoute } from '#/views/fdm-trade-shared/document-links';

import { formatAmount, sumCnyAmounts } from './calculation';
import ReceiptRecordDetail from './components/ReceiptRecordDetail.vue';
import { normalizeRecordType } from './form-model';
import {
  normalizeReceiptWorkspace,
  receiptWorkspaceRouteQuery,
  selectAuthorizedReceiptWorkspace,
} from './workspace-route';

defineOptions({ name: 'FdmWaimaoReceiptRecord' });

type RecordRow =
  | FdmWaimaoReceiptRecordApi.ConsumptionRecord
  | FdmWaimaoReceiptRecordApi.ReceiptRecord;

interface OrderSelectOption {
  label: string;
  value: string;
}

const route = useRoute();
const router = useRouter();
const { hasAccessByCodes } = useAccess();

const activeWorkspace = ref<ReceiptWorkspaceKey>(
  normalizeReceiptWorkspace(route.query.workspace, route.query.type),
);
let recordsInitialized = false;

const receiptColumns: ColumnsType<RecordRow> = [
  { fixed: 'left', key: 'record', title: '回款编号', width: 180 },
  { key: 'order', title: '合同 / 客户', width: 235 },
  { key: 'date', title: '回款日期 / 期次', width: 135 },
  { key: 'method', title: '渠道 / 付款方式', width: 170 },
  { key: 'originalAmount', title: '原币到款', width: 140 },
  { key: 'rate', title: 'ECB 汇率', width: 135 },
  { key: 'cnyAmount', title: '折人民币', width: 145 },
  { key: 'allocated', title: '冲销合同金额', width: 150 },
  { key: 'invoice', title: '开票', width: 90 },
  { key: 'owner', title: '所有者', width: 110 },
  { key: 'status', title: '状态', width: 90 },
  { fixed: 'right', key: 'actions', title: '操作', width: 170 },
];

const consumptionColumns: ColumnsType<RecordRow> = [
  { fixed: 'left', key: 'record', title: '消费编号', width: 180 },
  { key: 'order', title: '合同 / 客户', width: 235 },
  { key: 'date', title: '消费日期', width: 115 },
  { key: 'kind', title: '消费类型', width: 150 },
  { key: 'originalAmount', title: '原币金额', width: 140 },
  { key: 'rate', title: 'ECB 汇率', width: 135 },
  { key: 'cnyAmount', title: '折人民币', width: 145 },
  { key: 'allocated', title: '冲销合同金额', width: 150 },
  { dataIndex: 'reason', key: 'reason', title: '原因', width: 220 },
  { key: 'owner', title: '所有者', width: 110 },
  { key: 'status', title: '状态', width: 90 },
  { fixed: 'right', key: 'actions', title: '操作', width: 170 },
];

const activeType = ref<FdmWaimaoReceiptRecordApi.RecordType>(
  normalizeRecordType(route.query.type),
);
const filters = reactive<FdmWaimaoReceiptRecordApi.PageReq>({
  pageNo: 1,
  pageSize: 20,
});
const dateRange = ref<[Dayjs, Dayjs]>();
const rows = ref<RecordRow[]>([]);
const total = ref(0);
const loading = ref(false);
const currencies = ref<FdmWaimaoExchangeRateApi.CurrencyOption[]>([]);
const orderOptions = ref<OrderSelectOption[]>([]);
const orderSearching = ref(false);

const detailOpen = ref(false);
const detailLoading = ref(false);
const detail = ref<RecordRow>();
const detailType = ref<FdmWaimaoReceiptRecordApi.RecordType>('receipt');

const voidOpen = ref(false);
const voidTarget = ref<RecordRow>();
const voidReason = ref('');
const voiding = ref(false);

let pageRequestId = 0;
let detailRequestId = 0;
let orderRequestId = 0;
let orderSearchTimer: ReturnType<typeof setTimeout> | undefined;

useFdmWaimaoAiContext(() => ({
  businessId: detailOpen.value ? detail.value?.id : undefined,
  context: detailOpen.value
    ? {
        loading: detailLoading.value,
        selectedRecord: detail.value,
      }
    : {
        activeWorkspace: activeWorkspace.value,
        activeType: activeType.value,
        dateRange: dateRange.value?.map((date) => date.format('YYYY-MM-DD')),
        filters: { ...filters },
        total: total.value,
        visibleRows: rows.value,
      },
  contextMode: detailOpen.value ? 'detail' : 'list',
  entityLabel:
    detailOpen.value && detail.value ? recordNumber(detail.value) : undefined,
  surfaceKey: 'receipt-record',
  variant: detailOpen.value ? detailType.value : activeType.value,
}));

const workspaceTabs = computed(() =>
  [
    {
      key: 'receipt' as const,
      label: '回款记录',
      permission: 'fdmwaimao:receipt-record:query',
    },
    {
      key: 'consumption' as const,
      label: '消费 / 冲销记录',
      permission: 'fdmwaimao:consumption-record:query',
    },
  ].filter((item) => hasAccessByCodes([item.permission])),
);

const columns = computed(() =>
  activeType.value === 'consumption' ? consumptionColumns : receiptColumns,
);
const permissionPrefix = computed(() =>
  activeType.value === 'consumption' ? 'consumption-record' : 'receipt-record',
);
const canCreate = computed(() =>
  hasAccessByCodes([`fdmwaimao:${permissionPrefix.value}:create`]),
);
const canUpdate = computed(() =>
  hasAccessByCodes([`fdmwaimao:${permissionPrefix.value}:update`]),
);
const canVoid = computed(() =>
  hasAccessByCodes([`fdmwaimao:${permissionPrefix.value}:void`]),
);
const canQueryContract = computed(() =>
  hasAccessByCodes(['fdmwaimao:contract-order:query']),
);
const canQueryCustomer = computed(() =>
  hasAccessByCodes(['fdmwaimao:customer:query']),
);
const currencyOptions = computed(() =>
  currencies.value.map((item) => ({
    label: item.name ? `${item.code} · ${item.name}` : item.code,
    value: item.code,
  })),
);
const currentPageCny = computed(() =>
  sumCnyAmounts(
    rows.value
      .filter((row) => row.status !== 'VOIDED')
      .map((row) =>
        'receiptAmountCny' in row ? row.receiptAmountCny : row.amountCny,
      ),
  ),
);
const activeRelationFilters = computed(() => {
  const firstMatch = rows.value[0];
  return [
    filters.orderId
      ? {
          key: 'orderId',
          label: '关联合同',
          value:
            firstMatch?.orderId === filters.orderId
              ? firstMatch.orderNo
              : filters.orderId,
        }
      : undefined,
    filters.customerId
      ? {
          key: 'customerId',
          label: '关联客户',
          value:
            firstMatch?.customerId === filters.customerId
              ? firstMatch.customerName
              : filters.customerId,
        }
      : undefined,
  ].filter(Boolean) as Array<{ key: string; label: string; value: string }>;
});

function asRow(row: Record<string, unknown> | RecordRow) {
  return row as unknown as RecordRow;
}

function recordNumber(value: Record<string, unknown> | RecordRow) {
  const row = asRow(value);
  return 'receiptNo' in row ? row.receiptNo : row.consumptionNo;
}

function businessDate(value: Record<string, unknown> | RecordRow) {
  const row = asRow(value);
  return 'receiptDate' in row ? row.receiptDate : row.consumptionDate;
}

function originalAmount(value: Record<string, unknown> | RecordRow) {
  const row = asRow(value);
  return 'arrivalAmount' in row ? row.arrivalAmount : row.amount;
}

function cnyAmount(value: Record<string, unknown> | RecordRow) {
  const row = asRow(value);
  return 'receiptAmountCny' in row ? row.receiptAmountCny : row.amountCny;
}

function consumptionLabel(value: FdmWaimaoReceiptRecordApi.ConsumptionType) {
  if (value === 'CUSTOMER_BALANCE') return '客户余额消费';
  if (value === 'WAIVER') return '审核减免 / 坏账';
  return '其他合法冲销';
}

function invoiceLabel(value: FdmWaimaoReceiptRecordApi.InvoiceStatus) {
  if (value === 'INVOICED') return '已开票';
  if (value === 'NOT_REQUIRED') return '无需开票';
  return '未开票';
}

function formatDateTime(value: null | number | string | undefined) {
  if (value === null || value === undefined || value === '') return '—';
  const parsed = dayjs(value);
  return parsed.isValid() ? parsed.format('YYYY-MM-DD HH:mm') : String(value);
}

async function loadPage(resetPage = false) {
  if (resetPage) filters.pageNo = 1;
  const requestId = ++pageRequestId;
  loading.value = true;
  try {
    const common = {
      ...filters,
      keyword: filters.keyword?.trim() || undefined,
    };
    const range = dateRange.value
      ? ([
          dateRange.value[0].format('YYYY-MM-DD'),
          dateRange.value[1].format('YYYY-MM-DD'),
        ] as [string, string])
      : undefined;
    const result =
      activeType.value === 'consumption'
        ? await getConsumptionRecordPage({
            ...common,
            consumptionDate: range,
          })
        : await getReceiptRecordPage({ ...common, receiptDate: range });
    if (requestId !== pageRequestId) return;
    rows.value = result.list ?? [];
    total.value = result.total ?? 0;
    const selectedOrder = rows.value.find(
      (row) => row.orderId === filters.orderId,
    );
    if (
      selectedOrder &&
      !orderOptions.value.some(
        (option) => option.value === selectedOrder.orderId,
      )
    ) {
      orderOptions.value.unshift({
        label: `${selectedOrder.orderNo} · ${selectedOrder.customerName}`,
        value: selectedOrder.orderId,
      });
    }
  } finally {
    if (requestId === pageRequestId) loading.value = false;
  }
}

async function searchOrdersNow(keyword = '') {
  const requestId = ++orderRequestId;
  orderSearching.value = true;
  try {
    const result = await getContractOrderPage({
      keyword: keyword.trim() || undefined,
      pageNo: 1,
      pageSize: 30,
    });
    if (requestId !== orderRequestId) return;
    orderOptions.value = (result.list ?? []).map((order) => ({
      label: `${order.orderNo} · ${order.customerName}`,
      value: order.id,
    }));
  } finally {
    if (requestId === orderRequestId) orderSearching.value = false;
  }
}

function searchOrders(keyword: string) {
  if (orderSearchTimer) clearTimeout(orderSearchTimer);
  orderSearchTimer = setTimeout(() => void searchOrdersNow(keyword), 300);
}

function changeDateRange(value: [Dayjs, Dayjs] | [string, string] | null) {
  dateRange.value = value
    ? ([dayjs(value[0]), dayjs(value[1])] as [Dayjs, Dayjs])
    : undefined;
}

function resetFilters() {
  filters.keyword = undefined;
  filters.orderId = undefined;
  filters.customerId = undefined;
  filters.currency = undefined;
  filters.status = undefined;
  filters.consumptionType = undefined;
  dateRange.value = undefined;
  void loadPage(true);
}

function removeRelationFilter(key: string) {
  if (key === 'orderId') filters.orderId = undefined;
  if (key === 'customerId') filters.customerId = undefined;
  void loadPage(true);
}

function routeQueryValue(value: unknown) {
  return Array.isArray(value) ? String(value[0] || '') : String(value || '');
}

function hydrateRelationFilters() {
  filters.orderId = routeQueryValue(route.query.orderId) || undefined;
  filters.customerId = routeQueryValue(route.query.customerId) || undefined;
}

async function changePage(pageNo: number, pageSize: number) {
  filters.pageNo = pageNo;
  filters.pageSize = pageSize;
  await loadPage();
}

async function ensureRecordsLoaded() {
  if (recordsInitialized) {
    await loadPage(true);
    return;
  }
  recordsInitialized = true;
  const [currencyResult] = await Promise.all([
    getExchangeRateCurrencies(),
    searchOrdersNow(),
    loadPage(),
  ]);
  currencies.value = currencyResult ?? [];
}

async function syncWorkspaceRoute(target: ReceiptWorkspaceKey) {
  const workspaceQuery = receiptWorkspaceRouteQuery(target);
  await router.replace({
    path: route.path,
    query: {
      ...route.query,
      detail: undefined,
      ...workspaceQuery,
    },
  });
}

async function changeWorkspace(value: number | string) {
  const target = normalizeReceiptWorkspace(value, value);
  if (!workspaceTabs.value.some((tab) => tab.key === target)) return;
  activeWorkspace.value = target;
  rows.value = [];
  detailOpen.value = false;
  if (target === 'receipt' || target === 'consumption') {
    activeType.value = target;
    filters.pageNo = 1;
    filters.consumptionType = undefined;
  }
  await syncWorkspaceRoute(target);
  if (target === 'receipt' || target === 'consumption') {
    await ensureRecordsLoaded();
  }
}

function navigateToCreate() {
  void router.push({
    path:
      activeType.value === 'consumption'
        ? '/fdmwaimao/receipt-record/consumption/create'
        : '/fdmwaimao/receipt-record/create',
    query: { type: activeType.value },
  });
}

function createRecord() {
  navigateToCreate();
}

function editRecord(value: Record<string, unknown> | RecordRow) {
  const row = asRow(value);
  void router.push({
    path:
      activeType.value === 'consumption'
        ? `/fdmwaimao/receipt-record/consumption/edit/${row.id}`
        : `/fdmwaimao/receipt-record/edit/${row.id}`,
    query: { type: activeType.value },
  });
}

async function openDetail(value: Record<string, unknown> | RecordRow) {
  const row = asRow(value);
  const type = activeType.value;
  if (typeof window !== 'undefined' && window.innerWidth < 768) {
    await router.push({
      path:
        type === 'consumption'
          ? `/fdmwaimao/receipt-record/consumption/detail/${row.id}`
          : `/fdmwaimao/receipt-record/detail/${row.id}`,
      query: { type },
    });
    return;
  }
  const requestId = ++detailRequestId;
  detailType.value = type;
  detailOpen.value = true;
  detailLoading.value = true;
  detail.value = undefined;
  try {
    const result =
      type === 'consumption'
        ? await getConsumptionRecord(row.id)
        : await getReceiptRecord(row.id);
    if (requestId === detailRequestId) detail.value = result;
  } finally {
    if (requestId === detailRequestId) detailLoading.value = false;
  }
}

async function openIndependentPage() {
  const current = detail.value;
  if (!current) return;
  await router.push({
    path:
      detailType.value === 'consumption'
        ? `/fdmwaimao/receipt-record/consumption/detail/${current.id}`
        : `/fdmwaimao/receipt-record/detail/${current.id}`,
    query: { type: detailType.value },
  });
  detailOpen.value = false;
}

function askVoid(value: Record<string, unknown> | RecordRow) {
  voidTarget.value = asRow(value);
  voidReason.value = '';
  voidOpen.value = true;
}

async function confirmVoid() {
  if (!voidTarget.value || !voidReason.value.trim()) {
    message.warning('请输入作废原因');
    return;
  }
  voiding.value = true;
  try {
    const payload = {
      expectedVersion: voidTarget.value.version,
      id: voidTarget.value.id,
      reason: voidReason.value.trim(),
    };
    await ('consumptionNo' in voidTarget.value
      ? voidConsumptionRecord(payload)
      : voidReceiptRecord(payload));
    message.success('记录已作废，合同金额已重新聚合');
    voidOpen.value = false;
    if (detail.value?.id === voidTarget.value.id) detailOpen.value = false;
    await loadPage();
  } finally {
    voiding.value = false;
  }
}

onMounted(async () => {
  hydrateRelationFilters();
  const authorizedWorkspace = selectAuthorizedReceiptWorkspace(
    activeWorkspace.value,
    workspaceTabs.value.map((tab) => tab.key),
  );
  if (authorizedWorkspace !== activeWorkspace.value) {
    activeWorkspace.value = authorizedWorkspace;
    await syncWorkspaceRoute(authorizedWorkspace);
  } else if (
    route.query.workspace !== undefined &&
    route.query.workspace !== authorizedWorkspace
  ) {
    await syncWorkspaceRoute(authorizedWorkspace);
  }
  if (
    activeWorkspace.value === 'receipt' ||
    activeWorkspace.value === 'consumption'
  ) {
    activeType.value = activeWorkspace.value;
    await ensureRecordsLoaded();
  }
});

watch(
  () =>
    [
      route.query.workspace,
      route.query.type,
      route.query.customerId,
      route.query.orderId,
    ] as const,
  ([workspace, type, customerIdValue, orderIdValue]) => {
    const normalized = normalizeReceiptWorkspace(workspace, type);
    const customerId = routeQueryValue(customerIdValue) || undefined;
    const orderId = routeQueryValue(orderIdValue) || undefined;
    let shouldReload = false;
    if (normalized !== activeWorkspace.value) {
      activeWorkspace.value = normalized;
      if (normalized === 'receipt' || normalized === 'consumption') {
        activeType.value = normalized;
        shouldReload = true;
      }
    }
    if (filters.customerId !== customerId) {
      filters.customerId = customerId;
      shouldReload = true;
    }
    if (filters.orderId !== orderId) {
      filters.orderId = orderId;
      shouldReload = true;
    }
    if (shouldReload) void ensureRecordsLoaded();
    if (workspace !== undefined && workspace !== normalized) {
      void syncWorkspaceRoute(normalized);
    }
  },
);

onBeforeRouteLeave(() => {
  detailOpen.value = false;
  detailRequestId += 1;
});

onBeforeUnmount(() => {
  if (orderSearchTimer) clearTimeout(orderSearchTimer);
  pageRequestId += 1;
  detailRequestId += 1;
  orderRequestId += 1;
});
</script>

<template>
  <div class="receipt-hub__navigation">
    <Tabs :active-key="activeWorkspace" @change="changeWorkspace">
      <Tabs.TabPane
        v-for="tab in workspaceTabs"
        :key="tab.key"
        :tab="tab.label"
      />
    </Tabs>
  </div>

  <TradeListShell
    :active-filters="activeRelationFilters"
    :description="
      activeType === 'receipt'
        ? '直接选择合同登记回款，保存后计入该合同已收金额。'
        : '记录客户余额消费、审核减免或其他非现金冲销；它不计入现金回款。'
    "
    :loading="loading"
    :title="activeType === 'receipt' ? '回款记录' : '消费 / 冲销记录'"
    @clear-filters="resetFilters"
    @remove-filter="removeRelationFilter"
  >
    <template #actions>
      <Button v-if="canCreate" type="primary" @click="createRecord">
        <template #icon>
          <IconifyIcon
            :icon="
              activeType === 'consumption'
                ? 'lucide:badge-minus'
                : 'lucide:plus'
            "
            aria-hidden="true"
          />
        </template>
        {{ activeType === 'consumption' ? '新增消费记录' : '新增回款记录' }}
      </Button>
    </template>

    <template #scope>
      <Alert
        v-if="activeType === 'consumption'"
        description="消费记录用于客户余额消费、减免/坏账或其他合法非现金冲销，不计入现金回款。"
        message="消费记录属于非现金结算"
        show-icon
        type="info"
      />
    </template>

    <template #filters>
      <Input
        v-model:value="filters.keyword"
        allow-clear
        placeholder="编号、合同、客户或付款方"
        @press-enter="loadPage(true)"
      />
      <Select
        v-model:value="filters.orderId"
        allow-clear
        :filter-option="false"
        :loading="orderSearching"
        :options="orderOptions"
        placeholder="全部合同"
        show-search
        @dropdown-visible-change="(open: boolean) => open && searchOrdersNow()"
        @search="searchOrders"
      />
      <Select
        v-model:value="filters.currency"
        allow-clear
        :options="currencyOptions"
        placeholder="全部币种"
        show-search
      />
      <DatePicker.RangePicker :value="dateRange" @change="changeDateRange" />
      <Select
        v-if="activeType === 'consumption'"
        v-model:value="filters.consumptionType"
        allow-clear
        :options="[
          { label: '客户余额消费', value: 'CUSTOMER_BALANCE' },
          { label: '审核减免 / 坏账', value: 'WAIVER' },
          { label: '其他合法冲销', value: 'OTHER' },
        ]"
        placeholder="全部消费类型"
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

    <div class="receipt-page__table">
      <Table
        :columns="columns"
        :data-source="rows"
        :loading="loading"
        :pagination="false"
        row-key="id"
        :scroll="{
          x: activeType === 'consumption' ? 1710 : 1840,
          y: 'calc(100vh - 430px)',
        }"
        size="middle"
      >
        <template #emptyText>
          <div class="receipt-page__empty">
            <IconifyIcon
              :icon="
                activeType === 'consumption'
                  ? 'lucide:badge-minus'
                  : 'lucide:landmark'
              "
              aria-hidden="true"
            />
            <strong>
              {{
                activeType === 'consumption'
                  ? '还没有消费记录'
                  : '还没有回款记录'
              }}
            </strong>
            <p>合同建立后，可随时登记真实业务数据。</p>
            <Button
              v-if="canCreate"
              size="small"
              type="primary"
              @click="createRecord"
            >
              立即登记
            </Button>
          </div>
        </template>
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'record'">
            <div class="receipt-page__identity">
              <Button type="link" @click="openDetail(record)">
                {{ recordNumber(record) }}
              </Button>
              <TypographyText type="secondary">
                {{ formatDateTime(record.updateTime) }}
              </TypographyText>
            </div>
          </template>
          <template v-else-if="column.key === 'order'">
            <div class="receipt-page__stack">
              <TradeBusinessLink
                :disabled="!canQueryContract"
                :to="
                  canQueryContract
                    ? fdmTradeDocumentRoute('contract-order', record.orderId)
                    : undefined
                "
              >
                {{ record.orderNo }}
              </TradeBusinessLink>
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
            </div>
          </template>
          <template v-else-if="column.key === 'date'">
            <div class="receipt-page__stack">
              <strong>{{ businessDate(record) }}</strong>
              <span v-if="'installmentLabel' in record">
                {{ record.installmentLabel || '未标期次' }}
              </span>
            </div>
          </template>
          <template
            v-else-if="column.key === 'method' && 'receiptMethod' in record"
          >
            <div class="receipt-page__stack">
              <strong>{{ record.receiptMethod }}</strong>
              <span>{{ record.paymentMethod || '—' }}</span>
            </div>
          </template>
          <template
            v-else-if="column.key === 'kind' && 'consumptionType' in record"
          >
            {{ consumptionLabel(record.consumptionType) }}
          </template>
          <template v-else-if="column.key === 'originalAmount'">
            <strong>{{ record.currency }}
              {{ formatAmount(originalAmount(record)) }}</strong>
          </template>
          <template v-else-if="column.key === 'rate'">
            <div class="receipt-page__stack">
              <strong>{{ record.currencyToCnyRate }}</strong>
              <span>{{ record.rateDate
                }}<template v-if="record.rateFallbackUsed">
                  · 回退</template></span>
            </div>
          </template>
          <template v-else-if="column.key === 'cnyAmount'">
            <strong class="receipt-page__cny">CNY {{ formatAmount(cnyAmount(record)) }}</strong>
          </template>
          <template v-else-if="column.key === 'allocated'">
            <strong>
              {{ record.contractCurrency }}
              {{ formatAmount(record.allocatedContractAmount) }}
            </strong>
          </template>
          <template
            v-else-if="column.key === 'invoice' && 'invoiceStatus' in record"
          >
            {{ invoiceLabel(record.invoiceStatus) }}
          </template>
          <template v-else-if="column.key === 'owner'">
            {{ record.ownerUserName || '—' }}
          </template>
          <template v-else-if="column.key === 'status'">
            <Tag :color="record.status === 'VOIDED' ? 'error' : 'success'">
              {{ record.status === 'VOIDED' ? '已作废' : '有效' }}
            </Tag>
          </template>
          <template v-else-if="column.key === 'reason' && 'reason' in record">
            <TypographyText
              :content="record.reason"
              :ellipsis="{ tooltip: record.reason }"
            />
          </template>
          <template v-else-if="column.key === 'actions'">
            <Space :size="2">
              <Button size="small" type="link" @click="openDetail(record)">
                查看
              </Button>
              <Button
                v-if="canUpdate && record.status !== 'VOIDED'"
                size="small"
                type="link"
                @click="editRecord(record)"
              >
                编辑
              </Button>
              <Button
                v-if="canVoid && record.status !== 'VOIDED'"
                danger
                size="small"
                type="link"
                @click="askVoid(record)"
              >
                作废
              </Button>
            </Space>
          </template>
        </template>
      </Table>
    </div>

    <template #summary>
      <div class="receipt-page__pagination">
        <div>
          <span>当前页 {{ rows.length }} 条</span>
          <strong>当前页有效记录折人民币 CNY
            {{ formatAmount(currentPageCny) }}</strong>
        </div>
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
    :document-type="detailType === 'consumption' ? '消费记录' : '回款记录'"
    :loading="detailLoading"
    show-independent-page
    :status="
      detail?.status === 'VOIDED' ? '已作废' : detail ? '有效' : undefined
    "
    :status-tone="detail?.status === 'VOIDED' ? 'danger' : 'success'"
    :subtitle="detail?.orderNo"
    :title="detail ? recordNumber(detail) : '记录详情'"
    @independent-page="openIndependentPage"
  >
    <template #header-actions>
      <Button
        v-if="canUpdate && detail && detail.status !== 'VOIDED'"
        size="small"
        type="primary"
        @click="editRecord(detail)"
      >
        编辑记录
      </Button>
    </template>
    <ReceiptRecordDetail :record="detail" :type="detailType" />
  </TradeDetailDrawer>

  <Modal
    v-model:open="voidOpen"
    :confirm-loading="voiding"
    ok-text="确认作废"
    title="作废记录"
    @ok="confirmVoid"
  >
    <p>作废后该记录不再参与合同回款聚合，请填写可审计的原因。</p>
    <Input.TextArea
      v-model:value="voidReason"
      :auto-size="{ minRows: 3, maxRows: 6 }"
      :maxlength="500"
      placeholder="请输入作废原因"
      show-count
    />
  </Modal>
</template>

<style scoped>
.receipt-hub__navigation {
  padding: 0 24px;
  background: var(--ant-color-bg-container, #fff);
  border-bottom: 1px solid #e5eaf1;
}

.receipt-hub__navigation :deep(.ant-tabs-nav) {
  margin-bottom: 0;
}

.receipt-page__table {
  min-height: 260px;
  overflow: hidden;
  border: 1px solid #e5eaf1;
  border-radius: 4px;
}

.receipt-page__identity,
.receipt-page__stack {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}

.receipt-page__identity :deep(.ant-btn-link) {
  align-self: flex-start;
  height: auto;
  padding: 0;
  font-weight: 600;
}

.receipt-page__identity span,
.receipt-page__stack span {
  font-size: 12px;
  color: #94a3b8;
}

.receipt-page__cny {
  color: #0f4c81;
  white-space: nowrap;
}

.receipt-page__empty {
  display: flex;
  flex-direction: column;
  gap: 8px;
  align-items: center;
  justify-content: center;
  min-height: 220px;
  color: #94a3b8;
}

.receipt-page__empty > :first-child {
  font-size: 34px;
}

.receipt-page__empty strong {
  color: #475569;
}

.receipt-page__empty p {
  margin: 0;
}

.receipt-page__pagination {
  display: flex;
  gap: 18px;
  align-items: center;
  justify-content: space-between;
  width: 100%;
}

.receipt-page__pagination > div {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 18px;
  align-items: baseline;
}

.receipt-page__pagination span {
  color: #64748b;
}

.receipt-page__pagination strong {
  color: #0f4c81;
}

@media (max-width: 700px) {
  .receipt-page__pagination {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>
