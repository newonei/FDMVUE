<script lang="ts" setup>
import type { FactoryOrderBoardApi as Api } from '#/api/fdmgongchang/order-board';

import { computed, onActivated, onBeforeUnmount, onDeactivated, onMounted, reactive, ref, watch } from 'vue';

import { useAccess } from '@vben/access';
import { Page } from '@vben/common-ui';

import { Alert, Button, Descriptions, Drawer, Input, message, Modal, Result, Select, Spin, Switch, Table, Tag, Tooltip } from 'ant-design-vue';

import { getOrderBoardOrder, getOrderBoardOwners, getOrderBoardPage, setOrderBoardOwner } from '#/api/fdmgongchang/order-board';

import { dateText, num, ORDER_STATUS, specText, timeText } from '../production-order/shared';
import FactorySwitch from '../shared/factory-switch.vue';
import { useFactory } from '../shared/use-factory';
import { currentStage, dueHint, orderStages } from './model';

defineOptions({ name: 'FdmGongchangOrderBoard' });

const factory = useFactory();
const { hasAccessByCodes } = useAccess();
const canAssign = computed(() => hasAccessByCodes(['fdmgongchang:production-order:handle']));
const rows = ref<Api.Order[]>([]);
const total = ref(0);
const loading = ref(false);
const error = ref(false);
const initialized = ref(false);
const noFactory = computed(() => initialized.value && factory.factoryId.value === null);
const filters = reactive({ keyword: '', ownerUserId: undefined as number | undefined, status: undefined as Api.Order['status'] | undefined });
const pageNo = ref(1);
const pageSize = ref(10);
const owners = ref<Api.Owner[]>([]);
const ownerOptions = computed(() => owners.value.map((owner) => ({ label: owner.name, value: owner.userId })));
const statusOptions = Object.entries(ORDER_STATUS).map(([value, status]) => ({ label: status.label, value }));
const updatedAt = ref('');
const autoRefresh = ref(true);
let requestVersion = 0;
let ownersVersion = 0;
let detailVersion = 0;
let searchTimer: ReturnType<typeof setTimeout> | undefined;
let refreshTimer: ReturnType<typeof setInterval> | undefined;

const detailOpen = ref(false);
const detail = ref<Api.Order>();
const detailLoading = ref(false);
const detailError = ref(false);
const ownerOrder = ref<Api.Order>();
const ownerId = ref<number>();
const ownerSaving = ref(false);
const pageSummary = computed(() => ({
  pending: rows.value.filter((order) => order.status === 'SUBMITTED').length,
  running: rows.value.filter((order) => order.status === 'ACCEPTED').length,
  unassigned: rows.value.filter((order) => !order.ownerUserId).length,
}));

const columns = [
  { fixed: 'left' as const, key: 'order', title: '订单信息 / 负责人', width: 260 },
  { key: 'flow', title: '生产到出库 · 各环节进度' },
];

async function load() {
  const version = ++requestVersion;
  if (!(await factory.whenActive()) || version !== requestVersion || factory.factoryId.value === null) return;
  loading.value = true;
  error.value = false;
  try {
    const data = await getOrderBoardPage({ ...filters, keyword: filters.keyword.trim() || undefined, pageNo: pageNo.value, pageSize: pageSize.value });
    if (version !== requestVersion) return;
    rows.value = data.list;
    total.value = data.total;
    updatedAt.value = new Date().toLocaleTimeString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false });
  } catch {
    if (version === requestVersion) error.value = true;
  } finally {
    if (version === requestVersion) loading.value = false;
  }
}

async function loadOwners() {
  const version = ++ownersVersion;
  try {
    const data = await getOrderBoardOwners();
    if (version === ownersVersion) owners.value = data;
  } catch {
    if (version === ownersVersion) owners.value = [];
  }
}

async function initialize() {
  try {
    await factory.load();
    initialized.value = true;
    if (factory.factoryId.value !== null) await Promise.all([load(), loadOwners()]);
  } catch {
    error.value = true;
  }
}

