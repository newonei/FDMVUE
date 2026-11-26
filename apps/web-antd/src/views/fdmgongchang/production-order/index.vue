<script lang="ts" setup>
import type { ShortageDispatchSeed } from '../shared/schedule';

import type { FdmgongchangProductionOrderApi as Api } from '#/api/fdmgongchang/production-order';

import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { useRoute } from 'vue-router';

import { useAccess } from '@vben/access';
import { Page } from '@vben/common-ui';
import { RefreshCw, Search } from '@vben/icons';

import { useMediaQuery } from '@vueuse/core';
import { Button, Input, message, Progress, Result, Select, Table, Tabs, Tag } from 'ant-design-vue';

import {
  getFactoryProductionOrders,
  getMyProductionOrders,
  getOrderableFactories,
  getProductionOrder,
} from '#/api/fdmgongchang/production-order';

import MixBatchModal from '../schedule/modules/mix-batch-modal.vue';
import OrderSplitModal from '../schedule/modules/order-split-modal.vue';
import ScheduleBoard from '../schedule/modules/schedule-board.vue';
import ShortageDispatchModal from '../schedule/modules/shortage-dispatch-modal.vue';
import TaskManage from '../schedule/modules/task-manage.vue';
import { factoryToday } from '../shared/factory-date';
import FactorySwitch from '../shared/factory-switch.vue';
import { PROCESS_LABELS } from '../shared/schedule';
import { useFactory } from '../shared/use-factory';
import BatchRouteModal from './modules/batch-route-modal.vue';
import CreateModal from './modules/create-modal.vue';
import DeliveryModal from './modules/delivery-modal.vue';
import ExceptionLedger from './modules/exception-ledger.vue';
import ItemProductionConfigModal from './modules/item-production-config-modal.vue';
import OrderDetailModal from './modules/order-detail-modal.vue';
import OrderItemsTable from './modules/order-items-table.vue';
import RestockLedger from './modules/restock-ledger.vue';
import ScheduleModal from './modules/schedule-modal.vue';
import SourcePurchaseLink from './modules/source-purchase-link.vue';
import { dateText, num, ORDER_STATUS, remainingOrderItemQuantity, specText, timeText } from './shared';

/**
 * 工厂部门 · 工厂排单（原「工厂下单」，并入了原「AI 排单」）：工厂的人在这里操作。
 * - 本厂收到的单：运营、内贸等部门提的生产需求，以及供应商是本厂的采购单自动生成的单；
 *   工厂确认接单、回复交期（采购单的单由工厂定工艺），勾选订单预览各工序任务并下发；
 * - 辅助排单 / 历史方案：保留 AI、手动及按库存下发的旧流程；
 * - 任务管理：跨排单看已下发的任务，改派或退回任务大厅；
 * - 我提的需求：其他部门从产品中心选 SKU 向工厂提生产需求，做好的货由工厂交货到仓库。
 */
defineOptions({ name: 'FdmGongchangProductionOrder' });

type Tab = 'exception' | 'factory' | 'mine' | 'restock' | 'schedule' | 'tasks';

const { hasAccessByCodes } = useAccess();
const canCreate = computed(() => hasAccessByCodes(['fdmgongchang:production-order:create']));
const canHandle = computed(() => hasAccessByCodes(['fdmgongchang:production-order:handle']));
const canSchedule = computed(() => hasAccessByCodes(['fdmgongchang:schedule:generate']));
const canRelease = computed(() => hasAccessByCodes(['fdmgongchang:schedule:confirm']));
const canViewSchedule = computed(() => hasAccessByCodes(['fdmgongchang:schedule:query']));
const route = useRoute();
const tab = ref<Tab>(initialTab());
/** 从看板、旧的 AI 排单地址或勾选订单生成后切过来时要打开的那份排单。 */
const scheduleFocus = ref<number | undefined>(Number(route?.query?.id) || undefined);
const focusManualPlanning = ref(false);
const taskOrderNo = ref<string>();
const shortageDispatchOpen = ref(false);
const shortageDispatch = ref<ShortageDispatchSeed>();

function initialTab(): Tab {
  const want = route?.query?.tab;
  if (want === 'schedule' && canViewSchedule.value) return 'schedule';
  if (want === 'tasks' && canViewSchedule.value) return 'tasks';
  if (want === 'restock' && canViewSchedule.value) return 'restock';
  if (want === 'exception' && canViewSchedule.value) return 'exception';
  if (want === 'mine' && canCreate.value) return 'mine';
  if (canHandle.value) return 'factory';
  if (canViewSchedule.value && !canCreate.value) return 'schedule';
  return 'mine';
}

const factory = useFactory();
const factoryReady = ref(false);
const noFactory = ref(false);
const orderable = ref<Api.Factory[]>([]);

