<script setup lang="ts">
import type { TableColumnsType, TablePaginationConfig } from 'ant-design-vue';

import type { FdmgongchangStageStockApi as Api } from '#/api/fdmgongchang/stage-stock';

import { computed, onBeforeUnmount, ref, watch } from 'vue';

import { useAccess } from '@vben/access';
import { IconifyIcon } from '@vben/icons';

import { Button, Checkbox, Input, Table, Tooltip } from 'ant-design-vue';

import { getStockPage } from '#/api/fdmgongchang/stage-stock';

import {
  extraProcessesAt,
  formatQty,
  makeLabels,
  stageFlow,
  stockSpec,
  stockTitle,
  toNumber,
} from '../model';
import ExtraOrderModal from './extra-order-modal.vue';
import ReceiveModal from './receive-modal.vue';
import StocktakeModal from './stocktake-modal.vue';

/** 当前阶段的库存明细：标题与流转关系、当前库存合计、搜索与操作、库存表格。 */
const props = defineProps<{
  options: Api.Options;
  refreshKey: number;
  stage: string;
  summary?: Api.Summary;
}>();

const emit = defineEmits<{
  changed: [];
  create: [stage: string];
  saved: [text: string];
  ship: [];
  txn: [itemCode: string];
}>();

const { hasAccessByCodes } = useAccess();
const canOperate = computed(() =>
  hasAccessByCodes(['fdmgongchang:stage-stock:operate']),
);
const canReceive = computed(() =>
  hasAccessByCodes(['fdmgongchang:stage-stock:receive']),
);
const canStocktake = computed(() =>
  hasAccessByCodes(['fdmgongchang:stage-stock:stocktake']),
);
const canShip = computed(() =>
  hasAccessByCodes(['fdmgongchang:stage-stock:ship']),
);

const keyword = ref('');
const showZero = ref(false);
const pageNo = ref(1);
const pageSize = ref(20);
const rows = ref<Api.Stock[]>([]);
const total = ref(0);
const loading = ref(false);
const loadFailed = ref(false);
const receiveOpen = ref(false);
const stocktakeOpen = ref(false);
const stocktakeRow = ref<Api.Stock>();

const labels = computed(() => makeLabels(props.options));
const stageOption = computed(() =>
  props.options.stages.find((s) => s.code === props.stage),
);
const stageLabel = computed(() => stageOption.value?.label ?? props.stage);
const incoming = computed(() =>
  props.options.processes.find((p) => p.outputStage === props.stage),
);
const outgoing = computed(() =>
  props.options.processes.filter((p) => p.sources.includes(props.stage)),
);
const flow = computed(() => stageFlow(props.stage, props.options));
/** 挂在这个阶段的附加工序（不改变规格，在这个阶段原地加工）。 */
const extras = computed(() => extraProcessesAt(props.options, props.stage));
const extraOpen = ref(false);

/** 本阶段库存合计（单一单位）；概览还没加载时不显示数字。 */
const stageTotal = computed(() => {
  if (!props.summary) return undefined;
  const row = props.summary.stages.find((s) => s.stage === props.stage);
  return toNumber(row?.quantity) ?? 0;
});

/** 产出到本阶段的工序正在加工的数量，单位是它领料来源的单位。 */
const incomingWip = computed(() => {
  if (!incoming.value) return undefined;
  const wip = props.summary?.processes.find(
    (p) => p.process === incoming.value?.code,
  );
  if ((toNumber(wip?.inProgressQuantity) ?? 0) <= 0) return undefined;
  const unit = props.options.stages.find(
    (s) => s.code === incoming.value?.sources[0],
  )?.unit;
  return `${incoming.value.label}在制 ${formatQty(wip?.inProgressQuantity)} ${unit ?? ''}`.trim();
});

/** 窄屏横向滚动时，库存和操作固定在右侧。 */
const columns = computed<TableColumnsType<Api.Stock>>(() => [
  {
    key: 'item',
    title: props.stage === 'RAW' ? '原材料与分类' : '物料与规格',
  },
  { dataIndex: 'batchNo', key: 'batchNo', title: '批次', width: 168 },
  { dataIndex: 'location', key: 'location', title: '库位', width: 140 },
  {
    align: 'right' as const,
    fixed: 'right' as const,
    key: 'quantity',
    title: '库存',
    width: 132,
  },
  { fixed: 'right' as const, key: 'actions', title: '操作', width: 112 },
]);

function rowTitle(row: Api.Stock) {
  return stockTitle(
    props.stage,
    stageLabel.value,
    row.item,
    labels.value,
    row.itemCode,
  );
}

