<script lang="ts" setup>
import type { Stage } from './model';

import type { FactoryOrderBoardApi as Api } from '#/api/fdmgongchang/order-board';

import { computed, onActivated, onBeforeUnmount, onDeactivated, onMounted, reactive, ref, watch } from 'vue';

import { useAccess } from '@vben/access';
import { Page } from '@vben/common-ui';

import { Alert, Button, Descriptions, Input, message, Modal, Result, Select, Spin, Switch, Table, Tag, Tooltip } from 'ant-design-vue';

import { getOrderBoardOrder, getOrderBoardOwners, getOrderBoardPage, setOrderBoardOwner } from '#/api/fdmgongchang/order-board';

import { dateText, num, ORDER_STATUS, specText, timeText } from '../production-order/shared';
import FactoryDialog from '../shared/factory-dialog.vue';
import FactorySwitch from '../shared/factory-switch.vue';
import { useFactory } from '../shared/use-factory';
import { currentStage, dueHint, orderStages } from './model';
import { refreshOrderBoardShortageBadge } from './shortage-badge';
import StageDetailModal from './stage-detail-modal.vue';

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
const filters = reactive({ keyword: '', ownerUserId: undefined as number | undefined, status: undefined as Api.PageReq['status'] });
const pageNo = ref(1);
const pageSize = ref(10);
const owners = ref<Api.Owner[]>([]);
const ownerOptions = computed(() => owners.value.map((owner) => ({ label: owner.name, value: owner.userId })));
const statusOptions = (['ACCEPTED', 'COMPLETED'] as const).map((value) => ({ label: ORDER_STATUS[value].label, value }));
const updatedAt = ref('');
const autoRefresh = ref(true);
let requestVersion = 0;
let ownersVersion = 0;
let detailVersion = 0;
let stageVersion = 0;
let searchTimer: ReturnType<typeof setTimeout> | undefined;
let refreshTimer: ReturnType<typeof setInterval> | undefined;

const detailOpen = ref(false);
const detail = ref<Api.Order>();
const detailLoading = ref(false);
const detailError = ref(false);
const stageSelection = ref<{ itemId?: number; order: Api.Order; stage: Stage }>();
const stageLoading = ref(false);
const stageError = ref(false);
const ownerOrder = ref<Api.Order>();
const ownerId = ref<number>();
const ownerSaving = ref(false);
const pageSummary = computed(() => ({
  completed: rows.value.filter((order) => order.status === 'COMPLETED').length,
  running: rows.value.filter((order) => order.status === 'ACCEPTED').length,
  unassigned: rows.value.filter((order) => !order.ownerUserId).length,
}));

const defaultStages = orderStages({ items: [] });

function stageCells(items: Api.Item[]) {
  return Object.fromEntries(orderStages({ items }).map((stage) => [stage.code, stage]));
}

function stageColumns(displayRows: { stageCells: Record<string, Stage> }[]) {
  const stages = new Map(defaultStages.map((stage) => [stage.code, stage.label]));
  for (const row of displayRows) {
    for (const stage of Object.values(row.stageCells)) {
      if (!stages.has(stage.code)) stages.set(stage.code, stage.label);
    }
  }
  const logistics = ['STOCK_IN', 'OUTBOUND'];
  const productionStages = [...stages.keys()].filter((code) => !logistics.includes(code));
  return [...productionStages, ...logistics].map((code) => ({
    dataIndex: ['stageCells', code], key: `stage:${code}`, title: stages.get(code), width: 112,
  }));
}