const rows = ref<Api.Order[]>([]);
const total = ref(0);
const loading = ref(false);
const loadError = ref(false);
const pendingCount = ref(0);
const filters = reactive({ keyword: '', status: undefined as Api.Status | undefined });
const overview = ref<(null | number)[]>([null, null, null, null]);
const overviewOptions: { label: string; status?: Api.Status; tone: string }[] = [
  { label: '全部订单', tone: 'all' },
  { label: '待接单', status: 'SUBMITTED', tone: 'pending' },
  { label: '生产中', status: 'ACCEPTED', tone: 'active' },
  { label: '已完成', status: 'COMPLETED', tone: 'done' },
];
const otherStatuses = (['REJECTED', 'CANCELLED'] as const).map((value) => ({ label: ORDER_STATUS[value].label, value }));
const otherStatus = computed(() => otherStatuses.find(({ value }) => value === filters.status)?.value);
const isOrderTab = computed(() => tab.value === 'factory' || tab.value === 'mine');
const selectedItems = computed(() => [...selected.value.values()].reduce((sum, order) => sum + order.items.length, 0));
const shortfallItemCounts = computed(() => {
  if (tab.value !== 'factory' || !canHandle.value) return new Map<number, number>();
  return new Map(rows.value.filter((order) => order.status === 'ACCEPTED').map((order) => [
    order.id,
    order.items.filter((item) => remainingOrderItemQuantity(item) > 0).length,
  ]));
});
let rowsVersion = 0;
let overviewVersion = 0;
const pageNo = ref(1);
const pageSize = ref(20);

/** 本厂收到的单里勾选的已接单订单；翻页、筛选时保留已勾选的。 */
const selected = ref<Map<number, Api.Order>>(new Map());
const scheduleOpen = ref(false);
const releaseOpen = ref(false);
type SplitDeliverySelection = { itemId: number; orderId: number; quantity: number; stockId: number };
const splitDelivery = ref<{ item: Api.Item; order: Api.Order; selection: SplitDeliverySelection }>();
const splitDeliveryOpen = ref(false);
const deliveredStock = ref<{ itemId: number; revision: number; stockId: number }>();
let splitDeliveryVersion = 0;
const batchMixOpen = ref(false);
const expandedOrderIds = ref<number[]>([]);
const configOpen = ref(false);
const configOrderId = ref<number>();
const configItemId = ref<number>();
const batchRouteOrder = ref<Api.Order>();
let configRefreshVersion = 0;

function editItem(orderId: number, item: Api.Item) {
  if (!canHandle.value) return;
  configOrderId.value = orderId;
  configItemId.value = item.id;
  configOpen.value = true;
}

function applyFreshOrder(order: Api.Order) {
  rows.value = rows.value.map((row) => row.id === order.id ? order : row);
  if (selected.value.has(order.id)) {
    const next = new Map(selected.value);
    if (order.status === 'ACCEPTED') next.set(order.id, order);
    else next.delete(order.id);
    selected.value = next;
  }
}

function onBatchRouteSaved(order: Api.Order) {
  if (tab.value !== 'factory' || order.factoryId !== factory.factoryId.value || order.id !== batchRouteOrder.value?.id) return;
  applyFreshOrder(order);
  batchRouteOrder.value = undefined;
}

async function onConfigSaved() {
  const orderId = configOrderId.value;
  if (!orderId) return;
  const current = ++configRefreshVersion;
  const factoryId = factory.factoryId.value;
  try {
    const fresh = await getProductionOrder(orderId);
    if (current === configRefreshVersion && factoryId === factory.factoryId.value) applyFreshOrder(fresh);
  } catch {
    if (current === configRefreshVersion && factoryId === factory.factoryId.value) message.warning('参数已保存，列表刷新失败，请刷新订单后核对');
  }
}
const selectable = computed(() => tab.value === 'factory' && (canSchedule.value || canRelease.value));

function orderRowClass(order: Api.Order) {
  if (order.status === 'SUBMITTED') return 'order-row--pending';
  if (order.status === 'COMPLETED') return 'order-row--completed';
  return '';
}

const rowSelection = computed(() =>
  selectable.value
    ? {
        getCheckboxProps: (record: Api.Order) => ({
          disabled: record.status !== 'ACCEPTED',
          title: record.status === 'ACCEPTED' ? undefined : '接单后才能排单',
        }),
        onChange: (keys: (number | string)[], records: Api.Order[]) => {
          const next = new Map([...selected.value].filter(([id]) => !rows.value.some((r) => r.id === id)));
          for (const r of records) if (r && keys.includes(r.id)) next.set(r.id, r);
          selected.value = next;
        },
        preserveSelectedRowKeys: true,
        selectedRowKeys: [...selected.value.keys()],
      }
    : undefined,
);
/** 任务管理里点排单号：切到排单方案打开那一份。 */
function openSchedule(id: number) {
  scheduleFocus.value = id;
  tab.value = 'schedule';
}

function onScheduled(id: number) {
  selected.value = new Map();
  scheduleFocus.value = id;
  tab.value = 'schedule';
}

function onSplitReleased() {
  selected.value = new Map();
  if (canViewSchedule.value) {
    taskOrderNo.value = undefined;
    tab.value = 'tasks';
  } else {
    void loadRows();
  }
}

