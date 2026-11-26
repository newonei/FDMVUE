<script lang="ts" setup>
import type { Stage } from './model';

import type { FactoryOrderBoardApi as Api } from '#/api/fdmgongchang/order-board';

import { computed, onActivated, onBeforeUnmount, onDeactivated, onMounted, reactive, ref, watch } from 'vue';

import { useAccess } from '@vben/access';
import { Page } from '@vben/common-ui';

import { Alert, Button, Empty, Input, message, Modal, Result, Select, Spin, Switch, Table, Tag, Tooltip } from 'ant-design-vue';

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
          <p class="mb-0 mt-1 text-sm text-muted-foreground">一张订单一行，跟踪发泡、各道加工、交货入库与出库。</p>
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
          :columns="columns"
          :data-source="rows"
          :loading="loading"
          :row-class-name="(order: Api.Order) => order.status === 'COMPLETED' ? 'order-row--completed' : ''"
          row-key="id"
          size="middle"
          :scroll="{ x: 800 }"
          :pagination="{ current: pageNo, pageSize, total, showSizeChanger: true, pageSizeOptions: ['10', '20', '50'], showTotal: (count: number) => `共 ${count} 张订单` }"
          @change="(page) => { pageNo = page.current ?? 1; pageSize = page.pageSize ?? 10; load(); }"
        >
          <template #emptyText><div class="py-10 text-muted-foreground">{{ filters.keyword || filters.status || filters.ownerUserId ? '没有符合筛选条件的订单' : '当前工厂还没有已接单的订单' }}</div></template>
          <template #bodyCell="{ column, record }">
            <template v-if="column.key === 'order'">
              <div class="flex flex-col gap-2">
                <div class="flex flex-wrap items-center gap-2"><Tag :color="ORDER_STATUS[record.status as Api.Order['status']]?.color" class="m-0">{{ record.statusLabel }}</Tag><span class="text-xs font-medium">{{ currentStage(record as Api.Order) }}</span></div>
                <button type="button" class="text-left font-semibold text-primary hover:underline" aria-haspopup="dialog" @click="openDetail(record as Api.Order)">{{ record.orderNo }}</button>
                <div v-if="record.sourceOrderCode" class="text-xs text-muted-foreground">采购单号：{{ record.sourceOrderCode }}</div>
                <div v-if="record.sourceContractId || record.sourceContractName || record.sourceContractCode" class="break-words text-xs">
                  <span class="text-muted-foreground">合同内部单号：</span><b>{{ record.sourceContractName || '—' }}</b>
                </div>
                <div v-if="record.sourceContractCode" class="break-words text-xs text-muted-foreground">合同编号：{{ record.sourceContractCode }}</div>
                <div class="text-xs">{{ record.customerName || record.purpose || (record.sourceType === 'RESTOCK' ? '系统补库' : '内部生产需求') }}</div>
                <div class="flex items-center gap-2 border-t border-border pt-2 text-xs">
                  <span class="text-muted-foreground">负责人</span>
                  <b :class="record.ownerName ? '' : 'text-orange-600'">{{ record.ownerName || '未分配' }}</b>
                  <Button v-if="canAssign" type="link" size="small" @click="assignOwner(record as Api.Order)">{{ record.ownerUserId ? '更换' : '分配' }}</Button>
                </div>
                <div class="text-xs text-muted-foreground">{{ record.promisedDate ? '工厂交期' : '需求交期' }}：{{ dateText(record.promisedDate) || dateText(record.requiredDate) || '待确认' }} <b v-if="dueHint(record as Api.Order)" class="text-destructive">{{ dueHint(record as Api.Order) }}</b></div>
                <div><Button aria-haspopup="dialog" size="small" @click="openDetail(record as Api.Order)">订单详情</Button></div>
              </div>
            </template>
            <template v-else-if="column.key === 'flow'">
              <div class="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs">
                <span class="max-w-[520px] truncate" :title="record.items.map((item: Api.Item) => `${item.productName} ${num(item.quantity)}${item.unit || ''}`).join('；')">{{ record.items[0]?.productName || '暂无产品明细' }}<b v-if="record.items.length > 1"> 等 {{ record.items.length }} 个产品</b></span>
                <span class="text-muted-foreground">下单人：{{ record.requesterName || '—' }}</span>
              </div>
              <div class="stage-grid">
                <Tooltip v-for="stage in orderStages(record as Api.Order)" :key="stage.code" :title="stage.detail" placement="top">
                  <button type="button" class="stage-tile" :class="`stage-tile--${stage.state}`" aria-haspopup="dialog" :aria-label="`${stage.label}：${stage.text}，查看详情`" @click="openStage(record as Api.Order, stage)">
                    <span class="stage-tile__name">{{ stage.label }}</span>
                    <b>{{ stage.text }}</b>
                  </button>
                </Tooltip>
              </div>
            </template>
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

          <dl class="mb-0 grid gap-3 sm:grid-cols-3">
            <div class="rounded-lg border border-border bg-muted/40 px-4 py-3">
              <dt class="text-sm text-muted-foreground">当前进度</dt>
              <dd class="mb-0 mt-2 flex flex-wrap items-center gap-2 font-medium">
                <Tag :color="ORDER_STATUS[detail.status]?.color" class="m-0">{{ detail.statusLabel }}</Tag>
                <span>{{ currentStage(detail) }}</span>
              </dd>
            </div>
            <div class="rounded-lg border border-border bg-muted/40 px-4 py-3">
              <dt class="text-sm text-muted-foreground">交货日期</dt>
              <dd class="mb-0 mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
                <span class="font-semibold">{{ dateText(detail.promisedDate) || dateText(detail.requiredDate) || '待确认' }}</span>
                <span v-if="detail.promisedDate || detail.requiredDate" class="text-xs text-muted-foreground">{{ detail.promisedDate ? '工厂交期' : '需求交期' }}</span>
                <span v-if="dueHint(detail)" class="text-xs font-medium text-destructive">{{ dueHint(detail) }}</span>
              </dd>
            </div>
            <div class="rounded-lg border border-border bg-muted/40 px-4 py-3">
              <dt class="text-sm text-muted-foreground">订单负责人</dt>
              <dd class="mb-0 mt-1 flex flex-wrap items-center justify-between gap-2">
                <span class="break-words font-semibold">{{ detail.ownerName || '未分配' }}</span>
                <Button v-if="canAssign" aria-haspopup="dialog" @click="assignOwner(detail)">{{ detail.ownerUserId ? '更换负责人' : '分配负责人' }}</Button>
              </dd>
            </div>
          </dl>

          <div class="board-detail-layout">
            <section class="min-w-0" aria-labelledby="order-board-detail-progress">
              <div class="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <h3 id="order-board-detail-progress" class="m-0 text-base font-semibold">产品与工序进度</h3>
                <span v-if="detail.items.length" class="text-sm text-muted-foreground">{{ detail.items.length }} 款产品 · 点击工序查看明细</span>
              </div>
              <Empty v-if="!detail.items.length" description="暂无产品明细" />
              <div v-else class="space-y-3">
                <article v-for="item in detail.items" :key="item.id" class="rounded-lg border border-border p-4">
                  <h4 class="m-0 break-words text-base font-semibold">{{ item.productName }}</h4>
                  <p v-if="item.productCode || specText(item)" class="mb-0 mt-1 break-words text-sm text-muted-foreground">{{ [item.productCode, specText(item)].filter(Boolean).join(' · ') }}</p>

                  <dl class="my-3 grid grid-cols-3 gap-2 rounded-md bg-muted/40 px-3 py-2">
                    <div>
                      <dt class="text-xs text-muted-foreground">订单需求</dt>
                      <dd class="mb-0 break-words font-semibold tabular-nums">{{ num(item.quantity) }} {{ item.unit }}</dd>
                    </div>
                    <div>
                      <dt class="text-xs text-muted-foreground">已交货 / 入库</dt>
                      <dd class="mb-0 break-words font-semibold tabular-nums">{{ num(item.completedQuantity) }} {{ item.unit }}</dd>
                    </div>
                    <div>
                      <dt class="text-xs text-muted-foreground">已出库</dt>
                      <dd class="mb-0 break-words font-semibold tabular-nums">{{ num(item.shippedQuantity) }} {{ item.unit }}</dd>
                    </div>
                  </dl>

                  <div class="stage-grid board-detail-stages">
                    <Tooltip v-for="stage in orderStages({ ...detail, items: [item] })" :key="stage.code" :title="stage.detail">
                      <button type="button" class="stage-tile" :class="`stage-tile--${stage.state}`" aria-haspopup="dialog" :aria-label="`${stage.label}：${stage.text}，查看详情`" @click="openStage(detail, stage, item.id)">
                        <span class="stage-tile__name">{{ stage.label }}</span>
                        <b>{{ stage.text }}</b>
                      </button>
                    </Tooltip>
                  </div>
                  <div v-if="item.steps?.length" class="mt-3 flex flex-col gap-1 text-xs leading-5 text-muted-foreground">
                    <span v-for="step in item.steps" :key="step.process">{{ step.label }}：良品 {{ num(step.goodQuantity) }}{{ step.unit }} · {{ step.orderCount }} 张工序单 · {{ step.inProgressCount }} 张在制<template v-if="step.sharedTaskCount"> · {{ step.sharedTaskCount }} 个合并生产任务</template></span>
                  </div>
                </article>
              </div>
            </section>

            <aside class="min-w-0 self-start rounded-lg border border-border px-4 py-3" aria-labelledby="order-board-detail-source">
              <h3 id="order-board-detail-source" class="m-0 text-base font-semibold">订单资料</h3>
              <dl class="order-board-detail-fields mb-0 mt-3 text-sm">
                <dt>来源采购单</dt>
                <dd>{{ detail.sourceOrderCode || '—' }}</dd>
                <dt>合同内部单号</dt>
                <dd>{{ detail.sourceContractName || '—' }}</dd>
                <dt>合同编号</dt>
                <dd>{{ detail.sourceContractCode || '—' }}</dd>
                <dt>客户 / 用途</dt>
                <dd>{{ detail.customerName || detail.purpose || '—' }}</dd>
                <dt>下单人</dt>
                <dd>{{ detail.requesterName || '—' }} · {{ detail.requesterDeptName || '—' }}</dd>
                <dt>需求交期</dt>
                <dd>{{ dateText(detail.requiredDate) || '待确认' }}</dd>
                <dt>工厂交期</dt>
                <dd>{{ dateText(detail.promisedDate) || '待确认' }}</dd>
                <dt>创建时间</dt>
                <dd>{{ timeText(detail.createTime) || '—' }}</dd>
                <dt>接单经办人</dt>
                <dd>{{ detail.handlerName || '—' }}</dd>
                <template v-if="detail.remark">
                  <dt>订单备注</dt>
                  <dd class="whitespace-pre-wrap">{{ detail.remark }}</dd>
                </template>
                <template v-if="detail.reply">
                  <dt>工厂回复</dt>
                  <dd class="whitespace-pre-wrap">{{ detail.reply }}</dd>
                </template>
              </dl>
            </aside>
          </div>
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
  text-align: left;
  cursor: pointer;
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

