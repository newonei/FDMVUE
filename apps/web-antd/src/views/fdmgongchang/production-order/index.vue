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
import FactorySwitch from '../shared/factory-switch.vue';
import { PROCESS_LABELS } from '../shared/schedule';
import { useFactory } from '../shared/use-factory';
import CreateModal from './modules/create-modal.vue';
import ExceptionLedger from './modules/exception-ledger.vue';
import ItemProductionConfigModal from './modules/item-production-config-modal.vue';
import OrderDrawer from './modules/order-drawer.vue';
import OrderItemsTable from './modules/order-items-table.vue';
import RestockLedger from './modules/restock-ledger.vue';
import ScheduleModal from './modules/schedule-modal.vue';
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
const filters = reactive({ keyword: '', status: (tab.value === 'factory' ? 'ACCEPTED' : undefined) as Api.Status | undefined });
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
    loadError.value = true;
  } finally {
    loading.value = false;
  }
}

async function loadPending() {
  if (!canHandle.value || !factoryReady.value || noFactory.value) return;
  try {
    const page = await getFactoryProductionOrders({ pageNo: 1, pageSize: 1, status: 'SUBMITTED' });
    pendingCount.value = page.total;
  } catch {
    pendingCount.value = 0;
  }
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
  selected.value = new Map();
  batchMixOpen.value = false;
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
  pageNo.value = 1;
  selected.value = new Map();
  filters.status = value === 'factory' ? 'ACCEPTED' : undefined;
  if (value !== 'schedule') loadRows();
});

let searchTimer: ReturnType<typeof setTimeout> | undefined;
watch(
  () => [filters.keyword, filters.status],
  () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
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
  await loadRows();
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
  { key: 'orderNo', title: '订单号' },
  tab.value === 'mine'
    ? { dataIndex: 'factoryName', key: 'factoryName', title: '工厂' }
    : { key: 'requester', title: '下单人' },
  { key: 'items', title: '产品明细 / 订单数量', width: 340 },
  { key: 'route', title: '实际工艺路线', width: 260 },
  { key: 'progress', title: '完成', width: 160 },
  { key: 'date', title: '交期' },
  { key: 'status', title: '状态' },
  { align: 'right' as const, key: 'actions', title: '操作', width: 175 },
]);

function progressPercent(o: Api.Order) {
  const t = num(o.totalQuantity);
  return t > 0 ? Math.min(100, Math.round((num(o.completedQuantity) / t) * 100)) : 0;
}
</script>