async function openSplitDelivery(selection: SplitDeliverySelection) {
  const version = ++splitDeliveryVersion;
  const factoryId = factory.factoryId.value;
  try {
    const order = await getProductionOrder(selection.orderId);
    if (version !== splitDeliveryVersion || !releaseOpen.value || factory.factoryId.value !== factoryId) return;
    const item = order.items.find((row) => row.id === selection.itemId);
    if (order.factoryId !== factoryId || order.status !== 'ACCEPTED' || !item || remainingOrderItemQuantity(item) <= 0) {
      message.warning('该明细已无可交数量或订单状态已变化，请重新预览');
      return;
    }
    splitDelivery.value = { item, order, selection };
    splitDeliveryOpen.value = true;
  } catch {
    if (version === splitDeliveryVersion) message.warning('订单明细加载失败，请重新打开入库');
  }
}

function onSplitDeliverySaved(text: string) {
  const selection = splitDelivery.value?.selection;
  if (!selection) return;
  message.success(text);
  deliveredStock.value = { itemId: selection.itemId, stockId: selection.stockId, revision: ++splitDeliveryVersion };
  void refreshOrders();
}

const createOpen = ref(false);
const copyFrom = ref<Api.Order>();

function openCreate(from?: Api.Order) {
  copyFrom.value = from;
  createOpen.value = true;
}

function copyOrder(order: Api.Order) {
  orderDetailOpen.value = false;
  openCreate(order);
}
const orderDetailOpen = ref(false);
const detailOrderId = ref<number>();
const detailFocusFulfillment = ref(false);

async function loadRows() {
  const current = ++rowsVersion;
  if (!(await factory.whenActive())) return;
  if (current !== rowsVersion) return;
  if (['exception', 'restock', 'schedule', 'tasks'].includes(tab.value)) return;
  if (tab.value === 'factory' && (!factoryReady.value || noFactory.value)) return;
  loading.value = true;
  loadError.value = false;
  try {
    const params = {
      keyword: filters.keyword.trim() || undefined,
      pageNo: pageNo.value,
      pageSize: pageSize.value,
      status: filters.status,
    };
    const page = tab.value === 'mine' ? await getMyProductionOrders(params) : await getFactoryProductionOrders(params);
    if (current !== rowsVersion) return;
    rows.value = page.list;
    const refreshed = new Map(selected.value);
    for (const order of page.list) {
      if (!refreshed.has(order.id)) continue;
      if (order.status === 'ACCEPTED') refreshed.set(order.id, order);
      else refreshed.delete(order.id);
    }
    selected.value = refreshed;
    total.value = page.total;
  } catch {
    if (current === rowsVersion) loadError.value = true;
  } finally {
    if (current === rowsVersion) loading.value = false;
  }
}

async function loadPending() {
  const current = ++overviewVersion;
  if (!(await factory.whenActive())) return;
  if (current !== overviewVersion || !isOrderTab.value) return;
  if (tab.value === 'factory' && (!canHandle.value || !factoryReady.value || noFactory.value)) return;
  const mine = tab.value === 'mine';
  const request = mine ? getMyProductionOrders : getFactoryProductionOrders;
  const counts = await Promise.all(overviewOptions.map(async ({ status }) => {
    try {
      const response = await request({ pageNo: 1, pageSize: 1, status });
      return response.total;
    } catch {
      return null;
    }
  }));
  if (current !== overviewVersion) return;
  overview.value = counts;
  if (!mine) pendingCount.value = counts[1] ?? 0;
}

function refreshOrders() {
  return Promise.all([loadRows(), loadPending()]);
}

function resetFilters() {
  filters.keyword = '';
  filters.status = undefined;
}

async function initFactory() {
  if (!canHandle.value && !canViewSchedule.value) return;
  try {
    await factory.load();
    noFactory.value = factory.factoryId.value === null;
  } catch {
    noFactory.value = true;
  }
  factoryReady.value = true;
}

onMounted(async () => {
  await Promise.all([
    initFactory(),
    canCreate.value ? getOrderableFactories().then((list) => (orderable.value = list)).catch(() => []) : undefined,
  ]);
  await Promise.all([loadRows(), loadPending()]);
});

async function switchFactory(id: number) {
  if (id === factory.factoryId.value) return;
  ++rowsVersion;
  ++overviewVersion;
  rows.value = [];
  overview.value = [null, null, null, null];
  pendingCount.value = 0;
  selected.value = new Map();
  batchMixOpen.value = false;
  batchRouteOrder.value = undefined;
  scheduleOpen.value = false;
  releaseOpen.value = false;
  ++splitDeliveryVersion;
  splitDeliveryOpen.value = false;
  splitDelivery.value = undefined;
  deliveredStock.value = undefined;
  configOpen.value = false;
  taskOrderNo.value = undefined;
  shortageDispatchOpen.value = false;
  shortageDispatch.value = undefined;
  ++configRefreshVersion;
  expandedOrderIds.value = [];
  factory.select(id);
  pageNo.value = 1;
  await Promise.all([loadRows(), loadPending()]);
}

watch(tab, (value) => {
  ++rowsVersion;
  ++overviewVersion;
  rows.value = [];
  overview.value = [null, null, null, null];
  batchRouteOrder.value = undefined;
  pageNo.value = 1;
  selected.value = new Map();
  filters.status = undefined;
  if (value !== 'schedule') {
    focusManualPlanning.value = false;
    void refreshOrders();
  }
});