async function switchFactory(id: number) {
  if (id === factory.factoryId.value) return;
  ++requestVersion;
  ++ownersVersion;
  ++detailVersion;
  detailOpen.value = false;
  ownerOrder.value = undefined;
  rows.value = [];
  owners.value = [];
  total.value = 0;
  filters.ownerUserId = undefined;
  pageNo.value = 1;
  factory.select(id);
  await Promise.all([load(), loadOwners()]);
}

function startRefresh() {
  clearInterval(refreshTimer);
  refreshTimer = setInterval(() => {
    if (autoRefresh.value && !loading.value && !detailOpen.value && !ownerOrder.value && initialized.value) void load();
  }, 60_000);
}

onMounted(() => { void initialize(); startRefresh(); });
onActivated(() => { startRefresh(); if (initialized.value) void load(); });
onDeactivated(() => { clearInterval(refreshTimer); clearTimeout(searchTimer); ++requestVersion; ++ownersVersion; ++detailVersion; loading.value = false; detailLoading.value = false; });
onBeforeUnmount(() => { clearInterval(refreshTimer); clearTimeout(searchTimer); ++requestVersion; ++ownersVersion; ++detailVersion; });

watch(() => [filters.keyword, filters.status, filters.ownerUserId], () => {
  ++requestVersion;
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => { pageNo.value = 1; void load(); }, 300);
});

function resetFilters() {
  filters.keyword = '';
  filters.status = undefined;
  filters.ownerUserId = undefined;
}

async function openDetail(order: Api.Order) {
  const version = ++detailVersion;
  detail.value = order;
  detailOpen.value = true;
  detailLoading.value = true;
  detailError.value = false;
  try {
    const fresh = await getOrderBoardOrder(order.id);
    if (version === detailVersion) detail.value = fresh;
  } catch {
    if (version === detailVersion) detailError.value = true;
  } finally {
    if (version === detailVersion) detailLoading.value = false;
  }
}

function assignOwner(order: Api.Order) {
  ownerOrder.value = order;
  ownerId.value = order.ownerUserId ?? undefined;
}

async function saveOwner() {
  const order = ownerOrder.value;
  if (!order) return;
  const factoryId = factory.factoryId.value;
  ownerSaving.value = true;
  try {
    await setOrderBoardOwner({ orderId: order.id, ownerUserId: ownerId.value ?? null });
    if (factoryId !== factory.factoryId.value) return;
    message.success(ownerId.value ? '订单负责人已更新' : '已清空订单负责人');
    ownerOrder.value = undefined;
    await load();
    if (detailOpen.value && detail.value?.id === order.id) await openDetail(order);
  } catch {
    // 请求层显示失败原因，保留当前选择供用户重试。
  } finally {
    ownerSaving.value = false;
  }
}
</script>

