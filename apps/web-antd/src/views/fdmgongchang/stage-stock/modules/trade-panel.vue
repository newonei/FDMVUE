<script setup lang="ts">
import type { TablePaginationConfig } from 'ant-design-vue';

import type { MakeTaskState } from '../model';

import type { FdmgongchangRouteApi as RouteApi } from '#/api/fdmgongchang/factory';
import type { FdmgongchangStageStockApi as Api } from '#/api/fdmgongchang/stage-stock';

import { computed, onBeforeUnmount, ref, watch } from 'vue';

import { useAccess } from '@vben/access';
import { formatDateTime } from '@vben/utils';

import { Input, message, Segmented, Table, Tag } from 'ant-design-vue';

import {
  getMakeTasks,
  getShipmentPage,
  getStageRouteOptions,
} from '#/api/fdmgongchang/stage-stock';

import {
  formatDate,
  formatQty,
  MAKE_TASK_STATE_LABELS,
  makeTaskRemaining,
  makeTaskState,
} from '../model';
import TaskRouteModal from './task-route-modal.vue';

/**
 * 外贸订单：外贸合同分派给工厂的自制任务（待生产订单）、早期的工厂出货记录。
 * 工厂可为每个自制任务设定工艺：最后一道（没设时为包装）报产出后良品自动回写合同生产进度。
 * 工厂不再直接出货：做好的货先入本厂仓库，由仓库在库存中心出库。
 */
const props = defineProps<{ refreshKey: number }>();
const emit = defineEmits<{
  pending: [count: number];
  produce: [task: Api.MakeTask];
}>();

const { hasAccessByCodes } = useAccess();
const canOperate = computed(() =>
  hasAccessByCodes(['fdmgongchang:stage-stock:operate']),
);
type View = 'shipments' | 'tasks';
const view = ref<View>('tasks');
const viewOptions = [
  { label: '待生产订单', value: 'tasks' },
  { label: '早期出货记录', value: 'shipments' },
];

const tasks = ref<Api.MakeTask[]>([]);
const routeOptions = ref<RouteApi.Options>();
const routeOpen = ref(false);
const routeTask = ref<Api.MakeTask>();

function processLabel(code: string) {
  return routeOptions.value?.processes.find((p) => p.code === code)?.label ?? code;
}

async function openRoute(task: Api.MakeTask) {
  routeTask.value = task;
  if (!routeOptions.value) {
    try {
      routeOptions.value = await getStageRouteOptions();
    } catch {
      return;
    }
  }
  routeOpen.value = true;
}

async function onRouteSaved(text: string) {
  message.success(text);
  await loadTrade();
}
const loading = ref(false);
const keyword = ref('');

const shipments = ref<Api.Shipment[]>([]);
const shipmentTotal = ref(0);
const shipmentPageNo = ref(1);
const shipmentPageSize = ref(20);
const shipmentLoading = ref(false);

const stateColor: Record<MakeTaskState, string> = {
  done: 'green',
  'not-ready': 'default',
  producing: 'blue',
  waiting: 'orange',
};

function matches(text: Array<null | string | undefined>) {
  const k = keyword.value.trim().toLowerCase();
  return !k || text.some((t) => (t ?? '').toLowerCase().includes(k));
}

const visibleTasks = computed(() =>
  tasks.value.filter((t) =>
    matches([t.contractCode, t.customerName, t.productName, t.productCode]),
  ),
);

async function loadTrade() {
  loading.value = true;
  try {
    const makeTasks = await getMakeTasks();
    tasks.value = makeTasks;
    emit(
      'pending',
      makeTasks.filter((t) => ['producing', 'waiting'].includes(makeTaskState(t)))
        .length,
    );
  } finally {
    loading.value = false;
  }
}

async function loadShipments() {
  shipmentLoading.value = true;
  try {
    const page = await getShipmentPage({
      keyword: keyword.value.trim() || undefined,
      pageNo: shipmentPageNo.value,
      pageSize: shipmentPageSize.value,
    });
    shipments.value = page.list;
    shipmentTotal.value = page.total;
  } finally {
    shipmentLoading.value = false;
  }
}