let searchTimer: ReturnType<typeof setTimeout> | undefined;
watch(
  () => [filters.keyword, filters.status],
  () => {
    ++rowsVersion;
    clearTimeout(searchTimer);
    searchTimer = setTimeout(async () => {
      if (!(await factory.whenActive())) return;
      pageNo.value = 1;
      loadRows();
    }, 300);
  },
);
onBeforeUnmount(() => clearTimeout(searchTimer));

function openOrder(id: number, focusFulfillment = false) {
  detailOrderId.value = id;
  detailFocusFulfillment.value = focusFulfillment;
  orderDetailOpen.value = true;
}

function openOrderTasks(orderNo: string) {
  if (!canViewSchedule.value) return;
  taskOrderNo.value = orderNo;
  orderDetailOpen.value = false;
  tab.value = 'tasks';
}

function openShortagePlanning() {
  if (!canViewSchedule.value || !canRelease.value) return;
  orderDetailOpen.value = false;
  scheduleFocus.value = undefined;
  focusManualPlanning.value = true;
  tab.value = 'schedule';
}

function openShortageDispatch(seed: ShortageDispatchSeed) {
  if (!canViewSchedule.value || !canRelease.value || !factory.factoryId.value) return;
  shortageDispatch.value = seed;
  shortageDispatchOpen.value = true;
}

function onShortageDispatched(scheduleId: number) {
  shortageDispatchOpen.value = false;
  orderDetailOpen.value = false;
  focusManualPlanning.value = false;
  openSchedule(scheduleId);
}

function toggleOrderItems(id: number) {
  expandedOrderIds.value = expandedOrderIds.value.includes(id)
    ? expandedOrderIds.value.filter((orderId) => orderId !== id)
    : [...expandedOrderIds.value, id];
}

async function onCreated(id: number) {
  message.success('已提交给工厂，等工厂接单');
  tab.value = 'mine';
  await refreshOrders();
  openOrder(id);
}

async function onChanged() {
  await Promise.all([loadRows(), loadPending()]);
  if (detailOrderId.value && selected.value.has(detailOrderId.value) && !rows.value.some((row) => row.id === detailOrderId.value)) {
    applyFreshOrder(await getProductionOrder(detailOrderId.value));
  }
}

const pinActions = useMediaQuery('(min-width: 768px)');
const columns = computed(() => [
  { key: 'orderNo', title: '生产订单', width: 190 },
  { key: 'source', title: '采购来源', width: 246 },
  { key: 'items', title: '产品与工艺' },
  { key: 'progress', title: '交期与进度', width: 164 },
  { fixed: pinActions.value ? ('right' as const) : undefined, key: 'actions', title: '操作', width: 118 },
]);

function deliveryHint(order: Api.Order) {
  if (!['ACCEPTED', 'SUBMITTED'].includes(order.status)) return '';
  const date = dateText(order.promisedDate) || dateText(order.requiredDate);
  if (!date) return '';
  const days = Math.round((new Date(`${date}T00:00:00+08:00`).getTime() - new Date(`${factoryToday().format('YYYY-MM-DD')}T00:00:00+08:00`).getTime()) / 86_400_000);
  if (days < 0) return `已逾期 ${-days} 天`;
  if (days === 0) return '今天交货';
  if (days <= 3) return `${days} 天后交货`;
  return '';
}

function statusHint(order: Api.Order) {
  if (order.status === 'SUBMITTED') return tab.value === 'mine' ? '等待工厂确认接单' : '请确认交期后接单';
  if (order.status === 'ACCEPTED') {
    if (tab.value === 'mine') return '等待工厂交货';
    return order.items.some((item) => (item.steps ?? []).some((step) => step.orderCount > 0)) ? '已下发工序任务' : '可勾选拆分下发';
  }
  if (order.status === 'REJECTED') return order.reply || '等待修改需求';
  return '';
}

function progressPercent(o: Api.Order) {
  const t = num(o.totalQuantity);
  return t > 0 ? Math.min(100, Math.round((num(o.completedQuantity) / t) * 100)) : 0;
}
</script>

