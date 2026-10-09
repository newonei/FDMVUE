<script setup lang="ts">
import type { TableColumnsType, TablePaginationConfig } from 'ant-design-vue';

import type { FdmgongchangStageStockApi as Api } from '#/api/fdmgongchang/stage-stock';

import { computed, onBeforeUnmount, ref, watch } from 'vue';

import { useAccess } from '@vben/access';

import { Button, Checkbox, Input, Table } from 'ant-design-vue';

import { getStockPage } from '#/api/fdmgongchang/stage-stock';

import {
  attrSummary,
  formatQty,
  makeLabels,
  RAW_CATEGORY_LABELS,
} from '../model';
import ReceiveModal from './receive-modal.vue';
import StocktakeModal from './stocktake-modal.vue';

const props = defineProps<{
  options: Api.Options;
  refreshKey: number;
  stage: string;
}>();

const emit = defineEmits<{
  changed: [];
  create: [stage: string];
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
const receiveOpen = ref(false);
const stocktakeOpen = ref(false);
const stocktakeRow = ref<Api.Stock>();

const labels = computed(() => makeLabels(props.options));
const stageOption = computed(() =>
  props.options.stages.find((s) => s.code === props.stage),
);
const incoming = computed(() =>
  props.options.processes.find((p) => p.outputStage === props.stage),
);
const outgoing = computed(() =>
  props.options.processes.filter((p) => p.sources.includes(props.stage)),
);

const columns = computed<TableColumnsType<Api.Stock>>(() => [
  { key: 'item', title: props.stage === 'RAW' ? '原材料' : '编码 / 规格' },
  { dataIndex: 'batchNo', key: 'batchNo', title: '批次' },
  { dataIndex: 'location', key: 'location', title: '库位' },
  { align: 'right' as const, key: 'quantity', title: '库存' },
  { align: 'right' as const, key: 'actions', title: '', width: 96 },
]);

/** 第二行的规格摘要；原材料显示分类。 */
function specText(row: Api.Stock) {
  const item = row.item ?? {};
  if (props.stage === 'RAW') {
    return RAW_CATEGORY_LABELS[item.rawCategory ?? ''] ?? item.rawCategory ?? '';
  }
  return attrSummary(props.stage, item, labels.value);
}

async function load() {
  loading.value = true;
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
</script>

<template>
  <div class="flex flex-col gap-3">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h2 class="m-0 text-base font-semibold">
          {{ stageOption?.label }}库存
        </h2>
        <span class="text-xs text-muted-foreground">
          来源
          <b class="font-medium text-foreground">{{
            incoming
              ? `${incoming.label}${stage === 'PACKED' ? '、外采到货' : ''}`
              : '采购到货'
          }}</b>
          <span class="mx-1">·</span>
          去向
          <b class="font-medium text-foreground">{{
            outgoing.map((p) => p.label).join('、') || '外贸出货'
          }}</b>
        </span>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <Input
          id="stock-search"
          v-model:value="keyword"
          allow-clear
          class="w-56"
          placeholder="搜编码或批次"
        />
        <Checkbox id="stock-show-zero" v-model:checked="showZero">
          显示零库存
        </Checkbox>
        <Button v-if="canReceive" size="small" @click="receiveOpen = true">
          {{ stage === 'RAW' ? '原料入库' : '期初入库' }}
        </Button>
        <Button
          v-if="canOperate && outgoing.length > 0"
          size="small"
          type="primary"
          @click="emit('create', stage)"
        >
          从这里领料
        </Button>
        <Button
          v-if="canShip && stage === 'PACKED'"
          size="small"
          type="primary"
          @click="emit('ship')"
        >
          外贸出货
        </Button>
      </div>
    </div>
    <Table
      :columns="columns"
      :data-source="rows"
      :loading="loading"
      :pagination="{
        current: pageNo,
        pageSize,
        total,
        showSizeChanger: true,
        showTotal: (t: number) => `共 ${t} 行`,
      }"
      :scroll="{ x: 'max-content' }"
      row-key="id"
      size="small"
      @change="onTableChange"
    >
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'item'">
          <div class="flex min-w-[200px] flex-col">
            <span v-if="stage === 'RAW'" class="text-sm">
              {{ record.item?.rawMaterialName ?? record.itemCode }}
              <span class="ml-1 font-mono text-xs text-muted-foreground">
                {{ record.itemCode }}
              </span>
            </span>
            <span v-else class="font-mono text-xs">{{ record.itemCode }}</span>
            <span class="text-xs text-muted-foreground">
              {{ specText(record as Api.Stock) }}
            </span>
          </div>
        </template>
        <template v-else-if="column.key === 'batchNo'">
          <span class="font-mono text-xs">{{ record.batchNo }}</span>
        </template>
        <template v-else-if="column.key === 'location'">
          <span class="whitespace-nowrap text-xs">{{ record.location }}</span>
        </template>
        <template v-else-if="column.key === 'quantity'">
          <span
            class="whitespace-nowrap font-semibold tabular-nums"
            :class="Number(record.quantity) === 0 ? 'text-muted-foreground' : ''"
          >
            {{ formatQty(record.quantity) }}
            <small class="text-xs font-normal text-muted-foreground">
              {{ stageOption?.unit }}
            </small>
          </span>
        </template>
        <template v-else-if="column.key === 'actions'">
          <span class="inline-flex gap-3 whitespace-nowrap text-xs">
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
        <div class="py-6 text-sm text-muted-foreground">
          {{ stageOption?.label }}暂无库存。<template v-if="incoming">
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
    <StocktakeModal
      v-model:open="stocktakeOpen"
      :stock="stocktakeRow"
      :unit="stageOption?.unit"
      @saved="onSaved"
    />
  </div>
</template>