watch(
  () => props.refreshKey,
  () => {
    loadTrade();
    loadShipments();
  },
  { immediate: true },
);

let timer: ReturnType<typeof setTimeout> | undefined;
watch(keyword, () => {
  if (view.value !== 'shipments') return;
  clearTimeout(timer);
  timer = setTimeout(() => {
    shipmentPageNo.value = 1;
    loadShipments();
  }, 300);
});
onBeforeUnmount(() => clearTimeout(timer));

function onShipmentPage(pagination: TablePaginationConfig) {
  shipmentPageNo.value = pagination.current ?? 1;
  shipmentPageSize.value = pagination.pageSize ?? 20;
  loadShipments();
}

const taskColumns = [
  { key: 'contract', title: '合同 / 客户' },
  { key: 'product', title: '产品' },
  { key: 'requiredDate', title: '交期' },
  { align: 'right' as const, key: 'progress', title: '已完工 / 任务' },
  { align: 'right' as const, key: 'shipped', title: '已出货' },
  { key: 'state', title: '状态' },
  { align: 'right' as const, key: 'actions', title: '', width: 150 },
];
const shipmentColumns = [
  { key: 'no', title: '出货单 / 日期' },
  { key: 'contract', title: '合同 / 客户' },
  { key: 'product', title: '产品' },
  { align: 'right' as const, key: 'quantity', title: '出货数量' },
  { key: 'lines', title: '出库明细' },
  { key: 'operator', title: '操作人' },
];
</script>