<template>
  <Page>
    <div class="flex min-w-0 flex-col gap-3">
      <header class="order-header">
        <div class="min-w-0">
          <div class="flex flex-wrap items-center gap-x-4 gap-y-1">
            <h1 class="m-0 text-xl font-semibold tracking-tight">生产订单</h1>
            <FactorySwitch
              v-if="tab !== 'mine' && factory.factories.value.length > 0"
              :factories="factory.factories.value"
              :value="factory.factoryId.value"
              @change="switchFactory"
            />
          </div>
        </div>
        <Button v-if="canCreate" type="primary" @click="openCreate()">＋ 提生产需求</Button>
      </header>

      <Result v-if="!canCreate && !canHandle && !canViewSchedule" status="info" title="还没有工厂排单的权限">
        <template #subTitle>需要向工厂提生产需求的话，请联系管理员分配「工厂下单」角色。</template>
      </Result>

      <section v-else class="order-workspace rounded-xl border border-border bg-card">
        <Tabs v-model:active-key="tab">
          <Tabs.TabPane v-if="canHandle" key="factory">
            <template #tab>
              本厂订单
              <Tag v-if="pendingCount > 0" class="ml-1" color="orange">{{ pendingCount }} 待接单</Tag>
            </template>
          </Tabs.TabPane>
          <Tabs.TabPane v-if="canViewSchedule" key="tasks" tab="任务管理" />
          <Tabs.TabPane v-if="canViewSchedule" key="schedule" tab="辅助排单 / 历史方案" />
          <Tabs.TabPane v-if="canViewSchedule" key="restock" tab="补库台账" />
          <Tabs.TabPane v-if="canViewSchedule" key="exception" tab="异常台账" />
          <Tabs.TabPane v-if="canCreate" key="mine" tab="我提的需求" />
        </Tabs>

        <Result v-if="tab !== 'mine' && noFactory" status="info" title="你的账号还不属于任何工厂">
          <template #subTitle>接单、排单只能处理自己所在工厂的单。</template>
        </Result>
        <template v-else-if="tab === 'schedule'">
          <ScheduleBoard
            v-if="factory.factoryId.value !== null"
            :factory-id="factory.factoryId.value"
            :focus-id="scheduleFocus"
            :focus-manual-planning="focusManualPlanning"
          />
        </template>
        <template v-else-if="tab === 'restock'">
          <RestockLedger v-if="factory.factoryId.value !== null" :factory-id="factory.factoryId.value" @open-order="openOrder" />
        </template>
        <template v-else-if="tab === 'exception'">
          <ExceptionLedger v-if="factory.factoryId.value !== null" :factory-id="factory.factoryId.value" />
        </template>
        <template v-else-if="tab === 'tasks'">
          <TaskManage
            v-if="factory.factoryId.value !== null"
            v-model:order-no="taskOrderNo"
            :factory-id="factory.factoryId.value"
            @open-schedule="openSchedule"
          />
        </template>
        <Result v-else-if="loadError" status="warning" title="订单没有加载出来">
          <template #extra><Button type="primary" @click="loadRows">重新加载</Button></template>
        </Result>
        <div v-else class="order-list">
          <div class="order-filters">
            <div class="order-overview" role="group" aria-label="订单状态筛选">
              <button
                v-for="(option, index) in overviewOptions"
                :key="option.label"
                type="button"
                class="overview-card"
                :class="[`overview-card--${option.tone}`, { 'is-active': filters.status === option.status }]"
                :aria-pressed="filters.status === option.status"
                @click="filters.status = option.status"
              >
                {{ option.label }}
                <strong class="overview-card__value">{{ overview[index] ?? '—' }}</strong>
              </button>
              <Select
                id="po-filter-status"
                :value="otherStatus"
                :options="otherStatuses"
                allow-clear
                class="w-28"
                aria-label="其他订单状态"
                placeholder="其他状态"
                @change="(value) => filters.status = value as Api.Status | undefined"
              />
            </div>
            <div class="order-search-tools">
              <Input
                id="po-filter-keyword"
                v-model:value="filters.keyword"
                allow-clear
                class="order-search"
                aria-label="搜索订单号、采购单号、合同编号、合同内部单号或采购主题"
                placeholder="订单号、内部单号、采购主题"
              >
                <template #prefix><Search :size="14" class="text-muted-foreground" aria-hidden="true" /></template>
              </Input>
              <Button :loading="loading" aria-label="刷新订单" title="刷新订单" @click="refreshOrders">
                <template #icon><RefreshCw :size="14" aria-hidden="true" /></template>
              </Button>
            </div>
          </div>
          <div class="order-batch" :class="{ 'has-selection': selected.size > 0 }">
            <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span class="text-muted-foreground" aria-live="polite">{{ filters.keyword || filters.status ? '筛选结果' : '订单' }} <b class="text-foreground">{{ total }}</b> 张</span>
              <span v-if="selected.size > 0" class="text-primary" aria-live="polite">已选 {{ selected.size }} 张 · {{ selectedItems }} 条产品明细</span>
              <Button v-if="selected.size > 0" size="small" type="link" @click="selected = new Map()">清空选择</Button>
              <Button v-if="filters.keyword || filters.status" size="small" type="link" @click="resetFilters">重置筛选</Button>
            </div>
            <div v-if="selectable" class="flex flex-wrap items-center gap-3">
              <details class="batch-extra relative text-xs">
                <summary class="cursor-pointer text-muted-foreground">辅助排单</summary>
                <div class="batch-extra__menu">
                  <Button v-if="canSchedule" :disabled="selected.size === 0" @click="scheduleOpen = true">AI 排单{{ selected.size > 0 ? `（已选 ${selected.size} 张）` : '' }}</Button>
                  <Button v-if="canRelease" @click="batchMixOpen = true">批量安排发泡{{ selected.size > 0 ? `（已选 ${selected.size} 张）` : '' }}</Button>
                </div>
              </details>
              <Button v-if="canRelease" :disabled="selected.size === 0" :title="selected.size === 0 ? '勾选生产中订单后拆分' : undefined" type="primary" @click="releaseOpen = true">
                拆分工序任务{{ selected.size > 0 ? `（已选 ${selected.size} 张）` : '' }}
              </Button>
            </div>
          </div>
          <Table
            v-model:expanded-row-keys="expandedOrderIds"
            :columns="columns"
            :data-source="rows"
            :loading="loading"
            :pagination="{ current: pageNo, pageSize, showSizeChanger: true, total }"
            :row-selection="rowSelection"
            :scroll="{ x: 1016 }"
            :row-class-name="orderRowClass"
            class="production-orders-table"
            row-key="id"
            size="small"
            @change="(p) => ((pageNo = p.current ?? 1), (pageSize = p.pageSize ?? 20), loadRows())"
          >
            <template #emptyText>
              <div class="order-empty">
                <b>{{ filters.keyword || filters.status ? '没有符合条件的订单' : tab === 'mine' ? '还没有提过生产需求' : '还没有收到订单' }}</b>
                <span> {{ filters.keyword || filters.status ? '试试更换关键词或重置筛选' : tab === 'mine' ? '点击右上角「提生产需求」创建第一张订单' : '收到生产需求后，订单会显示在这里' }}</span>
                <Button v-if="filters.keyword || filters.status" @click="resetFilters">查看全部订单</Button>
              </div>
            </template>
            <template #expandedRowRender="{ record }"><OrderItemsTable :items="record.items" :editable="tab === 'factory' && canHandle && ['SUBMITTED', 'ACCEPTED'].includes(record.status)" @edit="editItem(record.id, $event)" /></template>
            <template #bodyCell="{ column, record }">
              <template v-if="column.key === 'orderNo'">
                <div class="order-cell">
                  <button class="order-number" type="button" @click="openOrder(record.id)">{{ record.orderNo }}</button>
                  <div class="flex flex-wrap items-center gap-1">
                    <Tag :color="ORDER_STATUS[record.status as Api.Status]?.color" class="m-0">{{ record.statusLabel }}</Tag>
                    <Tag v-if="record.sourceChanged" class="m-0" color="orange">采购有变更</Tag>
                  </div>
                  <span class="order-meta" :title="statusHint(record as Api.Order)">{{ statusHint(record as Api.Order) }}</span>
                  <span class="order-meta">
                    {{ (tab === 'mine' ? record.factoryName : [record.requesterName, record.requesterDeptName].filter(Boolean).join(' · ')) || '—' }}
                  </span>
                  <span v-if="record.createTime" class="order-meta">{{ timeText(record.createTime) }}</span>
                </div>
              </template>
              <template v-else-if="column.key === 'source'">
                <div v-if="record.sourceType === 'PURCHASE_ORDER'" class="order-cell">
                  <span class="order-subject" :title="record.sourceOrderSubject || undefined">{{ record.sourceOrderSubject || '未填写采购主题' }}</span>
                  <dl v-if="record.sourceContractId || record.sourceContractName || record.sourceContractCode || record.customerName" class="order-source-meta">
                    <div v-if="record.sourceContractId || record.sourceContractName || record.sourceContractCode">
                      <dt>合同内部单号</dt>
                      <dd class="font-medium text-foreground">{{ record.sourceContractName || '—' }}</dd>
                    </div>
                    <div v-if="record.sourceContractCode">
                      <dt>合同编号</dt>
                      <dd>{{ record.sourceContractCode }}</dd>
                    </div>
                    <div v-if="record.customerName">
                      <dt>客户</dt>
                      <dd>{{ record.customerName }}</dd>
                    </div>
                  </dl>
                  <SourcePurchaseLink v-if="record.sourceOrderCode" class="self-start text-left text-xs" :order="record" />
                </div>
                <div v-else class="order-cell">
                  <span class="order-subject">{{ record.sourceType === 'RESTOCK' ? '补库' : '部门需求' }}</span>
                  <span v-if="record.purpose" class="order-meta" :title="record.purpose">{{ record.purpose }}</span>
                </div>
              </template>
              <template v-else-if="column.key === 'items'">
                <div v-for="item in record.items.slice(0, 1)" :key="item.id" class="order-cell">
                  <div class="order-item-title">
                    <span class="order-subject" :title="item.productName">{{ item.productName }}</span>
                    <span class="shrink-0 text-xs tabular-nums"><b>{{ num(item.quantity).toLocaleString() }}</b> {{ item.unit }}</span>
                  </div>
                  <span class="order-meta" :title="[item.productCode, specText(item)].filter(Boolean).join(' · ')">{{ [item.productCode, specText(item)].filter(Boolean).join(' · ') }}</span>
                  <span class="text-xs" :class="item.processes?.length ? 'text-muted-foreground' : 'text-warning'">{{ item.processes?.length ? item.processes.map((code: string) => PROCESS_LABELS[code] || code).join(' → ') : '待确认工艺' }}</span>
                  <button v-if="record.items.length > 1" type="button" class="order-text-action" :aria-expanded="expandedOrderIds.includes(record.id)" @click="toggleOrderItems(record.id)">
                    {{ expandedOrderIds.includes(record.id) ? '收起产品明细' : `全部 ${record.items.length} 项产品` }}
                  </button>
                </div>
                <span v-if="record.items.length === 0" class="text-xs text-muted-foreground">暂无产品明细</span>
              </template>
              <template v-else-if="column.key === 'progress'">
                <div class="order-cell">
                  <time class="font-medium tabular-nums" :datetime="dateText(record.promisedDate) || dateText(record.requiredDate) || undefined">{{ dateText(record.promisedDate) || dateText(record.requiredDate) || '未填写交期' }}</time>
                  <span v-if="record.promisedDate || record.requiredDate" class="text-xs text-muted-foreground">{{ record.promisedDate ? '工厂交期' : record.sourceType === 'PURCHASE_ORDER' ? '采购单交期' : '希望交货' }}</span>
                  <span v-if="deliveryHint(record as Api.Order)" class="text-xs font-medium" :class="deliveryHint(record as Api.Order).startsWith('已逾期') ? 'text-destructive' : 'text-warning'">{{ deliveryHint(record as Api.Order) }}</span>
                  <div v-if="record.status === 'ACCEPTED' || record.status === 'COMPLETED'" class="order-progress">
                    <Progress :percent="progressPercent(record as Api.Order)" :show-info="false" size="small" />
                    <span class="text-xs text-muted-foreground tabular-nums">{{ record.sourceType === 'PURCHASE_ORDER' ? '入库' : '交货' }} {{ num(record.completedQuantity).toLocaleString() }} / {{ num(record.totalQuantity).toLocaleString() }}</span>
                  </div>
                  <button
                    v-if="shortfallItemCounts.get(record.id)"
                    class="self-start rounded-md border border-warning/30 bg-warning/10 px-2 py-1 text-left text-xs font-medium text-warning hover:bg-warning/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-warning"
                    type="button"
                    @click="openOrder(record.id, true)"
                  >
                    补产指引 · 待补 {{ shortfallItemCounts.get(record.id) }} 款
                  </button>
                </div>
              </template>
              <template v-else-if="column.key === 'actions'">
                <div class="order-row-actions">
                  <Button size="small" :type="tab === 'factory' && canHandle && record.status === 'SUBMITTED' ? 'primary' : 'link'" @click="openOrder(record.id)">
                    {{ tab === 'factory' && record.status === 'SUBMITTED' ? '去接单' : '查看' }}
                  </Button>
                  <Button v-if="tab === 'factory' && canHandle && ['SUBMITTED', 'ACCEPTED'].includes(record.status)" size="small" type="link" :aria-expanded="expandedOrderIds.includes(record.id)" @click="toggleOrderItems(record.id)">产品参数</Button>
                  <Button v-if="tab === 'factory' && canHandle && record.status === 'ACCEPTED' && record.batchRouteEditable" size="small" type="link" @click="batchRouteOrder = record as Api.Order">批量修改工艺</Button>
                  <Button
                    v-if="tab === 'mine' && record.sourceType !== 'PURCHASE_ORDER'"
                    size="small"
                    type="link"
                    @click="openCreate(record as Api.Order)"
                  >
                    {{ record.status === 'REJECTED' ? '改了重下' : '复制' }}
                  </Button>
                </div>
              </template>
            </template>
          </Table>
        </div>
      </section>

      <CreateModal v-model:open="createOpen" :copy-from="copyFrom" :factories="orderable" @created="onCreated" />
      <ScheduleModal v-model:open="scheduleOpen" :orders="[...selected.values()]" @generated="onScheduled" />
      <OrderSplitModal
        :key="`split-${factory.factoryId.value ?? 'none'}`"
        v-model:open="releaseOpen"
        :delivered-stock="deliveredStock"
        :orders="[...selected.values()]"
        @changed="applyFreshOrder"
        @manual-delivery="openSplitDelivery"
        @released="onSplitReleased"
      />
      <DeliveryModal
        v-if="splitDelivery"
        v-model:open="splitDeliveryOpen"
        :factory-id="splitDelivery.order.factoryId"
        :item="splitDelivery.item"
        :preset="splitDelivery.selection"
        :purchase="splitDelivery.order.sourceType === 'PURCHASE_ORDER'"
        @saved="onSplitDeliverySaved"
      />
      <ItemProductionConfigModal
        v-if="configOrderId && configItemId"
        :key="factory.factoryId.value ?? 'none'"
        v-model:open="configOpen"
        :order-id="configOrderId"
        :item-id="configItemId"
        :show-product-archive="hasAccessByCodes(['fdmplatform:products:query'])"
        @saved="onConfigSaved"
      />
      <BatchRouteModal
        v-if="batchRouteOrder"
        :key="`batch-route-${batchRouteOrder.factoryId}-${batchRouteOrder.id}`"
        :order="batchRouteOrder"
        @cancel="batchRouteOrder = undefined"
        @saved="onBatchRouteSaved"
      />
      <MixBatchModal :key="factory.factoryId.value ?? 'none'" v-model:open="batchMixOpen" :orders="[...selected.values()]" @released="onScheduled" />
      <OrderDetailModal
        v-model:open="orderDetailOpen"
        :focus-fulfillment="detailFocusFulfillment"
        :mode="tab === 'mine' ? 'mine' : 'factory'"
        :order-id="detailOrderId"
        @changed="onChanged"
        @copy="copyOrder"
        @dispatch-shortage="openShortageDispatch"
        @plan-shortage="openShortagePlanning"
        @view-tasks="openOrderTasks"
      />
      <ShortageDispatchModal
        v-if="shortageDispatch && factory.factoryId.value"
        v-model:open="shortageDispatchOpen"
        :factory-id="factory.factoryId.value"
        :seed="shortageDispatch"
        @released="onShortageDispatched"
      />
    </div>
  </Page>