<template>
  <Page>
    <div class="order-board flex flex-col gap-4">
      <header class="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div class="flex flex-wrap items-center gap-4">
            <h1 class="m-0 text-xl font-semibold">订单看板</h1>
            <FactorySwitch v-if="factory.factories.value.length" :factories="factory.factories.value" :value="factory.factoryId.value" @change="switchFactory" />
          </div>
          <p class="mb-0 mt-1 text-sm text-muted-foreground">一张订单一行，跟踪发泡、各道加工、交货入库与出库。</p>
        </div>
        <div class="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          <span v-if="updatedAt">{{ updatedAt }} 更新</span>
          <label class="flex items-center gap-2"><Switch v-model:checked="autoRefresh" size="small" />每分钟刷新</label>
          <Button :loading="loading" @click="initialized ? load() : initialize()">刷新看板</Button>
        </div>
      </header>

      <Result v-if="noFactory" status="info" title="当前账号没有可查看的工厂" />
      <Result v-else-if="error && !initialized" status="warning" title="工厂信息加载失败">
        <template #extra><Button type="primary" @click="initialize">重新加载</Button></template>
      </Result>
      <section v-else class="board-panel rounded-xl border border-border bg-card p-4">
        <div class="board-filters">
          <Input v-model:value="filters.keyword" allow-clear class="board-search" aria-label="搜索订单" placeholder="订单号、采购单、合同、客户、负责人" />
          <Select v-model:value="filters.status" :options="statusOptions" allow-clear placeholder="全部订单状态" class="w-40" aria-label="订单状态" />
          <Select v-model:value="filters.ownerUserId" :options="ownerOptions" allow-clear show-search option-filter-prop="label" placeholder="全部负责人" class="w-40" aria-label="按负责人筛选" />
          <Button v-if="filters.keyword || filters.status || filters.ownerUserId" @click="resetFilters">重置筛选</Button>
          <span class="ml-auto text-sm text-muted-foreground">共 <b class="text-foreground">{{ total }}</b> 张订单</span>
        </div>
        <div class="board-legend">
          <span class="legend-dot legend-dot--running">生产中</span>
          <span class="legend-dot legend-dot--partial">部分完成</span>
          <span class="legend-dot legend-dot--done">已达标 / 完成</span>
          <span class="legend-dot legend-dot--reported">已报工，待核对</span>
          <span class="text-muted-foreground">本页：待接单 {{ pageSummary.pending }} · 生产中 {{ pageSummary.running }} · 未分配负责人 {{ pageSummary.unassigned }}</span>
        </div>
        <Alert v-if="error" class="mb-3" type="warning" show-icon message="刷新失败，当前显示上次加载的订单，请稍后重试。" />
        <Table :columns="columns" :data-source="rows" :loading="loading" row-key="id" size="middle" :scroll="{ x: 800 }" :pagination="{ current: pageNo, pageSize, total, showSizeChanger: true, pageSizeOptions: ['10', '20', '50'], showTotal: (count: number) => `共 ${count} 张订单` }" @change="(page) => { pageNo = page.current ?? 1; pageSize = page.pageSize ?? 10; load(); }">
          <template #emptyText><div class="py-10 text-muted-foreground">{{ filters.keyword || filters.status || filters.ownerUserId ? '没有符合筛选条件的订单' : '当前工厂还没有生产订单' }}</div></template>
          <template #bodyCell="{ column, record }">
            <template v-if="column.key === 'order'">
              <div class="flex flex-col gap-2">
                <div class="flex flex-wrap items-center gap-2"><Tag :color="ORDER_STATUS[record.status as Api.Order['status']]?.color" class="m-0">{{ record.statusLabel }}</Tag><span class="text-xs font-medium">{{ currentStage(record as Api.Order) }}</span></div>
                <button type="button" class="text-left font-semibold text-primary hover:underline" @click="openDetail(record as Api.Order)">{{ record.orderNo }}</button>
                <div v-if="record.sourceOrderCode || record.sourceContractCode" class="text-xs text-muted-foreground">{{ [record.sourceOrderCode, record.sourceContractCode].filter(Boolean).join(' · ') }}</div>
                <div class="text-xs">{{ record.customerName || record.purpose || (record.sourceType === 'RESTOCK' ? '系统补库' : '内部生产需求') }}</div>
                <div class="flex items-center gap-2 border-t border-border pt-2 text-xs">
                  <span class="text-muted-foreground">负责人</span>
                  <b :class="record.ownerName ? '' : 'text-orange-600'">{{ record.ownerName || '未分配' }}</b>
                  <Button v-if="canAssign" type="link" size="small" @click="assignOwner(record as Api.Order)">{{ record.ownerUserId ? '更换' : '分配' }}</Button>
                </div>
                <div class="text-xs text-muted-foreground">{{ record.promisedDate ? '工厂交期' : '需求交期' }}：{{ dateText(record.promisedDate) || dateText(record.requiredDate) || '待确认' }} <b v-if="dueHint(record as Api.Order)" class="text-destructive">{{ dueHint(record as Api.Order) }}</b></div>
                <div><Button size="small" @click="openDetail(record as Api.Order)">订单详情</Button></div>
              </div>
            </template>
            <template v-else-if="column.key === 'flow'">
              <div class="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs">
                <span class="max-w-[520px] truncate" :title="record.items.map((item: Api.Item) => `${item.productName} ${num(item.quantity)}${item.unit || ''}`).join('；')">{{ record.items[0]?.productName || '暂无产品明细' }}<b v-if="record.items.length > 1"> 等 {{ record.items.length }} 个产品</b></span>
                <span class="text-muted-foreground">下单人：{{ record.requesterName || '—' }}</span>
              </div>
              <div class="stage-grid">
                <Tooltip v-for="stage in orderStages(record as Api.Order)" :key="stage.code" :title="stage.detail" placement="top">
                  <div class="stage-tile" :class="`stage-tile--${stage.state}`" tabindex="0" :aria-label="`${stage.label}：${stage.text}`">
                    <span class="stage-tile__name">{{ stage.label }}</span>
                    <b>{{ stage.text }}</b>
                  </div>
                </Tooltip>
              </div>
            </template>
          </template>
        </Table>
        <p class="mb-0 mt-3 text-xs leading-5 text-muted-foreground">按实际工艺和关联任务展示；“未关联”表示暂无该环节的关联数据。“已达标”依据任务目标与实际报工判断；“已报工”仅表示工序有报工记录。出库仅统计明确关联本单的有效出库记录。</p>
      </section>
    </div>

    <Drawer v-model:open="detailOpen" :title="`订单详情 ${detail?.orderNo || ''}`" width="min(960px, 100vw)">
      <Spin :spinning="detailLoading">
        <div v-if="detail" class="flex flex-col gap-4">
          <Alert v-if="detailError" type="warning" message="详情刷新失败，当前显示列表快照。" />
          <Descriptions bordered size="small" :column="2">
            <Descriptions.Item label="订单状态"><Tag :color="ORDER_STATUS[detail.status]?.color">{{ detail.statusLabel }}</Tag>{{ currentStage(detail) }}</Descriptions.Item>
            <Descriptions.Item label="订单负责人">{{ detail.ownerName || '未分配' }} <Button v-if="canAssign" type="link" size="small" @click="assignOwner(detail)">分配 / 更换</Button></Descriptions.Item>
            <Descriptions.Item label="来源采购单">{{ detail.sourceOrderCode || '—' }}</Descriptions.Item>
            <Descriptions.Item label="关联合同">{{ detail.sourceContractCode || '—' }}</Descriptions.Item>
            <Descriptions.Item label="客户 / 用途">{{ detail.customerName || detail.purpose || '—' }}</Descriptions.Item>
            <Descriptions.Item label="下单人">{{ detail.requesterName || '—' }} · {{ detail.requesterDeptName || '—' }}</Descriptions.Item>
            <Descriptions.Item label="需求交期">{{ dateText(detail.requiredDate) || '待确认' }}</Descriptions.Item>
            <Descriptions.Item label="工厂交期">{{ dateText(detail.promisedDate) || '待确认' }}</Descriptions.Item>
            <Descriptions.Item label="创建时间">{{ timeText(detail.createTime) }}</Descriptions.Item>
            <Descriptions.Item label="接单经办人">{{ detail.handlerName || '—' }}</Descriptions.Item>
            <Descriptions.Item v-if="detail.remark || detail.reply" label="备注 / 工厂回复" :span="2">{{ [detail.remark, detail.reply].filter(Boolean).join('；') }}</Descriptions.Item>
          </Descriptions>
          <section v-for="item in detail.items" :key="item.id" class="rounded-lg border border-border p-4">
            <div class="mb-3 flex flex-wrap items-start justify-between gap-3">
              <div><b>{{ item.productName }}</b><div class="mt-1 text-xs text-muted-foreground">{{ item.productCode }} · {{ specText(item) }}</div></div>
              <div class="text-right text-sm"><b>{{ num(item.quantity) }} {{ item.unit }}</b><div class="mt-1 text-xs text-muted-foreground">已交货 / 入库 {{ num(item.completedQuantity) }} · 已出库 {{ num(item.shippedQuantity) }}</div></div>
            </div>
            <div class="stage-grid">
              <Tooltip v-for="stage in orderStages({ ...detail, items: [item] })" :key="stage.code" :title="stage.detail"><div class="stage-tile" :class="`stage-tile--${stage.state}`" tabindex="0"><span class="stage-tile__name">{{ stage.label }}</span><b>{{ stage.text }}</b></div></Tooltip>
            </div>
            <div class="mt-3 flex flex-col gap-1 text-xs text-muted-foreground"><span v-for="step in item.steps" :key="step.process">{{ step.label }}：良品 {{ num(step.goodQuantity) }}{{ step.unit }} · {{ step.orderCount }} 张工序单 · {{ step.inProgressCount }} 张在制<template v-if="step.sharedTaskCount"> · {{ step.sharedTaskCount }} 个合并生产任务</template></span></div>
          </section>
        </div>
      </Spin>
    </Drawer>

    <Modal :open="!!ownerOrder" title="分配订单负责人" :confirm-loading="ownerSaving" ok-text="保存负责人" @ok="saveOwner" @cancel="ownerOrder = undefined">
      <p class="text-sm text-muted-foreground">{{ ownerOrder?.orderNo }} · 指定本厂人员跟进订单，清空选择可取消分配。</p>
      <Select v-model:value="ownerId" :options="ownerOptions" show-search allow-clear option-filter-prop="label" class="w-full" placeholder="请选择订单负责人" aria-label="订单负责人" />
    </Modal>
  </Page>