const boardRows = computed(() => rows.value.map((order) => ({ ...order, stageCells: stageCells(order.items) })));
const productRows = computed(() => (detail.value?.items ?? []).map((item) => ({ ...item, stageCells: stageCells([item]) })));
const columns = computed(() => [
  { fixed: 'left' as const, key: 'orderNo', title: '生产订单号', width: 155 },
  { key: 'status', title: '订单状态', width: 100 },
  { key: 'currentStage', title: '当前进度', width: 155 },
  { key: 'product', title: '产品', width: 190 },
  { key: 'owner', title: '负责人', width: 125 },
  { key: 'due', title: '交货日期', width: 130 },
  { key: 'customer', title: '客户 / 用途', width: 150 },
  ...stageColumns(boardRows.value),
  { dataIndex: 'sourceOrderCode', key: 'sourceOrderCode', title: '采购单号', width: 150 },
  { dataIndex: 'sourceContractName', key: 'sourceContractName', title: '合同内部单号', width: 155 },
  { dataIndex: 'sourceContractCode', key: 'sourceContractCode', title: '合同编号', width: 155 },
  { dataIndex: 'requesterName', key: 'requesterName', title: '下单人', width: 100 },
]);
const productColumns = computed(() => [
  { fixed: 'left' as const, key: 'product', title: '产品', width: 160 },
  { dataIndex: 'productCode', key: 'productCode', title: '产品编码', width: 120 },
  { key: 'spec', title: '规格', width: 170 },
  { align: 'right' as const, dataIndex: 'quantity', key: 'quantity', title: '订单需求', width: 100 },
  { align: 'right' as const, dataIndex: 'completedQuantity', key: 'completedQuantity', title: '已交货 / 入库', width: 110 },
  { align: 'right' as const, dataIndex: 'shippedQuantity', key: 'shippedQuantity', title: '已出库', width: 100 },
  ...stageColumns(productRows.value),
]);
const boardWidth = computed(() => columns.value.reduce((width, column) => width + column.width, 0));
const productWidth = computed(() => productColumns.value.reduce((width, column) => width + column.width, 0));

const detailFields = computed(() => {
  const order = detail.value;
  if (!order) return [];
  return [
    ['采购单号', order.sourceOrderCode], ['合同内部单号', order.sourceContractName],
    ['合同编号', order.sourceContractCode], ['客户 / 用途', order.customerName || order.purpose],
    ['下单人', order.requesterName], ['下单部门', order.requesterDeptName],
    ['需求交期', dateText(order.requiredDate)], ['工厂交期', dateText(order.promisedDate)],
    ['创建时间', timeText(order.createTime)], ['接单经办人', order.handlerName],
    ['订单备注', order.remark], ['工厂回复', order.reply],
  ] as const;
});

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
  closeStage();
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
    if (autoRefresh.value && !loading.value && !detailOpen.value && !stageSelection.value && !ownerOrder.value && initialized.value) void load();
  }, 60_000);
}

async function refreshBoard() {
  await (initialized.value ? load() : initialize());
  refreshOrderBoardShortageBadge();
}

onMounted(() => { void initialize(); startRefresh(); });
onActivated(() => { startRefresh(); if (initialized.value) void load(); });
onDeactivated(() => { clearInterval(refreshTimer); clearTimeout(searchTimer); ++requestVersion; ++ownersVersion; ++detailVersion; closeStage(); loading.value = false; detailLoading.value = false; });
onBeforeUnmount(() => { clearInterval(refreshTimer); clearTimeout(searchTimer); ++requestVersion; ++ownersVersion; ++detailVersion; closeStage(); });

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

function openStage(order: Api.Order, stage: Stage, itemId?: number) {
  stageSelection.value = { itemId, order, stage };
  void refreshStage();
}

async function refreshStage() {
  const selection = stageSelection.value;
  if (!selection) return;
  const version = ++stageVersion;
  stageLoading.value = true;
  stageError.value = false;
  try {
    const order = await getOrderBoardOrder(selection.order.id);
    if (version === stageVersion) stageSelection.value = { ...selection, order };
  } catch {
    if (version === stageVersion) stageError.value = true;
  } finally {
    if (version === stageVersion) stageLoading.value = false;
  }
}