<template>
  <Page>
    <div class="flex flex-col gap-4">
      <header class="flex flex-wrap items-end justify-between gap-3">
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
            接单并确认产品工艺、生产参数后，勾选订单 → 预览各工序任务 → 确认下发。任务按每条产品明细的实际工艺分配到对应车间，工人在车间领取、领料和报工；订单数量与工序计划量分别显示。完成数量按交货数累加，发货在「库存中心 → 出库单」办理。
          </p>
        </div>
        <Button v-if="canCreate" type="primary" @click="openCreate()">＋ 提生产需求</Button>
      </header>

      <Result v-if="!canCreate && !canHandle && !canViewSchedule" status="info" title="还没有工厂排单的权限">
        <template #subTitle>需要向工厂提生产需求的话，请联系管理员分配「工厂下单」角色。</template>
      </Result>

      <section v-else class="rounded-lg border border-border bg-card px-4 pb-4">
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
        <div v-else class="flex flex-col gap-3">
          <div class="flex flex-wrap items-center gap-2">
            <template v-if="selectable">
              <Button v-if="canRelease" :disabled="selected.size === 0" size="small" type="primary" @click="releaseOpen = true">
                拆分工序任务{{ selected.size > 0 ? `（已选 ${selected.size} 张）` : '' }}
              </Button>
              <details class="relative text-xs">
                <summary class="cursor-pointer text-muted-foreground">辅助排单</summary>
                <div class="absolute left-0 top-6 z-10 flex w-64 flex-col gap-2 rounded border border-border bg-background p-3 shadow-md">
                  <span class="text-muted-foreground">特殊排产与旧流程，正常订单使用「拆分工序任务」。</span>
                  <Button v-if="canSchedule" :disabled="selected.size === 0" size="small" @click="scheduleOpen = true">AI 排单{{ selected.size > 0 ? `（已选 ${selected.size} 张）` : '' }}</Button>
                  <Button v-if="canRelease" size="small" @click="batchMixOpen = true">批量安排发泡{{ selected.size > 0 ? `（已选 ${selected.size} 张）` : '' }}</Button>
                </div>
              </details>
              <span v-if="selected.size === 0" class="text-xs text-muted-foreground">勾选已接单的订单，按实际工艺预览并下发各车间任务</span>
              <button v-else class="text-xs text-primary hover:underline" type="button" @click="selected = new Map()">清空</button>
            </template>
            <Select
              id="po-filter-status"
              v-model:value="filters.status"
              :options="statusOptions"
              allow-clear
              class="w-32"
              placeholder="全部状态"
              size="small"
            />
            <Input
              id="po-filter-keyword"
              v-model:value="filters.keyword"
              allow-clear
              :style="{ width: '14rem' }"
              placeholder="订单号、采购单号、合同号、下单人"
              size="small"
            />
          </div>
          <Table
            v-model:expanded-row-keys="expandedOrderIds"
            :columns="columns"
            :data-source="rows"
            :loading="loading"
            :pagination="{ current: pageNo, pageSize, showSizeChanger: true, total, showTotal: (t: number) => `共 ${t} 张` }"
            :row-selection="rowSelection"
            :scroll="{ x: 'max-content' }"
            row-key="id"
            size="small"
            @change="(p) => ((pageNo = p.current ?? 1), (pageSize = p.pageSize ?? 20), loadRows())"
          >
            <template #emptyText>
              <span class="text-muted-foreground">{{ tab === 'mine' ? '还没有提过需求，点右上角「提生产需求」' : '还没有收到订单' }}</span>
            </template>
            <template #expandedRowRender="{ record }"><OrderItemsTable :items="record.items" :editable="tab === 'factory' && canHandle && ['SUBMITTED', 'ACCEPTED'].includes(record.status)" @edit="editItem(record.id, $event)" /></template>
            <template #bodyCell="{ column, record }">
              <template v-if="column.key === 'orderNo'">
                <div class="flex flex-col">
                  <button class="text-left text-primary hover:underline" type="button" @click="openOrder(record.id)">{{ record.orderNo }}</button>
                  <span class="text-xs text-muted-foreground">{{ timeText(record.createTime) }}<template v-if="record.purpose && record.sourceType !== 'PURCHASE_ORDER'"> · {{ record.purpose }}</template></span>
                  <span v-if="record.sourceType === 'PURCHASE_ORDER'" class="flex flex-wrap items-center gap-1 text-xs">
                    <Tag class="m-0" color="blue">采购单 {{ record.sourceOrderCode }}</Tag>
                    <Tag v-if="record.sourceChanged" class="m-0" color="orange">有变更</Tag>
                    <span v-if="record.sourceContractCode" class="text-muted-foreground">{{ record.sourceContractCode }}</span>
                  </span>
                </div>
              </template>
              <template v-else-if="column.key === 'requester'">
                <div class="flex flex-col">
                  <span>{{ record.requesterName }}</span>
                  <span class="text-xs text-muted-foreground">{{ record.requesterDeptName }}</span>
                </div>
              </template>
              <template v-else-if="column.key === 'items'">
                <div v-for="item in record.items.slice(0, 2)" :key="item.id" class="mb-1 flex max-w-80 flex-col last:mb-0">
                  <span>{{ item.productName }} · {{ num(item.quantity) }} {{ item.unit }}</span>
                  <span class="text-xs text-muted-foreground">{{ item.productCode }} · {{ specText(item) }}</span>
                </div>
                <div v-if="record.items.length > 2" class="text-xs text-primary">共 {{ record.items.length }} 个产品，展开查看完整明细</div>
              </template>
              <template v-else-if="column.key === 'route'">
                <div v-for="item in record.items.slice(0, 2)" :key="item.id" class="mb-1 text-xs last:mb-0">
                  <div>{{ item.routeName || '自选工艺' }}</div>
                  <span :class="item.processes?.length ? 'text-muted-foreground' : 'text-orange-600'">{{ item.processes?.length ? item.processes.map((code: string) => PROCESS_LABELS[code] || code).join(' → ') : '未配置工艺' }}</span>
                </div>
              </template>
              <template v-else-if="column.key === 'progress'">
                <div class="flex flex-col">
                  <span class="text-xs">{{ num(record.completedQuantity) }} / {{ num(record.totalQuantity) }}</span>
                  <Progress :percent="progressPercent(record as Api.Order)" :show-info="false" size="small" />
                </div>
              </template>
              <template v-else-if="column.key === 'date'">
                <div class="flex flex-col">
                  <span>{{ dateText(record.promisedDate) || dateText(record.requiredDate) || '没填' }}</span>
                  <span class="text-xs text-muted-foreground">{{ record.promisedDate ? '工厂交期' : '希望交货' }}</span>
                </div>
              </template>
              <template v-else-if="column.key === 'status'">
                <Tag :color="ORDER_STATUS[record.status as Api.Status]?.color" class="m-0">{{ record.statusLabel }}</Tag>
              </template>
              <template v-else-if="column.key === 'actions'">
                <span class="inline-flex gap-3 whitespace-nowrap text-xs">
                  <button class="text-primary hover:underline" type="button" @click="openOrder(record.id)">
                    {{ tab === 'factory' && record.status === 'SUBMITTED' ? '去接单' : '查看' }}
                  </button>
                  <button v-if="tab === 'factory' && canHandle && ['SUBMITTED', 'ACCEPTED'].includes(record.status)" class="text-primary hover:underline" type="button" @click="expandedOrderIds = [...new Set([...expandedOrderIds, record.id])]">产品参数</button>
                  <button
                    v-if="tab === 'mine' && record.sourceType !== 'PURCHASE_ORDER'"
                    class="text-primary hover:underline"
                    type="button"
                    @click="openCreate(record as Api.Order)"
                  >
                    {{ record.status === 'REJECTED' ? '改了重下' : '复制' }}
                  </button>
                </span>
              </template>
            </template>
          </Table>
        </div>
      </section>

      <CreateModal v-model:open="createOpen" :copy-from="copyFrom" :factories="orderable" @created="onCreated" />
      <ScheduleModal v-model:open="scheduleOpen" :orders="[...selected.values()]" @generated="onScheduled" />
      <OrderSplitModal :key="`split-${factory.factoryId.value ?? 'none'}`" v-model:open="releaseOpen" :orders="[...selected.values()]" @released="onSplitReleased" @changed="applyFreshOrder" />
      <ItemProductionConfigModal v-if="configOrderId && configItemId" :key="factory.factoryId.value ?? 'none'" v-model:open="configOpen" :order-id="configOrderId" :item-id="configItemId" @saved="onConfigSaved" />
      <MixBatchModal :key="factory.factoryId.value ?? 'none'" v-model:open="batchMixOpen" :orders="[...selected.values()]" @released="onScheduled" />
      <OrderDrawer v-model:open="drawerOpen" :mode="tab === 'mine' ? 'mine' : 'factory'" :order-id="drawerId" @changed="onChanged" @copy="copyOrder" />
    </div>
  </Page>
</template>