</template>

<style scoped>
.board-filters {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;

}

.board-search {
  width: min(100%, 360px);

}

.board-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  align-items: center;
  margin: 16px 0;
  font-size: 12px;

}

.legend-dot {
  display: inline-flex;
  gap: 6px;
  align-items: center;

}

.legend-dot::before {
  width: 7px;
  height: 7px;
  content: '';
  background: var(--stage-color);
  border-radius: 50%;

}

.legend-dot--running {
  --stage-color: #1677ff;

}

.legend-dot--partial {
  --stage-color: #d97706;

}

.legend-dot--done {
  --stage-color: #16a34a;

}

.legend-dot--reported {
  --stage-color: #7c3aed;

}

.stage-grid {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 8px;

}

.stage-tile {
  display: flex;
  flex-direction: column;
  gap: 5px;
  justify-content: center;
  min-height: 57px;
  padding: 8px;
  font-size: 11px;
  color: hsl(var(--muted-foreground));
  background: hsl(var(--muted) / 45%);
  border: 1px solid hsl(var(--border));
  border-radius: 7px;

}

.stage-tile__name {
  font-size: 12px;
  font-weight: 500;

}

.stage-tile b {
  font-weight: 500;

}

.stage-tile--running {
  color: #0958d9;
  background: #1677ff0d;
  border-color: #1677ff55;

}

.stage-tile--done {
  color: #15803d;
  background: #16a34a0d;
  border-color: #16a34a40;

}

.stage-tile--partial, .stage-tile--waiting {
  color: #b45309;
  background: #d977060d;
  border-color: #d9770638;

}

.stage-tile--reported {
  color: #7c3aed;
  background: #7c3aed0d;
  border-color: #7c3aed38;

}

.stage-tile--skipped {
  border-style: dashed;
  opacity: 0.65;

}

.stage-tile:focus-visible {
  outline: 2px solid hsl(var(--primary));
  outline-offset: 2px;

}

.board-panel :deep(.ant-table-cell) {
  vertical-align: top;

}

.board-panel :deep(.ant-table-thead > tr > th) {
  font-weight: 500;
  color: hsl(var(--muted-foreground));

}

@media (max-width: 640px) {
  .board-search {
  width: 100%;

}

 .stage-grid {
  grid-template-columns: repeat(3, minmax(0, 1fr));

}
}
</style>