.stage-tile:hover {
  border-color: hsl(var(--primary));
  opacity: 1;
}

.stage-tile:focus-visible {
  outline: 2px solid hsl(var(--primary));
  outline-offset: 2px;

}

.board-panel :deep(.ant-table-cell) {
  vertical-align: top;

}

.board-panel :deep(.ant-table-tbody > .order-row--completed > td) {
  background: color-mix(in srgb, hsl(var(--success)) 8%, hsl(var(--background)));
}

.board-panel :deep(.ant-table-tbody > .order-row--completed:hover > td),
.board-panel :deep(.ant-table-tbody > .order-row--completed > .ant-table-cell-row-hover) {
  background: color-mix(in srgb, hsl(var(--success)) 12%, hsl(var(--background)));
}

.board-panel :deep(.ant-table-thead > tr > th) {
  font-weight: 500;
  color: hsl(var(--muted-foreground));

}

.board-detail-layout {
  display: grid;
  gap: 16px;
}

.stage-grid.board-detail-stages {
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 100px), 1fr));
}

.board-detail-stages .stage-tile {
  min-height: 60px;
  font-size: 12px;
}

.board-detail-stages .stage-tile__name {
  font-size: 14px;
}

.order-board-detail-fields {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 10px 12px;
}

.order-board-detail-fields dt {
  color: hsl(var(--muted-foreground));
}

.order-board-detail-fields dd {
  margin: 0;
  overflow-wrap: anywhere;
}

@media (min-width: 1024px) {
  .board-detail-layout {
    grid-template-columns: minmax(0, 1fr) minmax(260px, 27%);
  }
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
