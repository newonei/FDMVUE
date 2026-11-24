<script lang="ts" setup>
import type { FdmgongchangProductionOrderApi as Api } from '#/api/fdmgongchang/production-order';

import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { useRoute } from 'vue-router';

import { useAccess } from '@vben/access';
import { Page } from '@vben/common-ui';

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
import TaskManage from '../schedule/modules/task-manage.vue';
import { factoryToday } from '../shared/factory-date';
import FactorySwitch from '../shared/factory-switch.vue';
import { PROCESS_LABELS } from '../shared/schedule';
import { useFactory } from '../shared/use-factory';
import BatchRouteModal from './modules/batch-route-modal.vue';
import CreateModal from './modules/create-modal.vue';
import ExceptionLedger from './modules/exception-ledger.vue';
import ItemProductionConfigModal from './modules/item-production-config-modal.vue';
import OrderDrawer from './modules/order-drawer.vue';
import OrderItemsTable from './modules/order-items-table.vue';
import RestockLedger from './modules/restock-ledger.vue';
import ScheduleModal from './modules/schedule-modal.vue';
import SourcePurchaseLink from './modules/source-purchase-link.vue';
import { dateText, num, ORDER_STATUS, specText, timeText } from './shared';

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
const overviewOptions: { hint: string; label: string; status?: Api.Status; tone: string }[] = [
  { label: '全部订单', hint: '查看全部状态', tone: 'all' },
  { label: '待接单', hint: '确认交期与产品工艺', status: 'SUBMITTED', tone: 'pending' },
  { label: '生产中', hint: '排单下发与交货跟进', status: 'ACCEPTED', tone: 'active' },
  { label: '已完成', hint: '查看历史订单', status: 'COMPLETED', tone: 'done' },
];
const isOrderTab = computed(() => tab.value === 'factory' || tab.value === 'mine');
const selectedItems = computed(() => [...selected.value.values()].reduce((sum, order) => sum + order.items.length, 0));
let rowsVersion = 0;
let overviewVersion = 0;
const pageNo = ref(1);
const pageSize = ref(20);

/** 本厂收到的单里勾选的已接单订单；翻页、筛选时保留已勾选的。 */
const selected = ref<Map<number, Api.Order>>(new Map());
const scheduleOpen = ref(false);
const releaseOpen = ref(false);
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
  if (canViewSchedule.value) tab.value = 'tasks';
  else void loadRows();
}

const createOpen = ref(false);
const copyFrom = ref<Api.Order>();

function openCreate(from?: Api.Order) {
  copyFrom.value = from;
  createOpen.value = true;
}

function copyOrder(order: Api.Order) {
  drawerOpen.value = false;
  openCreate(order);
}
const drawerOpen = ref(false);
const drawerId = ref<number>();

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
  configOpen.value = false;
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
  if (value !== 'schedule') void refreshOrders();
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

function openOrder(id: number) {
  drawerId.value = id;
  drawerOpen.value = true;
}

async function onCreated(id: number) {
  message.success('已提交给工厂，等工厂接单');
  tab.value = 'mine';
  await refreshOrders();
  openOrder(id);
}

async function onChanged() {
  await Promise.all([loadRows(), loadPending()]);
  if (drawerId.value && selected.value.has(drawerId.value) && !rows.value.some((row) => row.id === drawerId.value)) {
    applyFreshOrder(await getProductionOrder(drawerId.value));
  }
}