/** 第二行：编码 ｜ 规格。 */
function rowDetail(row: Api.Stock) {
  const spec = stockSpec(props.stage, row.item, labels.value);
  return { code: row.itemCode, spec };
}

async function load() {
  loading.value = true;
  loadFailed.value = false;
  try {
    const page = await getStockPage({
      keyword: keyword.value.trim() || undefined,
      pageNo: pageNo.value,
      pageSize: pageSize.value,
      showZero: showZero.value,
      stage: props.stage,
    });
    rows.value = page.list;
    total.value = page.total;
  } catch {
    rows.value = [];
    total.value = 0;
    loadFailed.value = true;
  } finally {
    loading.value = false;
  }
}

let searchTimer: ReturnType<typeof setTimeout> | undefined;
watch(keyword, () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    pageNo.value = 1;
    load();
  }, 300);
});
onBeforeUnmount(() => clearTimeout(searchTimer));

watch(
  () => [props.stage, props.refreshKey, showZero.value] as const,
  ([stage], previous) => {
    if (previous && stage !== previous[0]) keyword.value = '';
    pageNo.value = 1;
    load();
  },
  { immediate: true },
);

function onTableChange(pagination: TablePaginationConfig) {
  pageNo.value = pagination.current ?? 1;
  pageSize.value = pagination.pageSize ?? 20;
  load();
}

function openStocktake(row: Api.Stock) {
  stocktakeRow.value = row;
  stocktakeOpen.value = true;
}

function onSaved() {
  load();
  emit('changed');
}

function onExtraSaved(text: string) {
  emit('saved', text);
  onSaved();
}
</script>