<template>
  <div class="flex flex-col gap-3">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <Segmented v-model:value="view" :options="viewOptions" />
      <Input
        id="trade-search"
        v-model:value="keyword"
        allow-clear
        :style="{ width: '15rem' }"
        placeholder="搜合同号、客户或产品"
        size="small"
      />
    </div>
    <p class="m-0 text-xs text-muted-foreground">
      <template v-if="view === 'tasks'">
        外贸合同分派给工厂「自制」的产品。新建工序单时关联对应任务，工艺最后一道（没设工艺时为包装）报产出后良品数量自动回写到合同的生产进度。
      </template>
      <template v-else>
        工厂以前直接出货的记录（同时显示在外贸合同的发货记录里）。现在工厂做好的货先入本厂仓库，由仓库在「库存中心 → 出库单」出库。
      </template>
    </p>

    <Table
      v-if="view === 'tasks'"
      :columns="taskColumns"
      :data-source="visibleTasks"
      :loading="loading"
      :pagination="{ pageSize: 20, showTotal: (t: number) => `共 ${t} 项` }"
      :scroll="{ x: 'max-content' }"
      row-key="assignmentId"
      size="small"
    >
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'contract'">
          <div class="flex flex-col">
            <span class="font-mono text-xs">{{ record.contractCode }}</span>
            <span class="text-xs text-muted-foreground">{{ record.customerName || '—' }}</span>
          </div>
        </template>
        <template v-else-if="column.key === 'product'">
          <div class="flex min-w-[200px] flex-col">
            <span class="text-sm">{{ record.productName || record.productCode }}</span>
            <span class="text-xs text-muted-foreground">
              {{ [record.specification || record.size, record.color, record.packaging].filter(Boolean).join(' · ') }}
            </span>
            <span class="text-xs text-muted-foreground">
              工艺：<template v-if="(record.processes ?? []).length > 0">{{ (record.processes ?? []).map(processLabel).join(' › ') }}</template>
              <template v-else>未设（包装时回写合同进度）</template>
              <button v-if="canOperate" class="ml-2 text-primary hover:underline" type="button" @click="openRoute(record as Api.MakeTask)">
                {{ (record.processes ?? []).length > 0 ? '调整' : '设置工艺' }}
              </button>
            </span>
          </div>
        </template>
        <template v-else-if="column.key === 'requiredDate'">
          <span class="whitespace-nowrap text-xs">{{ formatDate(record.requiredDate) || '—' }}</span>
        </template>
        <template v-else-if="column.key === 'progress'">
          <div class="flex flex-col items-end">
            <span class="whitespace-nowrap tabular-nums">
              {{ formatQty(record.completedQuantity) }} / {{ formatQty(record.assignmentQuantity) }}
              <small class="text-xs text-muted-foreground">{{ record.unit }}</small>
            </span>
            <span class="whitespace-nowrap text-xs text-muted-foreground">
              工序单 {{ record.linkedOrderCount }} 张<template v-if="record.inProgressOrderCount">，在制 {{ record.inProgressOrderCount }}</template>
            </span>
          </div>
        </template>
        <template v-else-if="column.key === 'shipped'">
          <span class="whitespace-nowrap tabular-nums">
            {{ formatQty(record.shippedQuantity) }} / {{ formatQty(record.itemQuantity) }}
          </span>
        </template>
        <template v-else-if="column.key === 'state'">
          <Tag :color="stateColor[makeTaskState(record as Api.MakeTask)]" class="m-0">
            {{ MAKE_TASK_STATE_LABELS[makeTaskState(record as Api.MakeTask)] }}
          </Tag>
        </template>
        <template v-else-if="column.key === 'actions'">
          <span class="inline-flex gap-3 whitespace-nowrap text-xs">
            <button
              v-if="canOperate"
              type="button"
              class="text-primary hover:underline disabled:cursor-not-allowed disabled:text-muted-foreground disabled:no-underline"
              :disabled="!record.ready || makeTaskRemaining(record as Api.MakeTask) <= 0"
              :title="record.ready ? '' : '采购方案生效后才能安排生产'"
              @click="emit('produce', record as Api.MakeTask)"
            >
              安排生产
            </button>
          </span>
        </template>
      </template>
      <template #emptyText>
        <div class="py-6 text-sm text-muted-foreground">
          外贸合同里还没有分派给工厂的自制任务。采购部门在合同里把产品分派为「自制」后，会出现在这里。
        </div>
      </template>
    </Table>

    <Table
      v-else
      :columns="shipmentColumns"
      :data-source="shipments"
      :loading="shipmentLoading"
      :pagination="{ current: shipmentPageNo, pageSize: shipmentPageSize, total: shipmentTotal, showSizeChanger: true, showTotal: (t: number) => `共 ${t} 单` }"
      :scroll="{ x: 'max-content' }"
      row-key="id"
      size="small"
      @change="onShipmentPage"
    >
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'no'">
          <div class="flex flex-col">
            <span class="font-mono text-xs">{{ record.shipmentNo }}</span>
            <span class="whitespace-nowrap text-xs text-muted-foreground">
              {{ formatDate(record.shippedDate) || formatDateTime(record.shippedAt) }}
            </span>
          </div>
        </template>
        <template v-else-if="column.key === 'contract'">
          <div class="flex flex-col">
            <span class="font-mono text-xs">{{ record.contractCode || '—' }}</span>
            <span class="text-xs text-muted-foreground">{{ record.customerName || '—' }}</span>
          </div>
        </template>
        <template v-else-if="column.key === 'product'">
          <span class="text-sm">{{ record.productName || '—' }}</span>
        </template>
        <template v-else-if="column.key === 'quantity'">
          <b class="tabular-nums">{{ formatQty(record.quantity) }}</b>
        </template>
        <template v-else-if="column.key === 'lines'">
          <div class="flex min-w-[220px] flex-col text-xs">
            <span v-for="line in record.lines ?? []" :key="line.stockId">
              <span class="font-mono">{{ line.itemCode }}</span>
              <span class="ml-1 text-muted-foreground">批次 {{ line.batchNo }}</span>
              <b class="ml-1 tabular-nums">{{ formatQty(line.quantity) }}</b>
            </span>
          </div>
        </template>
        <template v-else-if="column.key === 'operator'">
          <span class="whitespace-nowrap text-xs">{{ record.operatorName || '—' }}</span>
        </template>
      </template>
      <template #emptyText>
        <div class="py-6 text-sm text-muted-foreground">还没有出货记录。</div>
      </template>
    </Table>
    <TaskRouteModal v-model:open="routeOpen" :options="routeOptions" :task="routeTask" @saved="onRouteSaved" />
  </div>
</template>