</template>

<style scoped>
.order-header {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  align-items: center;
  justify-content: space-between;
  min-height: 36px;
}

.order-workspace {
  min-width: 0;
  padding: 0 16px 12px;
}

.order-workspace :deep(> .ant-tabs > .ant-tabs-nav) {
  margin-bottom: 10px;
}

.order-list {
  min-width: 0;
}

.order-overview {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
}

.overview-card {
  display: inline-flex;
  gap: 6px;
  align-items: center;
  min-height: 32px;
  padding: 4px 8px;
  font-size: 13px;
  white-space: nowrap;
  border: 1px solid transparent;
  border-radius: 6px;
}

.overview-card:hover,
.overview-card.is-active {
  color: hsl(var(--primary));
  background: hsl(var(--primary) / 8%);
  border-color: hsl(var(--primary) / 25%);
}

.overview-card:focus-visible {
  outline: 2px solid hsl(var(--primary));
  outline-offset: 1px;
}

.overview-card__value {
  min-width: 20px;
  padding: 0 5px;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  line-height: 18px;
  text-align: center;
  background: hsl(var(--muted));
  border-radius: 5px;
}

.overview-card--pending .overview-card__value {
  color: hsl(var(--warning));
  background: hsl(var(--warning) / 10%);
}

.overview-card--active .overview-card__value {
  color: hsl(var(--primary));
  background: hsl(var(--primary) / 10%);
}