<template>
  <div class="stock-panel flex min-w-0 flex-col gap-4">
    <div class="flex flex-wrap items-center gap-x-5 gap-y-1">
      <h2 class="m-0 text-xl font-semibold tracking-tight">
        {{ stageLabel }}库存
      </h2>
      <p
        class="m-0 flex flex-wrap items-center gap-x-2 text-[13px] text-muted-foreground"
        title="每道工序只能向上游库存领料；跳过工序时可以领更早阶段的库存，例如冲裁直接领片材。"
      >
        <span>{{ flow.from }}</span>
        <span class="text-primary" aria-hidden="true">→</span>
        <span>{{ flow.current }}</span>
        <span class="text-primary" aria-hidden="true">→</span>
        <span>{{ flow.to }}</span>
        <template v-if="extras.length > 0">
          <span class="mx-1">·</span>
          <span>附加工序：{{ extras.map((p) => p.label).join('、') }}</span>
        </template>
      </p>
      <span
        v-if="incomingWip"
        class="rounded-full bg-warning/15 px-2 text-xs leading-5 text-warning"
      >
        {{ incomingWip }}
      </span>
    </div>

    <div class="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
      <div>
        <div class="text-[13px] text-muted-foreground">当前库存</div>
        <div class="stock-panel__total">
          <template v-if="stageTotal === undefined">—</template>
          <template v-else>{{ formatQty(stageTotal) }}</template>
          <small>{{ stageOption?.unit }}</small>
        </div>
      </div>
      <div class="flex flex-wrap items-center gap-x-3 gap-y-2">
        <Input
          id="stock-search"
          v-model:value="keyword"
          allow-clear
          :style="{ width: '15rem', maxWidth: '100%' }"
          placeholder="搜索编码或批次"
        >
          <template #prefix>
            <IconifyIcon class="text-muted-foreground" icon="lucide:search" />
          </template>
        </Input>
        <Checkbox id="stock-show-zero" v-model:checked="showZero">
          显示零库存
        </Checkbox>
        <Button v-if="canReceive" @click="receiveOpen = true">
          {{ stage === 'RAW' ? '原料入库' : '期初入库' }}
        </Button>
        <Button v-if="canOperate && extras.length > 0" @click="extraOpen = true">
          附加工序
        </Button>
        <Button
          v-if="canOperate && outgoing.length > 0"
          type="primary"
          @click="emit('create', stage)"
        >
          从这里领料
        </Button>
        <Button
          v-if="canShip && stage === 'PACKED'"
          type="primary"
          @click="emit('ship')"
        >
          外贸出货
        </Button>
      </div>
    </div>

    <Table
      class="stock-panel__table"
      :columns="columns"
      :data-source="rows"
      :loading="loading"
      :pagination="{
        current: pageNo,
        pageSize,
        total,
        showSizeChanger: true,
        showTotal: (t: number) => `共 ${t} 条`,
      }"
      :scroll="{ x: 720 }"
      row-key="id"
      @change="onTableChange"
    >
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'item'">
          <div class="flex min-w-[220px] max-w-[460px] flex-col gap-0.5">
            <span class="truncate text-[15px] font-semibold">
              {{ rowTitle(record as Api.Stock) }}
            </span>
            <Tooltip placement="topLeft">
              <template #title>
                <div class="break-all font-mono">{{ record.itemCode }}</div>
                <div v-if="rowDetail(record as Api.Stock).spec">
                  {{ rowDetail(record as Api.Stock).spec }}
                </div>
              </template>
              <span class="truncate text-xs text-muted-foreground">
                <span class="font-mono">{{ record.itemCode }}</span>
                <template v-if="rowDetail(record as Api.Stock).spec">
                  <span class="mx-1.5 text-border">|</span>
                  {{ rowDetail(record as Api.Stock).spec }}
                </template>
              </span>
            </Tooltip>
          </div>
        </template>
        <template v-else-if="column.key === 'batchNo'">
          <span class="whitespace-nowrap tabular-nums">{{ record.batchNo }}</span>
        </template>
        <template v-else-if="column.key === 'location'">
          <span class="whitespace-nowrap">{{ record.location }}</span>
        </template>
        <template v-else-if="column.key === 'quantity'">
          <span
            class="whitespace-nowrap text-base font-semibold tabular-nums"
            :class="Number(record.quantity) === 0 ? 'text-muted-foreground' : ''"
          >
            {{ formatQty(record.quantity) }}
            <small class="ml-0.5 text-xs font-normal text-muted-foreground">
              {{ stageOption?.unit }}
            </small>
          </span>
        </template>
        <template v-else-if="column.key === 'actions'">
          <span class="inline-flex gap-4 whitespace-nowrap">
            <button
              type="button"
              class="text-primary hover:underline"
              @click="emit('txn', record.itemCode)"
            >
              流水
            </button>
            <button
              v-if="canStocktake"
              type="button"
              class="text-primary hover:underline"
              @click="openStocktake(record as Api.Stock)"
            >
              盘点
            </button>
          </span>
        </template>
      </template>
      <template #emptyText>
        <div v-if="loadFailed" class="py-8 text-sm text-muted-foreground">
          库存没有加载出来，可能是网络问题。
          <Button size="small" type="link" @click="load">重试</Button>
        </div>
        <div v-else-if="keyword.trim()" class="py-8 text-sm text-muted-foreground">
          没有找到编码或批次包含「{{ keyword.trim() }}」的{{ stageLabel }}库存。
        </div>
        <div v-else class="py-8 text-sm text-muted-foreground">
          {{ stageLabel }}暂无库存。<template v-if="incoming">
            在「{{ incoming.label }}」工序单报完工后会入库到这里。
          </template>
          <template v-else>
            原材料采购单在「到货入库」收货后会入库到这里。
          </template>
        </div>
      </template>
    </Table>
    <ReceiveModal
      v-model:open="receiveOpen"
      :options="options"
      :stage="stage"
      @saved="onSaved"
    />
    <ExtraOrderModal
      v-model:open="extraOpen"
      :options="options"
      :stage="stage"
      @saved="onExtraSaved"
    />
    <StocktakeModal
      v-model:open="stocktakeOpen"
      :stock="stocktakeRow"
      :unit="stageOption?.unit"
      @saved="onSaved"
    />
  </div>
</template>

<style scoped>
.stock-panel__total {
  font-size: 44px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  line-height: 1.1;
  color: hsl(var(--primary));
  letter-spacing: -0.01em;
}

.stock-panel__total small {
  margin-left: 6px;
  font-size: 16px;
  font-weight: 500;
  color: hsl(var(--foreground) / 75%);
  letter-spacing: 0;
}

.stock-panel__table :deep(.ant-table-thead > tr > th) {
  font-weight: 500;
  color: hsl(var(--muted-foreground));
  background: hsl(var(--muted) / 60%);
  border-bottom: 1px solid hsl(var(--border));
}

.stock-panel__table :deep(.ant-table-thead > tr > th::before) {
  display: none;
}

.stock-panel__table :deep(.ant-table-tbody > tr > td) {
  height: 68px;
  padding-top: 12px;
  padding-bottom: 12px;
  border-bottom: 1px solid hsl(var(--border) / 70%);
}

.stock-panel__table :deep(.ant-table-tbody > tr.ant-table-row:hover > td) {
  background: hsl(var(--primary) / 5%);
}

/* 分页：总条数靠左，页码与每页数量靠右 */
.stock-panel__table :deep(.ant-table-pagination.ant-pagination) {
  width: 100%;
  margin: 16px 0 0;
}

.stock-panel__table :deep(.ant-pagination-total-text) {
  margin-right: auto;
  color: hsl(var(--muted-foreground));
}
</style>