function closeStage() {
  ++stageVersion;
  stageSelection.value = undefined;
  stageLoading.value = false;
  stageError.value = false;
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
        </div>
        <div class="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          <span v-if="updatedAt">{{ updatedAt }} 更新</span>
          <label class="flex items-center gap-2"><Switch v-model:checked="autoRefresh" size="small" />每分钟刷新</label>
          <Button :loading="loading" @click="refreshBoard">刷新看板</Button>
        </div>
      </header>

      <Result v-if="noFactory" status="info" title="当前账号没有可查看的工厂" />
      <Result v-else-if="error && !initialized" status="warning" title="工厂信息加载失败">
        <template #extra><Button type="primary" @click="initialize">重新加载</Button></template>
      </Result>
      <section v-else class="board-panel rounded-xl border border-border bg-card p-4">
        <div class="board-filters">
          <Input v-model:value="filters.keyword" allow-clear class="board-search" aria-label="搜索订单" placeholder="订单号、采购单、合同内部单号、客户、负责人" />
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
          <span class="text-muted-foreground">本页：生产中 {{ pageSummary.running }} · 已完成 {{ pageSummary.completed }} · 未分配负责人 {{ pageSummary.unassigned }}</span>
        </div>
        <Alert v-if="error" class="mb-3" type="warning" show-icon message="刷新失败，当前显示上次加载的订单，请稍后重试。" />
        <Table
          bordered
          :columns="columns"
          :data-source="boardRows"
          :loading="loading"
          :row-class-name="(order: Api.Order) => order.status === 'COMPLETED' ? 'order-row--completed' : ''"
          row-key="id"
          size="small"
          sticky
          :scroll="{ x: boardWidth }"
          :pagination="{ current: pageNo, pageSize, total, showSizeChanger: true, pageSizeOptions: ['10', '20', '50'], showTotal: (count: number) => `共 ${count} 张订单` }"
          @change="(page) => { pageNo = page.current ?? 1; pageSize = page.pageSize ?? 10; load(); }"
        >
          <template #emptyText><div class="py-10 text-muted-foreground">{{ filters.keyword || filters.status || filters.ownerUserId ? '没有符合筛选条件的订单' : '当前工厂还没有已接单的订单' }}</div></template>
          <template #bodyCell="{ column, record, text }">
            <template v-if="column.key === 'orderNo'">
              <button type="button" class="text-left font-semibold text-primary hover:underline" aria-haspopup="dialog" @click="openDetail(record as Api.Order)">{{ record.orderNo }}</button>
            </template>
            <Tag v-else-if="column.key === 'status'" :color="ORDER_STATUS[record.status as Api.Order['status']]?.color" class="m-0">{{ record.statusLabel }}</Tag>
            <template v-else-if="column.key === 'currentStage'">{{ currentStage(record as Api.Order) }}</template>
            <template v-else-if="column.key === 'product'">
              <span :title="record.items.map((item: Api.Item) => `${item.productName} ${num(item.quantity)}${item.unit || ''}`).join('；')">
                {{ record.items[0]?.productName || '—' }}<template v-if="record.items.length > 1"> 等 {{ record.items.length }} 个产品</template>
              </span>
            </template>
            <template v-else-if="column.key === 'owner'">
              <span :class="record.ownerName ? '' : 'text-warning'">{{ record.ownerName || '未分配' }}</span>
              <Button v-if="canAssign" type="link" size="small" aria-haspopup="dialog" @click="assignOwner(record as Api.Order)">{{ record.ownerUserId ? '更换' : '分配' }}</Button>
            </template>
            <template v-else-if="column.key === 'due'">
              <div class="tabular-nums" :title="record.promisedDate ? '工厂交期' : '需求交期'">{{ dateText(record.promisedDate) || dateText(record.requiredDate) || '待确认' }}</div>
              <span v-if="dueHint(record as Api.Order)" class="text-xs text-destructive">{{ dueHint(record as Api.Order) }}</span>
            </template>
            <template v-else-if="column.key === 'customer'">{{ record.customerName || record.purpose || (record.sourceType === 'RESTOCK' ? '系统补库' : '内部生产需求') }}</template>
            <template v-else-if="String(column.key).startsWith('stage:')">
              <Tooltip v-if="text" :title="text.detail" placement="top">
                <button type="button" class="stage-cell" :class="`stage-cell--${text.state}`" aria-haspopup="dialog" :aria-label="`${text.label}：${text.text}，查看详情`" @click="openStage(record as Api.Order, text)">{{ text.text }}</button>
              </Tooltip>
              <span v-else class="text-muted-foreground">—</span>
            </template>
            <template v-else>{{ text || '—' }}</template>
          </template>
        </Table>
        <p class="mb-0 mt-3 text-xs leading-5 text-muted-foreground">按实际工艺和关联任务展示；“未关联”表示暂无该环节的关联数据。“已达标”依据任务目标与实际报工判断；“已报工”仅表示工序有报工记录。出库仅统计明确关联本单的有效出库记录。</p>
      </section>
    </div>

    <FactoryDialog v-model:open="detailOpen" :title="`订单详情 ${detail?.orderNo || ''}`">
      <Spin :spinning="detailLoading">
        <div v-if="detail" class="flex flex-col gap-4">
          <Alert v-if="detailError" type="warning" show-icon message="详情刷新失败，当前显示列表快照。">
            <template #action><Button size="small" @click="openDetail(detail)">重新加载</Button></template>
          </Alert>

          <Descriptions bordered size="small" :column="{ xs: 1, sm: 2, lg: 3 }">
            <Descriptions.Item label="订单状态">
              <Tag :color="ORDER_STATUS[detail.status]?.color" class="m-0">{{ detail.statusLabel }}</Tag>
            </Descriptions.Item>
            <Descriptions.Item label="当前进度">{{ currentStage(detail) }}</Descriptions.Item>
            <Descriptions.Item label="订单负责人">
              {{ detail.ownerName || '未分配' }}
              <Button v-if="canAssign" type="link" size="small" aria-haspopup="dialog" @click="assignOwner(detail)">{{ detail.ownerUserId ? '更换负责人' : '分配负责人' }}</Button>
            </Descriptions.Item>
            <Descriptions.Item v-for="[label, value] in detailFields" :key="label" :label="label">
              <span class="whitespace-pre-wrap [overflow-wrap:anywhere]">{{ value || (label.endsWith('交期') ? '待确认' : '—') }}</span>
              <span v-if="label === (detail.promisedDate ? '工厂交期' : '需求交期') && dueHint(detail)" class="ml-2 text-xs text-destructive">{{ dueHint(detail) }}</span>
            </Descriptions.Item>
          </Descriptions>

          <section class="min-w-0" aria-labelledby="order-board-detail-progress">
            <h3 id="order-board-detail-progress" class="mb-2 text-base font-semibold">产品与工序进度</h3>
            <Table
              bordered
              :columns="productColumns"
              :data-source="productRows"
              :pagination="false"
              :scroll="{ x: productWidth }"
              row-key="id"
              size="small"
            >
              <template #emptyText>暂无产品明细</template>
              <template #bodyCell="{ column, record, text }">
                <span v-if="column.key === 'product'" class="font-medium">{{ record.productName }}</span>
                <template v-else-if="column.key === 'spec'">{{ specText(record as Api.Item) || '—' }}</template>
                <span v-else-if="column.align === 'right'" class="tabular-nums">{{ num(text) }} {{ record.unit }}</span>
                <template v-else-if="String(column.key).startsWith('stage:')">
                  <Tooltip v-if="text" :title="text.detail" placement="top">
                    <button type="button" class="stage-cell" :class="`stage-cell--${text.state}`" aria-haspopup="dialog" :aria-label="`${text.label}：${text.text}，查看详情`" @click="openStage(detail!, text, record.id)">{{ text.text }}</button>
                  </Tooltip>
                  <span v-else class="text-muted-foreground">—</span>
                </template>
                <template v-else>{{ text || '—' }}</template>
              </template>
            </Table>
          </section>
        </div>
      </Spin>
    </FactoryDialog>

    <StageDetailModal
      :order="stageSelection?.order"
      :stage="stageSelection?.stage"
      :item-id="stageSelection?.itemId"
      :loading="stageLoading"
      :failed="stageError"
      @close="closeStage"
      @retry="refreshStage"
    />

    <Modal :open="!!ownerOrder" title="分配订单负责人" :z-index="2100" :confirm-loading="ownerSaving" centered ok-text="保存负责人" @ok="saveOwner" @cancel="ownerOrder = undefined">
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

.stage-cell {
  padding: 2px 5px;
  color: hsl(var(--muted-foreground));
  text-align: left;
  cursor: pointer;
  border-radius: 4px;
}

.stage-cell:hover {
  text-decoration: underline;
}

.stage-cell:focus-visible {
  outline: 2px solid hsl(var(--primary));
}

.stage-cell--running,
.legend-dot--running {
  --stage-color: #1677ff;
}

.stage-cell--partial,
.stage-cell--waiting,
.legend-dot--partial {
  --stage-color: #d97706;
}

.stage-cell--done,
.legend-dot--done {
  --stage-color: #16a34a;
}

.stage-cell--reported,
.legend-dot--reported {
  --stage-color: #7c3aed;
}

.stage-cell--running,
.stage-cell--partial,
.stage-cell--waiting,
.stage-cell--done,
.stage-cell--reported {
  color: var(--stage-color);
  background: color-mix(in srgb, var(--stage-color) 10%, hsl(var(--background)));
}

.board-panel :deep(.ant-table-cell) {
  vertical-align: middle;
  overflow-wrap: anywhere;
}

.board-panel :deep(.ant-table-tbody > .order-row--completed > td) {
  background: color-mix(in srgb, hsl(var(--success)) 8%, hsl(var(--background)));
}

.board-panel :deep(.ant-table-tbody > .order-row--completed:hover > td),
.board-panel :deep(.ant-table-tbody > .order-row--completed > .ant-table-cell-row-hover) {
  background: color-mix(in srgb, hsl(var(--success)) 12%, hsl(var(--background)));
}

@media (max-width: 640px) {
  .board-search {
    width: 100%;
  }
}
</style>