const statusOptions = Object.entries(ORDER_STATUS).map(([value, s]) => ({ label: s.label, value }));
const columns = computed(() => [
  { key: 'orderNo', title: '订单 / 状态', width: 215 },
  { key: 'items', title: '产品 / 数量 / 工艺', width: 300 },
  { key: 'progress', title: '交期 / 交货进度', width: 175 },
  { fixed: 'right' as const, key: 'actions', title: '操作', width: 185 },
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
    <div class="flex flex-col gap-4">
      <header class="order-header">
        <div class="min-w-0">
          <div class="flex flex-wrap items-center gap-x-4 gap-y-1">
            <h1 class="m-0 text-xl font-semibold tracking-tight">订单拆分与车间下发</h1>
            <FactorySwitch
              v-if="tab !== 'mine' && factory.factories.value.length > 0"
              :factories="factory.factories.value"
              :value="factory.factoryId.value"
              @change="switchFactory"
            />
          </div>
          <p class="m-0 mt-1 text-sm text-muted-foreground">
            从接单到交货，集中处理工厂生产订单。
          </p>
        </div>
        <Button v-if="canCreate" type="primary" size="large" @click="openCreate()">＋ 提生产需求</Button>
      </header>

      <Result v-if="!canCreate && !canHandle && !canViewSchedule" status="info" title="还没有工厂排单的权限">
        <template #subTitle>需要向工厂提生产需求的话，请联系管理员分配「工厂下单」角色。</template>
      </Result>

      <section v-else class="order-workspace rounded-xl border border-border bg-card">
        <Tabs v-model:active-key="tab">
          <Tabs.TabPane v-if="canHandle" key="factory">
            <template #tab>
              本厂收到的单
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
          <ScheduleBoard v-if="factory.factoryId.value !== null" :factory-id="factory.factoryId.value" :focus-id="scheduleFocus" />
        </template>
        <template v-else-if="tab === 'restock'">
          <RestockLedger v-if="factory.factoryId.value !== null" :factory-id="factory.factoryId.value" @open-order="openOrder" />
        </template>
        <template v-else-if="tab === 'exception'">
          <ExceptionLedger v-if="factory.factoryId.value !== null" :factory-id="factory.factoryId.value" />
        </template>
        <template v-else-if="tab === 'tasks'">
          <TaskManage v-if="factory.factoryId.value !== null" :factory-id="factory.factoryId.value" @open-schedule="openSchedule" />
        </template>
        <Result v-else-if="loadError" status="warning" title="订单没有加载出来">
          <template #extra><Button type="primary" @click="loadRows">重新加载</Button></template>
        </Result>
        <div v-else class="flex flex-col gap-4">
          <div class="text-xs text-muted-foreground">{{ tab === 'mine' ? '我的需求概览' : '本厂订单概览' }} · 点击状态筛选订单，概览数量不受搜索关键词影响</div>
          <div class="order-overview" aria-label="订单状态快捷筛选">
            <button
              v-for="(option, index) in overviewOptions"
              :key="option.label"
              type="button"
              class="overview-card"
              :class="[`overview-card--${option.tone}`, { 'is-active': filters.status === option.status }]"
              :aria-pressed="filters.status === option.status"
              @click="filters.status = option.status"
            >
              <span class="overview-card__label">{{ option.label }} <span aria-hidden="true">↗</span></span>
              <strong class="overview-card__value">{{ overview[index] === null ? '—' : overview[index] }}</strong>
              <span class="overview-card__hint">{{ tab === 'mine' && option.status === 'SUBMITTED' ? '等待工厂确认接单' : tab === 'mine' && option.status === 'ACCEPTED' ? '查看工厂交货进度' : option.hint }}</span>
            </button>
          </div>
          <div v-if="tab === 'factory'" class="order-workflow" aria-label="订单操作流程">
            <span><b>1</b> 确认交期与工艺，接单</span><i aria-hidden="true">→</i>
            <span><b>2</b> 勾选生产中订单，拆分下发</span><i aria-hidden="true">→</i>
            <span><b>3</b> 跟进任务，交货 / 入库</span>
          </div>
          <div class="order-filters">
            <Input
              id="po-filter-keyword"
              v-model:value="filters.keyword"
              allow-clear
              class="order-search"
              aria-label="搜索订单"
              placeholder="搜索订单号、采购单号、合同号、下单人"
            >
              <template #prefix><span class="text-muted-foreground" aria-hidden="true">⌕</span></template>
            </Input>
            <Select
              id="po-filter-status"
              v-model:value="filters.status"
              :options="statusOptions"
              allow-clear
              class="w-36"
              aria-label="订单状态"
              placeholder="全部状态"
            />
            <Button v-if="filters.keyword || filters.status" @click="resetFilters">重置筛选</Button>
            <span class="order-filters__total">筛选结果 <b>{{ total }}</b> 张</span>
            <Button :loading="loading" @click="refreshOrders">刷新订单</Button>
          </div>
          <div v-if="selectable" class="order-batch" :class="{ 'has-selection': selected.size > 0 }">
            <div class="flex flex-wrap items-center gap-2">
              <b>{{ selected.size > 0 ? `已选 ${selected.size} 张订单` : '批量下发' }}</b>
              <span class="text-xs text-muted-foreground">{{ selected.size > 0 ? `${selectedItems} 条产品明细 · 跨页保留选择` : '勾选生产中订单，核对产品参数后拆分工序任务' }}</span>
              <Button v-if="selected.size > 0" size="small" type="link" @click="selected = new Map()">清空</Button>
            </div>
            <div class="flex items-center gap-3">
              <details class="batch-extra relative text-xs">
                <summary class="cursor-pointer text-muted-foreground">辅助排单</summary>
                <div class="batch-extra__menu">
                  <span class="text-muted-foreground">特殊排产与旧流程，正常订单使用「拆分工序任务」。</span>
                  <Button v-if="canSchedule" :disabled="selected.size === 0" @click="scheduleOpen = true">AI 排单{{ selected.size > 0 ? `（已选 ${selected.size} 张）` : '' }}</Button>
                  <Button v-if="canRelease" @click="batchMixOpen = true">批量安排发泡{{ selected.size > 0 ? `（已选 ${selected.size} 张）` : '' }}</Button>
                </div>
              </details>
              <Button v-if="canRelease" :disabled="selected.size === 0" type="primary" @click="releaseOpen = true">
                拆分工序任务{{ selected.size > 0 ? `（已选 ${selected.size} 张）` : '' }}
              </Button>
            </div>
          </div>
          <Table
            v-model:expanded-row-keys="expandedOrderIds"
            :columns="columns"
            :data-source="rows"
            :loading="loading"
            :pagination="{ current: pageNo, pageSize, showSizeChanger: true, total, showTotal: (t: number) => `共 ${t} 张` }"
            :row-selection="rowSelection"
            :scroll="{ x: 980 }"
            :row-class-name="orderRowClass"
            class="production-orders-table"
            row-key="id"
            size="middle"
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
                <div class="flex flex-col">
                  <div class="mb-2 flex flex-wrap items-center gap-1">
                    <Tag :color="ORDER_STATUS[record.status as Api.Status]?.color" class="m-0">{{ record.statusLabel }}</Tag>
                    <span class="text-xs text-muted-foreground">{{ statusHint(record as Api.Order) }}</span>
                  </div>
                  <button class="text-left text-primary hover:underline" type="button" @click="openOrder(record.id)">{{ record.orderNo }}</button>
                  <span class="text-xs text-muted-foreground">{{ timeText(record.createTime) }}<template v-if="record.purpose && record.sourceType !== 'PURCHASE_ORDER'"> · {{ record.purpose }}</template></span>
                  <span class="my-1 text-xs text-muted-foreground">{{ tab === 'mine' ? record.factoryName : `${record.requesterName || '—'} · ${record.requesterDeptName || '未填写部门'}` }}</span>
                  <span v-if="record.sourceType === 'PURCHASE_ORDER'" class="flex flex-wrap items-center gap-1 text-xs">
                    <Tag class="m-0" color="blue"><SourcePurchaseLink :order="record" /></Tag>
                    <Tag v-if="record.sourceChanged" class="m-0" color="orange">有变更</Tag>
                    <span v-if="record.sourceContractCode" class="text-muted-foreground">{{ record.sourceContractCode }}</span>
                  </span>
                </div>
              </template>
              <template v-else-if="column.key === 'items'">
                <div v-for="item in record.items.slice(0, 2)" :key="item.id" class="mb-1 flex max-w-80 flex-col last:mb-0">
                  <span class="font-medium">{{ item.productName }}</span>
                  <span class="my-1"><b class="tabular-nums">{{ num(item.quantity).toLocaleString() }}</b> {{ item.unit }} <span class="text-xs text-muted-foreground">· 订单数量</span></span>
                  <span class="text-xs text-muted-foreground">{{ item.productCode }} · {{ specText(item) }}</span>
                  <span class="mt-1 text-xs" :class="item.processes?.length ? 'text-muted-foreground' : 'text-orange-600'">{{ item.processes?.length ? item.processes.map((code: string) => PROCESS_LABELS[code] || code).join(' → ') : '待确认产品工艺' }}</span>
                </div>
                <div v-if="record.items.length > 2" class="text-xs text-primary">共 {{ record.items.length }} 个产品，展开查看完整明细</div>
              </template>
              <template v-else-if="column.key === 'progress'">
                <div class="mb-3 flex flex-col">
                  <span class="font-medium">{{ dateText(record.promisedDate) || dateText(record.requiredDate) || '未填写交期' }}</span>
                  <span class="text-xs text-muted-foreground">{{ record.promisedDate ? '工厂交期' : '希望交货' }}</span>
                  <span v-if="deliveryHint(record as Api.Order)" class="mt-1 text-xs font-medium" :class="deliveryHint(record as Api.Order).startsWith('已逾期') ? 'text-destructive' : 'text-orange-600'">{{ deliveryHint(record as Api.Order) }}</span>
                </div>
                <div v-if="record.status !== 'SUBMITTED'" class="flex flex-col">
                  <span class="text-xs"><b class="text-primary">{{ progressPercent(record as Api.Order) }}%</b> · 已{{ record.sourceType === 'PURCHASE_ORDER' ? '入库' : '交货' }}</span>
                  <Progress :percent="progressPercent(record as Api.Order)" :show-info="false" size="small" />
                  <span class="text-xs text-muted-foreground">{{ num(record.completedQuantity).toLocaleString() }} / {{ num(record.totalQuantity).toLocaleString() }}</span>
                </div>
              </template>
              <template v-else-if="column.key === 'actions'">
                <div class="order-row-actions">
                  <Button :type="tab === 'factory' && canHandle && record.status === 'SUBMITTED' ? 'primary' : 'default'" @click="openOrder(record.id)">
                    {{ tab === 'factory' && record.status === 'SUBMITTED' ? '去接单' : '查看' }}
                  </Button>
                  <Button v-if="tab === 'factory' && canHandle && ['SUBMITTED', 'ACCEPTED'].includes(record.status)" @click="expandedOrderIds = expandedOrderIds.includes(record.id) ? expandedOrderIds.filter((id) => id !== record.id) : [...expandedOrderIds, record.id]">产品参数</Button>
                  <Button v-if="tab === 'factory' && canHandle && record.status === 'ACCEPTED' && record.batchRouteEditable" @click="batchRouteOrder = record as Api.Order">批量修改工艺</Button>
                  <Button
                    v-if="tab === 'mine' && record.sourceType !== 'PURCHASE_ORDER'"
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
      <OrderSplitModal :key="`split-${factory.factoryId.value ?? 'none'}`" v-model:open="releaseOpen" :orders="[...selected.values()]" @released="onSplitReleased" @changed="applyFreshOrder" />
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
      <OrderDrawer
        v-model:open="drawerOpen"
        :mode="tab === 'mine' ? 'mine' : 'factory'"
        :order-id="drawerId"
        :status-hint="rows.find((row) => row.id === drawerId)?.status"
        @changed="onChanged"
        @copy="copyOrder"
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
  padding: 4px 0;
}

.order-workspace {
  padding: 0 20px 20px;
}

.order-overview {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}

.overview-card {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 6px 12px;
  align-items: center;
  padding: 14px 16px;
  text-align: left;
  background: hsl(var(--background));
  border: 1px solid hsl(var(--border));
  border-radius: 10px;
  transition: border-color 0.15s, background-color 0.15s;
}

.overview-card:hover,
.overview-card.is-active {
  background: hsl(var(--primary) / 5%);
  border-color: hsl(var(--primary));
}

.overview-card:focus-visible {
  outline: 2px solid hsl(var(--primary));
  outline-offset: 3px;
}

.overview-card__label {
  display: flex;
  grid-column: 1;
  align-items: center;
  justify-content: space-between;
  font-size: 14px;
  font-weight: 500;
}

.overview-card__label > span {
  color: hsl(var(--muted-foreground));
}

.overview-card__value {
  grid-row: 1 / 3;
  grid-column: 2;
  font-size: 30px;
  font-variant-numeric: tabular-nums;
  line-height: 1.2;
}

.overview-card--pending .overview-card__value {
  color: #b45309;
}

.overview-card--active .overview-card__value {
  color: hsl(var(--primary));
}

.overview-card--done .overview-card__value {
  color: #15803d;
}

.overview-card__hint {
  grid-column: 1;
  font-size: 12px;
  color: hsl(var(--muted-foreground));
}

.order-workflow {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
  padding: 10px 14px;
  font-size: 12px;
  color: hsl(var(--muted-foreground));
  background: hsl(var(--muted) / 45%);
  border-radius: 8px;
}

.order-workflow b {
  display: inline-grid;
  place-items: center;
  width: 20px;
  height: 20px;
  margin-right: 4px;
  color: hsl(var(--primary));
  background: hsl(var(--primary) / 10%);
  border-radius: 50%;
}

.order-workflow i {
  font-style: normal;
}

.order-filters {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
}

.order-search {
  width: min(100%, 360px);
}

.order-filters__total {
  margin-left: auto;
  font-size: 13px;
  color: hsl(var(--muted-foreground));
}

.order-filters__total b {
  color: hsl(var(--foreground));
}

.order-batch {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
  justify-content: space-between;
  padding: 12px 14px;
  font-size: 13px;
  background: hsl(var(--muted) / 40%);
  border: 1px solid hsl(var(--border));
  border-radius: 8px;
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
  width: 260px;
  padding: 14px;
  background: hsl(var(--background));
  border: 1px solid hsl(var(--border));
  border-radius: 8px;
  box-shadow: 0 6px 20px #00000014;
}

.order-row-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
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
  font-weight: 500;
  color: hsl(var(--muted-foreground));
}

.production-orders-table :deep(.ant-table-cell) {
  vertical-align: top;
}

.production-orders-table :deep(.order-row--pending > td) {
  background: hsl(var(--warning) / 4%);
}

.production-orders-table :deep(.ant-table-tbody > .order-row--completed > td) {
  background: color-mix(in srgb, hsl(var(--success)) 12%, hsl(var(--background)));
}

.production-orders-table :deep(.ant-table-tbody > .order-row--completed:hover > td),
.production-orders-table :deep(.ant-table-tbody > .order-row--completed > .ant-table-cell-row-hover) {
  background: color-mix(in srgb, hsl(var(--success)) 18%, hsl(var(--background)));
}

@media (max-width: 768px) {
  .order-workspace {
    padding: 0 12px 12px;
  }

  .order-overview {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .overview-card {
    padding: 12px;
  }

  .order-search {
    width: 100%;
  }

  .order-workflow i {
    display: none;
  }
}
</style>