.overview-card--done .overview-card__value {
  color: hsl(var(--success));
  background: hsl(var(--success) / 10%);
}

.order-filters {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 16px;
  align-items: center;
  justify-content: space-between;
  padding-bottom: 10px;
}

.order-search-tools {
  display: flex;
  flex: 0 1 368px;
  gap: 6px;
  align-items: center;
  min-width: 0;
}

.order-batch {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
  justify-content: space-between;
  min-height: 44px;
  padding: 6px 10px;
  font-size: 13px;
  background: hsl(var(--muted) / 30%);
  border: 1px solid hsl(var(--border));
  border-bottom: 0;
  border-radius: 8px 8px 0 0;
}

.order-batch.has-selection {
  background: hsl(var(--primary) / 5%);
  border-color: hsl(var(--primary) / 35%);
}

.batch-extra__menu {
  position: absolute;
  top: 28px;
  right: 0;
  z-index: 20;
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 180px;
  padding: 10px;
  background: hsl(var(--background));
  border: 1px solid hsl(var(--border));
  border-radius: 8px;
  box-shadow: 0 6px 20px #00000014;
}

.order-cell {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
  line-height: 1.45;
  overflow-wrap: anywhere;
}

.order-number,
.order-text-action {
  align-self: start;
  color: hsl(var(--primary));
  text-align: left;
}

