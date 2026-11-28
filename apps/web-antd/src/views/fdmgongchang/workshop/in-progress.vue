<script setup lang="ts">
import type { TableColumnsType, TablePaginationConfig } from 'ant-design-vue';

import type { FdmgongchangStageStockApi as StockApi } from '#/api/fdmgongchang/stage-stock';
import type { FdmgongchangWorkbenchApi as Api } from '#/api/fdmgongchang/workbench';

import { computed, ref, watch } from 'vue';

import { useAccess } from '@vben/access';

import { Alert, Button, message, Table } from 'ant-design-vue';

import { getOrderPage } from '#/api/fdmgongchang/stage-stock';

import ReportCorrectionDialog from '../shared/report-correction-dialog.vue';
import { formatQty, toNumber } from '../stage-stock/model';
import OrderModal from '../stage-stock/modules/order-modal.vue';
import { useJob } from '../workbench/use-job';

type InProgressOrder = Api.Order | StockApi.Order;

const props = defineProps<{
  factoryId: null | number;
  process: string;
  refreshKey: Api.My;
}>();
const emit = defineEmits<{
  refresh: [];
  report: [order: Api.Order];
  supplement: [order: Api.Order];
}>();

const job = useJob();
const { hasAccessByCodes } = useAccess();
const canQuery = computed(() => hasAccessByCodes(['fdmgongchang:stage-stock:query']));
const canReportOthers = computed(() =>
  canQuery.value && hasAccessByCodes(['fdmgongchang:stage-stock:operate']),
);
const ownOrders = computed(() =>
  props.refreshKey.inProgress.filter((order) => order.process === props.process),
);
const ownById = computed(() => new Map(ownOrders.value.map((order) => [order.id, order])));
const reportHistory = ref(false);
const localOrders = computed(() => reportHistory.value
  ? (props.refreshKey.recentDone ?? []).filter((order) => order.process === props.process)
  : ownOrders.value);
const correctionOpen = ref(false);
const correctionOrder = ref<InProgressOrder>();

function openCorrection(order: InProgressOrder) {
  correctionOrder.value = order;
  correctionOpen.value = true;
}

const columns: TableColumnsType<InProgressOrder> = [
  { key: 'order', title: '工序单', width: 185 },
  { key: 'operator', title: '操作人', width: 115 },
  { key: 'input', title: '已领料', width: 150 },
  { key: 'output', title: '累计良品', width: 130 },
  { key: 'actions', title: '操作', width: 160 },
];
const pageSize = 5;
const pageNo = ref(1);
const ownPageNo = ref(1);
const orders = ref<StockApi.Order[]>([]);
const total = ref(0);
const loading = ref(false);
const loadFailed = ref(false);
const retry = ref(0);
const reportOpen = ref(false);
const reportOrderId = ref<number>();
const ownOnly = computed(() => !canQuery.value || loadFailed.value);
const visibleOrders = computed(() => ownOnly.value ? localOrders.value : orders.value);
const pagination = computed<TablePaginationConfig>(() => ({
  current: ownOnly.value
    ? Math.min(ownPageNo.value, Math.max(1, Math.ceil(localOrders.value.length / pageSize)))
    : pageNo.value,
  hideOnSinglePage: true,
  pageSize,
  showSizeChanger: false,
  total: ownOnly.value ? localOrders.value.length : total.value,
}));

const stageUnit = (stage: string) => job.options?.stages.find((item) => item.code === stage)?.unit;

function operatorName(order: InProgressOrder) {
  if ('operatorName' in order && order.operatorName) return order.operatorName;
  return ownById.value.has(order.id) ? props.refreshKey.userName || '我' : '—';
}

function reportOrder(id: number) {
  const own = ownById.value.get(id);
  if (own) {
    emit('report', own);
  } else if (canReportOthers.value && job.options) {
    reportOrderId.value = id;
    reportOpen.value = true;
  }
}

function supplementOrder(id: number) {
  const own = ownById.value.get(id);
  if (own) emit('supplement', own);
}

function onReportSaved(text: string) {
  message.success(text);
  emit('refresh');
}

function changePage(page: TablePaginationConfig) {
  if (ownOnly.value) ownPageNo.value = page.current ?? 1;
  else pageNo.value = page.current ?? 1;
}

function showHistory(history: boolean) {
  if (reportHistory.value === history) return;
  pageNo.value = ownPageNo.value = 1;
  orders.value = [];
  reportHistory.value = history;
}

watch([() => props.factoryId, () => props.process, canQuery], () => {
  pageNo.value = 1;
  ownPageNo.value = 1;
  orders.value = [];
  total.value = 0;
  loadFailed.value = false;
  reportOpen.value = false;
  reportOrderId.value = undefined;
  correctionOpen.value = false;
  correctionOrder.value = undefined;
});

watch(
  [() => props.factoryId, () => props.process, () => props.refreshKey, canQuery, pageNo, retry, reportHistory],
  async (_, __, onCleanup) => {
    loading.value = false;
    if (!canQuery.value || props.factoryId === null) return;

    let active = true;
    onCleanup(() => { active = false; });
    loading.value = true;
    try {
      const result = await getOrderPage({
        pageNo: pageNo.value,
        pageSize,
        process: props.process,
        status: reportHistory.value ? 'COMPLETED' : 'IN_PROGRESS',
      });
      if (!active) return;

      loadFailed.value = false;
      orders.value = result.list;
      total.value = result.total;
      pageNo.value = Math.min(pageNo.value, Math.max(1, Math.ceil(result.total / pageSize)));
    } catch {
      if (!active) return;

      loadFailed.value = true;
      orders.value = [];
      total.value = 0;
    } finally {
      if (active) loading.value = false;
    }
  },
  { immediate: true },
);
</script>

<template>
  <section class="min-w-0 rounded-lg border border-border bg-card p-3 sm:p-4">
    <header class="mb-3 flex flex-wrap items-baseline justify-between gap-2">
      <div class="flex items-center gap-2">
        <Button :type="reportHistory ? 'default' : 'primary'" size="small" @click="showHistory(false)">本工序在制</Button>
        <Button :type="reportHistory ? 'primary' : 'default'" size="small" @click="showHistory(true)">报工记录</Button>
      </div>
      <span v-if="!loading" class="text-xs text-muted-foreground">
        <template v-if="ownOnly">{{ reportHistory ? '我最近完工' : '我的在制' }} · </template>{{ pagination.total }} 单
      </span>
    </header>

    <Alert v-if="loadFailed" class="mb-3" message="车间工序单加载失败，正在显示我的记录" show-icon type="warning">
      <template #action><Button size="small" :loading="loading" @click="retry++">重试</Button></template>
    </Alert>
    <Table
      :columns="columns"
      :data-source="visibleOrders"
      :loading="loading"
      :locale="{ emptyText: reportHistory ? '暂无已完工的报工记录' : ownOnly ? '我在本工序暂无在制单' : '本工序暂无在制单' }"
      :pagination="pagination"
      :scroll="{ x: 740 }"
      row-key="id"
      size="small"
      @change="changePage"
    >
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'order'">
          <div class="font-medium">{{ record.orderNo }}</div>
          <div class="text-xs text-muted-foreground">
            {{ record.contractCode || (record.scheduleTaskId ? `任务 #${record.scheduleTaskId}` : '独立生产') }}
          </div>
        </template>
        <template v-else-if="column.key === 'operator'">{{ operatorName(record as InProgressOrder) }}</template>
        <template v-else-if="column.key === 'input'">
          <span class="tabular-nums">{{ formatQty(record.inputQuantity) }} {{ stageUnit(record.sourceStage) }}</span>
          <div v-if="(toNumber(record.returnedQuantity) ?? 0) > 0" class="text-xs text-muted-foreground">
            已退 {{ formatQty(record.returnedQuantity) }} {{ stageUnit(record.sourceStage) }}
          </div>
        </template>
        <template v-else-if="column.key === 'output'">
          <span class="tabular-nums">{{ formatQty(record.goodQuantity) }} {{ stageUnit(record.outputStage) }}</span>
        </template>
        <template v-else-if="column.key === 'actions'">
          <div class="flex flex-wrap gap-2">
            <template v-if="!reportHistory && (ownById.has(record.id) || canReportOthers)">
              <Button :disabled="loading" size="small" type="primary" @click="reportOrder(record.id)">报产出</Button>
              <Button v-if="ownById.has(record.id) && process !== 'MIX'" :disabled="loading" size="small" @click="supplementOrder(record.id)">补领</Button>
            </template>
            <Button v-if="reportHistory || (record.reportCount ?? 0) > 0" :disabled="loading" size="small" @click="openCorrection(record as InProgressOrder)">查看与更正</Button>
          </div>
        </template>
      </template>
    </Table>

    <OrderModal
      v-if="canReportOthers && job.options"
      v-model:open="reportOpen"
      :options="job.options"
      :order-id="reportOrderId"
      mode="report"
      @saved="onReportSaved"
    />
    <ReportCorrectionDialog
      v-model:open="correctionOpen"
      :order-id="correctionOrder?.id"
      :order-no="correctionOrder?.orderNo"
      :unit="correctionOrder ? stageUnit(correctionOrder.outputStage) : undefined"
      @saved="emit('refresh')"
    />
  </section>
</template>