.order-number {
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.order-text-action {
  font-size: 12px;
}

.order-number:hover,
.order-text-action:hover {
  text-decoration: underline;
}

.order-subject {
  display: -webkit-box;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  font-weight: 600;
}

.order-meta {
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 12px;
  color: hsl(var(--muted-foreground));
  white-space: nowrap;
}

.order-meta:empty {
  display: none;
}

.order-source-meta {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin: 2px 0 0;
  font-size: 12px;
  color: hsl(var(--muted-foreground));
}

.order-source-meta > div {
  display: grid;
  grid-template-columns: 72px minmax(0, 1fr);
  gap: 6px;
}

.order-source-meta dd {
  margin: 0;
}

.order-item-title {
  display: flex;
  gap: 8px;
  align-items: baseline;
  justify-content: space-between;
}

.order-progress {
  display: flex;
  flex-direction: column;
  margin-top: 2px;
}

.order-progress :deep(.ant-progress) {
  margin: 0;
  line-height: 1;
}

.order-row-actions {
  display: flex;
  flex-direction: column;
  gap: 1px;
  align-items: flex-start;
}

.order-empty {
  display: flex;
  flex-direction: column;
  gap: 10px;
  align-items: center;
  padding: 40px 16px;
  color: hsl(var(--muted-foreground));
}

.production-orders-table :deep(.ant-table-thead > tr > th) {
  font-size: 12px;
  font-weight: 600;
  color: hsl(var(--muted-foreground));
}

.production-orders-table :deep(.ant-table-container) {
  border: 1px solid hsl(var(--border));
  border-radius: 0 0 8px 8px;
}

.production-orders-table :deep(.ant-table-cell) {
  vertical-align: top;
}

.production-orders-table :deep(.order-row--pending > td) {
  background: hsl(var(--warning) / 4%);
}

.production-orders-table :deep(.ant-table-tbody > .order-row--completed > td) {
  background: color-mix(in srgb, hsl(var(--success)) 4%, hsl(var(--background)));
}

.production-orders-table :deep(.ant-table-tbody > .order-row--completed:hover > td),
.production-orders-table :deep(.ant-table-tbody > .order-row--completed > .ant-table-cell-row-hover) {
  background: color-mix(in srgb, hsl(var(--success)) 8%, hsl(var(--background)));
}

@media (max-width: 768px) {
  .order-workspace {
    padding: 0 12px 12px;
  }

  .order-search-tools {
    flex: 1 1 100%;
  }

  .order-batch {
    row-gap: 6px;
  }
}
</style>
