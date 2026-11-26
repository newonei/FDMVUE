<script setup lang="ts">
import type { TableColumnsType } from 'ant-design-vue';

import type { FdmgongchangProductionOrderApi as OrderApi } from '#/api/fdmgongchang/production-order';
import type { FdmgongchangOrderSplitApi as SplitApi } from '#/api/fdmgongchang/schedule';

import { computed, onBeforeUnmount, ref, watch } from 'vue';

import { useAccess } from '@vben/access';

import { Alert, Button, Input, Modal, Select, Table, Tag } from 'ant-design-vue';

import { getOpenProductionOrders, getProductionOrder } from '#/api/fdmgongchang/production-order';
import { getOrderSplitAdviceResult, previewOrderSplit, releaseOrderSplit, requestOrderSplitAdvice } from '#/api/fdmgongchang/schedule';

import { colorModeText, parameterText, thicknessText } from '../../production-order/manufacturing';
import ItemProductionConfigModal from '../../production-order/modules/item-production-config-modal.vue';
import MaterialPlan from '../../production-order/modules/material-plan.vue';
import OrderItemsTable from '../../production-order/modules/order-items-table.vue';
import { dateText, num, specText } from '../../production-order/shared';
import { businessError } from '../../shared/business-error';
import { dimensionTextInMm } from '../../shared/dimensions';
import { materialText, PROCESS_LABELS } from '../../shared/schedule';
import { finishedSpecText, orderQuantityText } from './order-split-display';
import OrderSplitSpecsTable from './order-split-specs-table.vue';
import OrderSplitStockPanel from './order-split-stock-panel.vue';

const props = defineProps<{
  deliveredStock?: { itemId: number; revision: number; stockId: number };
  orders?: OrderApi.Order[];
}>();
const emit = defineEmits<{
  changed: [order: OrderApi.Order];
  manualDelivery: [stock: { itemId: number; orderId: number; quantity: number; stockId: number }];
  released: [scheduleId: number];
}>();
const open = defineModel<boolean>('open', { required: true });
const { hasAccessByCodes } = useAccess();
const canEdit = computed(() => hasAccessByCodes(['fdmgongchang:production-order:handle']));

const MAX = 50;
const ADVICE_POLL_DELAY = 1500;
const ADVICE_TIMEOUT = 40_000;
const loadedOrders = ref<OrderApi.Order[]>([]);
const selectedIds = ref<number[]>([]);
const loading = ref(false);
const previewing = ref(false);
const submitting = ref(false);
const loadError = ref(false);
const keyword = ref('');
const note = ref('');
const page = ref(1);
const previewPage = ref(1);
const status = ref<string>();
const selectedItemId = ref<number>();
const preview = ref<SplitApi.Preview>();
const previewIds = ref<number[]>([]);
const stockPicks = ref<Array<{ candidate: SplitApi.StockCandidate; quantity: null | number }>>([]);
const previewStockSelections = ref<SplitApi.StockSelection[]>([]);
const needsRepreview = ref(false);
const previewError = ref(false);
const advice = ref<SplitApi.StockAdvice>();
const adviceLoading = ref(false);
const adviceFeedback = ref('');
const refreshedAfterDelivery = ref(false);
const requestId = ref('');
const submittedRequest = ref<SplitApi.ReleaseRequest>();
const configOpen = ref(false);
const configOrderId = ref<number>();
const configItemId = ref<number>();
const materialPlan = ref<InstanceType<typeof MaterialPlan>>();
const materialOrderId = ref<number>();
const materialSaving = ref(false);
const refreshError = ref(false);
let version = 0;
let stockPicksVersion = 0;
let adviceRequest: AbortController | undefined;
let advicePollTimer: ReturnType<typeof setTimeout> | undefined;
let adviceDeadline: ReturnType<typeof setTimeout> | undefined;

const orderColumns: TableColumnsType<OrderApi.Order> = [
  { key: 'order', title: '订单 / 客户', width: 205 },
  { key: 'products', title: '产品明细 / 订单数量', width: 370 },
  { key: 'route', title: '实际工艺路线', width: 300 },
  { key: 'date', title: '交期', width: 130 },
];
const taskColumns: TableColumnsType<SplitApi.Row> = [
  { key: 'order', title: '订单产品 / 需求数量', width: 260, fixed: 'left' },
  { key: 'process', title: '工序 / 车间', width: 145 },
  { key: 'quantity', title: '工序计划数量', width: 120 },
  { key: 'layer', title: '生产层别', width: 120 },
  { key: 'output', title: '实际产出：颜色 / 厚度', width: 245 },
  { key: 'spec', title: '工序生产规格', width: 220 },
  { key: 'inputs', title: '预计领料 / 上游工序', width: 240 },
  { key: 'status', title: '配置检查 / 提醒', width: 230 },
];
const statusLabels = { BLOCKED: '待补配置 / 暂不能下发', DONE: '已完成，无需下发', READY: '配置通过' };
const statusOptions = Object.entries(statusLabels).map(([value, label]) => ({ value, label }));
function validStockPick({ candidate, quantity }: (typeof stockPicks.value)[number]) {
  const current = preview.value?.stockCandidates?.find((stock) => stock.itemId === candidate.itemId && stock.stockId === candidate.stockId);
  return Number.isFinite(quantity) && (quantity ?? 0) > 0 && (quantity ?? 0) <= num((current ?? candidate).available)
    && (!preview.value || (!!current && current.deliverable === candidate.deliverable));
}
const invalidStockPicks = computed(() => stockPicks.value.some((pick) => !validStockPick(pick)));
const hasFinishedGoodsPick = computed(() => stockPicks.value.some(({ candidate }) => candidate.deliverable));
const configBusy = computed(() => configOpen.value || materialSaving.value);
const canPreview = computed(() => selectedIds.value.length > 0 && selectedIds.value.length <= MAX && !loading.value
  && !configBusy.value);
const canRelease = computed(() => !configBusy.value && !previewing.value && !needsRepreview.value && !invalidStockPicks.value
  && !hasFinishedGoodsPick.value && !!preview.value?.canRelease && preview.value.taskCount > 0
  && preview.value.errors.length === 0 && !preview.value.rows.some((row) => row.status === 'BLOCKED'));
const canRequestAdvice = computed(() => !!preview.value && !needsRepreview.value && !invalidStockPicks.value
  && !previewing.value && !submitting.value && !configBusy.value && !adviceLoading.value);
const productSpecs = computed(() => [...new Map((preview.value?.rows ?? [])
  .map((row) => [row.itemId, row])).values()]);
const productOptions = computed(() => productSpecs.value.map((row) => ({
  label: [row.productName, row.productCode, `${row.orderNo} #${row.itemId}`].filter(Boolean).join(' · '),
  value: row.itemId,
})));
const previewOrders = computed(() => loadedOrders.value.filter((order) => previewIds.value.includes(order.id)));
const materialOrders = computed(() => {
  const ids = new Set(selectedIds.value);
  return loadedOrders.value.filter((order) => ids.has(order.id)).map((order) => ({
    label: order.orderNo,
    value: order.id,
    itemIds: order.items.filter((item) => item.processes?.includes('MIX')
      && num(item.quantity) > num(item.completedQuantity)).map((item) => item.id),
  })).filter((order) => order.itemIds.length > 0);
});
const materialOrder = computed(() => materialOrders.value.find((order) => order.value === materialOrderId.value)
  ?? materialOrders.value[0]);

function stopAdviceRequest() {
  adviceRequest?.abort();
  adviceRequest = undefined;
  clearTimeout(advicePollTimer);
  clearTimeout(adviceDeadline);
  adviceLoading.value = false;
}

function invalidateAdvice() {
  stopAdviceRequest();
  advice.value = undefined;
  adviceFeedback.value = '';
}

function finishWithAdviceFallback(controller: AbortController) {
  if (adviceRequest !== controller) return;
  stopAdviceRequest();
  if (advice.value?.items.length) {
    advice.value = { ...advice.value, source: 'RULE', status: 'READY' };
    adviceFeedback.value = 'AI 暂未返回，已保留系统核算建议。';
  } else {
    adviceFeedback.value = '暂时无法获取用库建议，可以继续手工核对库存。';
  }
}

function acceptAdvice(result: SplitApi.StockAdvice, controller: AbortController, previousRequestId?: string) {
  if (adviceRequest !== controller) return;
  if (result.status === 'STALE') {
    invalidateAdvice();
    adviceFeedback.value = result.notice || '建议依据已变化，请重新预览后生成建议。';
    return;
  }
  if (result.status === 'READY') {
    advice.value = result;
    stopAdviceRequest();
    return;
  }
  if (result.items.length > 0 || !advice.value) advice.value = result;
  const id = result.requestId || previousRequestId;
  if (!id) {
    finishWithAdviceFallback(controller);
    return;
  }
  advicePollTimer = setTimeout(async () => {
    try {
      acceptAdvice(await getOrderSplitAdviceResult(id, controller.signal), controller, id);
    } catch {
      finishWithAdviceFallback(controller);
    }
  }, ADVICE_POLL_DELAY);
}

async function generateAdvice() {
  if (!canRequestAdvice.value || !preview.value) return;
  const request = {
    productionOrderIds: [...previewIds.value],
    previewKey: preview.value.previewKey,
    ...(previewStockSelections.value.length > 0 ? { stockSelections: [...previewStockSelections.value] } : {}),
  };
  invalidateAdvice();
  const controller = new AbortController();
  adviceRequest = controller;
  adviceLoading.value = true;
  adviceDeadline = setTimeout(() => finishWithAdviceFallback(controller), ADVICE_TIMEOUT);
  try {
    acceptAdvice(await requestOrderSplitAdvice(request, controller.signal), controller);
  } catch {
    finishWithAdviceFallback(controller);
  }
}

function markPreviewDirty() {
  needsRepreview.value = true;
  requestId.value = '';
  submittedRequest.value = undefined;
}

function invalidatePreview() {
  invalidateAdvice();
  markPreviewDirty();
}

watch(stockPicks, () => {
  ++stockPicksVersion;
  stopAdviceRequest();
  markPreviewDirty();
}, { flush: 'sync' });
watch(selectedIds, invalidateAdvice, { flush: 'sync' });

function openManualDelivery(stock: { itemId: number; orderId: number; quantity: number; stockId: number }) {
  if (submitting.value || previewing.value || configBusy.value || !canEdit.value) return;
  emit('manualDelivery', stock);
}

async function refreshOrder(orderId: number, current: number) {
  const fresh = await getProductionOrder(orderId);
  if (current !== version || !open.value) return;
  loadedOrders.value = loadedOrders.value.map((order) => order.id === fresh.id ? fresh : order);
  emit('changed', fresh);
}

function reloadMaterialPlan(orderId: number) {
  if (materialOrder.value?.value === orderId) void materialPlan.value?.reload();
}

watch(() => props.deliveredStock?.revision, async () => {
  const received = props.deliveredStock;
  if (!open.value || !received) return;
  const order = previewOrders.value.find((row) => row.items.some((item) => item.id === received.itemId));
  if (!order) return;
  stockPicks.value = stockPicks.value.filter(({ candidate }) => candidate.itemId !== received.itemId || candidate.stockId !== received.stockId);
  invalidatePreview();
  refreshedAfterDelivery.value = true;
  const current = ++version;
  previewing.value = true;
  try {
    await refreshOrder(order.id, current).catch(() => undefined);
    if (current !== version || !open.value) return;
    reloadMaterialPlan(order.id);
  } finally {
    if (current === version) {
      previewing.value = false;
      if (open.value) await prepare();
    }
  }
});

function editItem(orderId: number, itemId: number) {
  if (!canEdit.value || submitting.value || previewing.value || configBusy.value) return;
  invalidateAdvice();
  configOrderId.value = orderId;
  configItemId.value = itemId;
  configOpen.value = true;
}

async function onConfigSaved() {
  const orderId = configOrderId.value;
  if (!orderId) return;
  const shouldPreview = !!preview.value;
  const current = ++version;
  // 保存成功即作废旧预览，任何刷新失败都不能继续下发旧参数。
  stockPicks.value = stockPicks.value.filter(({ candidate }) => candidate.itemId !== configItemId.value);
  preview.value = undefined;
  invalidatePreview();
  refreshError.value = false;
  previewing.value = true;
  try {
    await refreshOrder(orderId, current);
    if (current !== version || !open.value) return;
    reloadMaterialPlan(orderId);
  } catch {
    if (current === version) refreshError.value = true;
    return;
  } finally {
    if (current === version) previewing.value = false;
  }
  if (shouldPreview && current === version && open.value) await prepare();
}

async function onMaterialSaved(itemIds: number[]) {
  const orderId = materialOrder.value?.value;
  if (!open.value || !orderId || itemIds.length === 0) return;

  const shouldPreview = !!preview.value;
  const current = ++version;
  invalidatePreview();
  refreshError.value = false;
  previewing.value = true;
  try {
    await refreshOrder(orderId, current);
  } catch {
    if (current === version) refreshError.value = true;
  } finally {
    if (current === version) previewing.value = false;
  }
  if (shouldPreview && current === version && open.value) await prepare();
}

function combined(row: SplitApi.Row) {
  return row.colorMode === 'DUAL' && !row.side
    && (['EMBOSS', 'ENGRAVE', 'FOLD', 'LAMINATE', 'PACK', 'PUNCH'].includes(row.process ?? '')
      || ['EMBOSSED', 'ENGRAVED', 'FOLDED', 'LAMINATED', 'PACKED', 'PUNCHED'].includes(row.output?.stage ?? ''));
}
function layerText(row: SplitApi.Row) {
  if (row.colorMode === 'SINGLE') return '单色单层';
  if (row.side === 'FRONT') return '正面层';
  if (row.side === 'BACK') return '反面层';
  if (row.side === 'BOTH') return '正反同色层';
  return combined(row) ? '贴合后 · 正反合并' : '层别待确认';
}
function thicknessLabel(row: SplitApi.Row) {
  if (row.process === 'MIX') return '板材厚';
  return combined(row) ? '成品总厚' : '单层厚';
}
const shownOrders = computed(() => {
  const search = keyword.value.trim().toLocaleLowerCase();
  return loadedOrders.value.filter((order) => !search || [order.orderNo, order.customerName, order.sourceContractCode,
    ...order.items.flatMap((item) => [item.productCode, item.productName, item.specification, item.size, item.routeName])]
    .filter(Boolean).join(' ').toLocaleLowerCase().includes(search));
});
const shownTasks = computed(() => {
  const search = keyword.value.trim().toLocaleLowerCase();
  const itemId = selectedItemId.value ?? null;
  return (preview.value?.rows ?? []).filter((row) => (!status.value || row.status === status.value)
    && (itemId === null || row.itemId === itemId)
    && (!search || [row.orderNo, row.productName, row.productCode, row.processLabel, row.reason, finishedSpecText(row),
      row.stageColor, row.stageColorName, row.frontColor, row.frontColorName, row.backColor, row.backColorName,
      row.textureFrontName, row.textureBackName, layerText(row),
      row.output && materialText(row.output), row.process && `${PROCESS_LABELS[row.process] ?? row.process}车间`]
      .filter(Boolean).join(' ').toLocaleLowerCase().includes(search)));
});
const rowSelection = computed(() => ({
  selectedRowKeys: selectedIds.value,
  preserveSelectedRowKeys: true,
  getCheckboxProps: (order: OrderApi.Order) => ({ 'aria-label': `选择订单 ${order.orderNo}`, disabled: previewing.value || configBusy.value }),
  onChange: (keys: (number | string)[]) => { selectedIds.value = keys.map(Number); },
}));

async function loadOrders() {
  const current = ++version;
  loadError.value = false;
  loading.value = true;
  try {
    const list = props.orders?.length ? [...props.orders] : await getOpenProductionOrders();
    if (current !== version || !open.value) return;
    loadedOrders.value = list;
    selectedIds.value = props.orders?.length ? list.map((order) => order.id) : [];
  } catch {
    if (current === version) loadError.value = true;
  } finally {
    if (current === version) loading.value = false;
  }
}

watch(open, (value) => {
  ++version;
  invalidateAdvice();
  configOpen.value = false;
  if (!value) return;
  loadedOrders.value = [];
  selectedIds.value = [];
  preview.value = undefined;
  stockPicks.value = [];
  previewStockSelections.value = [];
  previewError.value = false;
  refreshedAfterDelivery.value = false;
  needsRepreview.value = false;
  refreshError.value = false;
  keyword.value = '';
  note.value = '';
  status.value = undefined;
  page.value = 1;
  previewPage.value = 1;
  selectedItemId.value = undefined;
  materialOrderId.value = undefined;
  materialSaving.value = false;
  previewing.value = false;
  void loadOrders();
});
watch([keyword, selectedItemId, status], () => { page.value = 1; previewPage.value = 1; });
onBeforeUnmount(() => {
  ++version;
  stopAdviceRequest();
});

function back() {
  invalidateAdvice();
  preview.value = undefined;
  stockPicks.value = [];
  previewStockSelections.value = [];
  previewError.value = false;
  refreshedAfterDelivery.value = false;
  needsRepreview.value = false;
  keyword.value = '';
  status.value = undefined;
  selectedItemId.value = undefined;
}

/** getRandomValues 同样可用于工厂内网 HTTP，避免依赖仅安全上下文提供的 randomUUID。 */
function newRequestId() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6]! & 15) | 64;
  bytes[8] = (bytes[8]! & 63) | 128;
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

async function prepare() {
  if (!canPreview.value || previewing.value || submitting.value) return;
  const current = ++version;
  const picksVersion = stockPicksVersion;
  const ids = [...selectedIds.value];
  const upstreamPicks = stockPicks.value.filter(({ candidate }) => !candidate.deliverable);
  const selections = upstreamPicks.filter((pick) => validStockPick(pick))
    .map(({ candidate, quantity }) => ({ itemId: candidate.itemId, stockId: candidate.stockId, quantity: quantity! }));
  previewing.value = true;
  previewError.value = false;
  invalidatePreview();
  try {
    const result = selections.length > 0 ? await previewOrderSplit(ids, selections) : await previewOrderSplit(ids);
    if (current !== version || !open.value) return;
    preview.value = result;
    previewIds.value = ids;
    previewStockSelections.value = selections;
    needsRepreview.value = picksVersion !== stockPicksVersion || selections.length !== upstreamPicks.length;
    requestId.value = newRequestId();
    keyword.value = '';
    status.value = undefined;
    if (!result.rows.some((row) => row.itemId === selectedItemId.value)) selectedItemId.value = undefined;
    previewPage.value = 1;
  } catch {
    if (current === version) previewError.value = true;
  } finally {
    if (current === version) previewing.value = false;
  }
}

async function release() {
  if (!canRelease.value || !preview.value || submitting.value) return;
  submitting.value = true;
  try {
    submittedRequest.value ??= {
      productionOrderIds: previewIds.value,
      previewKey: preview.value.previewKey,
      requestId: requestId.value,
      note: note.value.trim() || undefined,
      ...(previewStockSelections.value.length > 0 ? { stockSelections: previewStockSelections.value } : {}),
    };
    const result = await releaseOrderSplit(submittedRequest.value);
    open.value = false;
    Modal.success({
      title: `已下发 ${result.tasks} 个工序任务`,
      content: `任务已分配到对应车间。纳入计划的库存已登记占用，车间按实际批次领料时扣减库存。${result.warnings.length > 0 ? `提醒：${result.warnings.join('；')}` : ''}`,
      width: 560,
    });
    emit('released', result.scheduleId);
  } catch (error) {
    const { code, msg } = businessError(error);
    if (code >= 1_000_000_000 || /预览过期|重新预览/.test(msg)) invalidatePreview();
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <Modal
    v-model:open="open" :width="1320" :style="{ top: '16px' }"
    :body-style="{ maxHeight: 'calc(100vh - 136px)', overflowY: 'auto' }"
    :closable="!submitting && !configBusy" :keyboard="!submitting && !configBusy"
    :mask-closable="false" title="订单拆分 → 工序任务"
  >
    <div class="flex flex-col gap-3 text-sm">
      <div class="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-border pb-2 text-sm">
        <span :class="preview ? 'text-muted-foreground' : 'font-semibold text-primary'">1. 选择订单与用料</span>
        <span :class="preview ? 'font-semibold text-primary' : 'text-muted-foreground'">2. 核对各工序任务</span>
        <span class="text-muted-foreground">3. 确认下发到车间</span>
      </div>
      <p class="m-0 text-xs text-muted-foreground">
        按订单工艺拆分。可勾选现有库存，从适用工序接做；其余数量从该款订单的第一道工序开始。
      </p>
      <p class="m-0 text-xs text-primary">
        预览仅计算用量。确认下发后生成车间任务，并占用本次纳入的库存。车间实际领料时扣减库存。
      </p>
      <Alert v-if="refreshError" type="warning" show-icon message="配置已保存，订单详情刷新失败。旧预览已作废，请在下发前核对最新预览。" />
      <Alert v-if="previewError" type="warning" show-icon message="本次预览未完成，已保留勾选库存。请检查库存并重新计算。" />
      <Alert v-else-if="refreshedAfterDelivery && !needsRepreview && !previewing" type="success" show-icon message="现货已登记。请核对重新预览的欠量和工序，再确认下发。" />
      <template v-if="!preview">
        <div class="flex flex-wrap items-center gap-3">
          <Input id="split-order-search" v-model:value="keyword" allow-clear placeholder="订单号、客户、产品编码、名称、规格" class="max-w-96" :disabled="previewing" />
          <span>已选 {{ selectedIds.length }} 张订单</span>
          <span v-if="selectedIds.length > MAX" class="text-red-600">一次最多选择 {{ MAX }} 张</span>
        </div>
        <Alert v-if="loadError" type="error" show-icon message="订单未加载成功">
          <template #action><Button size="small" @click="loadOrders">重试</Button></template>
        </Alert>
        <Table
          :columns="orderColumns" :data-source="shownOrders" :loading="loading || previewing" :row-selection="rowSelection"
          :pagination="{ current: page, pageSize: 10, showSizeChanger: false, showTotal: (total: number) => `共 ${total} 张订单` }"
          :scroll="{ x: 1050, y: 410 }" row-key="id" size="small" @change="(p) => page = p.current ?? 1"
        >
          <template #emptyText>没有可拆分的已接单订单</template>
          <template #expandedRowRender="{ record }"><OrderItemsTable :items="record.items" :editable="canEdit && !previewing && !configBusy" @edit="editItem(record.id, $event.id)" /></template>
          <template #bodyCell="{ column, record }">
            <template v-if="column.key === 'order'">
              <div class="font-mono text-xs">{{ record.orderNo }}</div>
              <div class="text-xs text-muted-foreground">{{ record.customerName || record.requesterName || '—' }}</div>
            </template>
            <template v-else-if="column.key === 'products'">
              <div v-for="item in record.items.slice(0, 2)" :key="item.id" class="mb-1 last:mb-0">
                <div>{{ item.productName }} <span class="whitespace-nowrap">· {{ num(item.quantity) }} {{ item.unit || '（单位未填）' }}</span></div>
                <div class="text-xs text-muted-foreground">{{ item.productCode }} · {{ dimensionTextInMm(specText(item)) || '未填写规格' }}</div>
              </div>
              <div v-if="record.items.length > 2" class="text-xs text-primary">共 {{ record.items.length }} 个产品，展开查看完整明细</div>
            </template>
            <template v-else-if="column.key === 'route'">
              <div v-for="item in record.items.slice(0, 2)" :key="item.id" class="mb-1 text-xs last:mb-0">
                <div>{{ item.routeName || '自选工艺' }}</div>
                <div :class="item.processes?.length ? 'text-muted-foreground' : 'text-orange-600'">{{ item.processes?.length ? item.processes.map((code: string) => PROCESS_LABELS[code] || code).join(' → ') : '未配置工艺，需补充' }}</div>
              </div>
            </template>
            <template v-else-if="column.key === 'date'">{{ dateText(record.promisedDate) || dateText(record.requiredDate) || '未填写' }}</template>
          </template>
        </Table>
      </template>
      <section v-if="open && canEdit && materialOrder && selectedIds.length <= MAX" aria-label="配方与发泡模具" class="space-y-2 rounded-md border border-border px-3 py-2">
        <div v-if="materialOrders.length > 1" class="flex flex-wrap items-center gap-2">
          <label for="split-material-order" class="text-xs text-muted-foreground">配置订单</label>
          <Select
            id="split-material-order" :value="materialOrder.value" :options="materialOrders"
            :disabled="previewing || submitting || configBusy" class="min-w-48" option-filter-prop="label"
            show-search size="small" @change="(value) => materialOrderId = Number(value)"
          />
        </div>
        <MaterialPlan
          ref="materialPlan" compact editable :order-id="materialOrder.value" :item-ids="materialOrder.itemIds"
          :disabled="previewing || submitting || configOpen" @saving="materialSaving = $event" @saved="onMaterialSaved"
        />
      </section>
      <template v-if="preview">
        <OrderSplitStockPanel
          v-if="preview.stockCandidates || preview.stockCoverage"
          v-model:picks="stockPicks"
          :advice="advice"
          :advice-feedback="adviceFeedback"
          :advice-loading="adviceLoading"
          :can-deliver="canEdit"
          :can-request-advice="canRequestAdvice"
          :disabled="submitting || previewing || configBusy"
          :needs-repreview="needsRepreview || invalidStockPicks"
          :orders="previewOrders"
          :preview="preview"
          @generate-advice="generateAdvice"
          @manual-delivery="openManualDelivery"
        />
        <Alert v-if="invalidStockPicks" type="warning" show-icon message="请给每个已勾选的库存行填写有效用量，或取消不可用的选择。" />
        <Alert v-else-if="needsRepreview && !previewing && !previewError" type="warning" show-icon message="当前选择需要重新计算。请核对更新后的工序计划，再确认下发。" />
        <div class="flex flex-wrap items-center gap-3">
          <strong>{{ preview.orderCount }} 张订单 · {{ preview.itemCount }} 条产品明细 · {{ preview.taskCount }} 个计划任务</strong>
          <Select
            id="split-task-product" v-model:value="selectedItemId" allow-clear show-search option-filter-prop="label"
            :options="productOptions" placeholder="全部产品明细" aria-label="按订单产品明细筛选工序" class="w-80 max-w-full"
          />
          <Input id="split-task-search" v-model:value="keyword" allow-clear placeholder="搜订单、产品、车间、规格、提醒" class="max-w-64" />
          <Select v-model:value="status" allow-clear :options="statusOptions" placeholder="全部检查状态" class="w-48" />
        </div>
        <details class="rounded border border-border px-3 py-2 text-xs">
          <summary class="cursor-pointer font-medium">订单产品明细（{{ productSpecs.length }} 条，展开查看数量、成品规格、正反颜色、层厚和纹路）</summary>
          <div class="mt-2"><OrderSplitSpecsTable :rows="productSpecs" :editable="canEdit && !submitting && !previewing && !configBusy" @edit="editItem($event.orderId, $event.itemId)" /></div>
          <p class="m-0 mt-1 text-muted-foreground">点击「修改参数与工艺」调整订单明细。保存后自动重新预览，核对无误后再下发。</p>
        </details>
        <details class="rounded border border-border px-3 py-2 text-xs">
          <summary class="cursor-pointer">单双色拆分规则</summary>
          <table class="mt-2 w-full border-collapse text-left">
            <thead><tr class="border-b border-border"><th class="py-1">工序</th><th>单色</th><th>双色</th></tr></thead>
            <tbody>
              <tr class="border-b border-border"><td class="py-1">发泡</td><td>一个颜色一行，按板材 / 模具厚度出板</td><td>正面颜色、反面颜色各一行，按板材 / 模具厚度出板</td></tr>
              <tr class="border-b border-border"><td class="py-1">开片、立切</td><td>单层按成品总厚</td><td>正面、反面各一行，每层为成品总厚的一半</td></tr>
              <tr><td class="py-1">贴合及后道</td><td>按订单实际工艺继续</td><td>贴合后正反合并，产出为成品总厚</td></tr>
            </tbody>
          </table>
          <p class="mb-0 mt-2">立切按板材排版分片，贴合、压花保留中间片材长宽；冲裁后才变为订单成品长宽。</p>
        </details>
        <details v-if="preview.errors.length" class="rounded border border-red-200 px-3 py-2 text-xs">
          <summary class="cursor-pointer font-medium text-red-600">{{ preview.errors.length }} 项待处理，本批暂不能下发（展开查看）</summary>
          <ul class="m-0 mt-1 max-h-28 list-disc overflow-auto pl-4"><li v-for="(error, index) in preview.errors" :key="index">{{ error }}</li></ul>
        </details>
        <details v-if="preview.warnings.length" class="rounded border border-orange-200 px-3 py-2 text-xs">
          <summary class="cursor-pointer text-orange-600">生产提醒 {{ preview.warnings.length }} 项（展开查看）</summary>
          <ul class="m-0 mt-1 max-h-24 list-disc overflow-auto pl-4"><li v-for="(warning, index) in preview.warnings" :key="index">{{ warning }}</li></ul>
        </details>
        <Table
          class="split-process-tasks" :columns="taskColumns" :data-source="shownTasks" :scroll="{ x: 1580, y: 420 }"
          :pagination="{ current: previewPage, pageSize: 20, showSizeChanger: false, showTotal: (total: number) => `共 ${total} 行工序检查` }"
          row-key="rowKey" size="small" @change="(p) => previewPage = p.current ?? 1"
        >
          <template #emptyText>没有符合筛选条件的工序任务</template>
          <template #bodyCell="{ column, record }">
            <template v-if="column.key === 'order'">
              <div class="font-mono text-xs">{{ record.orderNo }}</div>
              <div>{{ record.productName || '未填写产品名称' }}</div>
              <div class="text-xs text-muted-foreground">{{ record.productCode || '未填写编码' }} · 明细 #{{ record.itemId }}</div>
              <div class="text-xs text-muted-foreground">成品 {{ finishedSpecText(record as SplitApi.Row) || '规格未填写' }}</div>
              <div class="mt-1 flex flex-wrap gap-x-2 text-xs">
                <span>订单 {{ orderQuantityText(record.orderQuantity, record.orderUnit) }}</span>
                <span class="font-semibold">待产 {{ orderQuantityText(record.remainingQuantity, record.orderUnit) }}</span>
              </div>
              <Button v-if="canEdit" class="!px-0" size="small" type="link" :disabled="submitting || previewing || configBusy" @click="editItem(record.orderId, record.itemId)">修改参数与工艺</Button>
            </template>
            <template v-else-if="column.key === 'process'">
              <div><template v-if="record.sequence !== null && record.sequence !== undefined">{{ record.sequence }}. </template>{{ record.processLabel || (record.process && PROCESS_LABELS[record.process]) || (record.status === 'DONE' ? '无需再拆分' : '工艺待配置') }}</div>
              <div v-if="record.process" class="text-xs text-muted-foreground">{{ record.processLabel || PROCESS_LABELS[record.process] || record.process }}车间</div>
            </template>
            <template v-else-if="column.key === 'quantity'">
              <span v-if="record.quantity !== null && record.quantity !== undefined" class="font-medium">{{ num(record.quantity) }} {{ record.unit }}</span>
              <span v-else-if="record.status === 'DONE'">无需生产</span>
              <span v-else class="text-orange-600">待核算</span>
            </template>
            <template v-else-if="column.key === 'layer'">
              <Tag :color="record.side === 'BACK' ? 'purple' : combined(record as SplitApi.Row) ? 'green' : 'blue'">{{ layerText(record as SplitApi.Row) }}</Tag>
              <div class="mt-1 text-xs text-muted-foreground">{{ colorModeText(record.colorMode) }}</div>
            </template>
            <template v-else-if="column.key === 'output'">
              <template v-if="combined(record as SplitApi.Row)">
                <div>正面：{{ parameterText(record.frontColor, record.frontColorName) }}</div>
                <div>反面：{{ parameterText(record.backColor, record.backColorName) }}</div>
              </template>
              <div v-else>颜色：{{ parameterText(record.stageColor, record.stageColorName) }}</div>
              <div class="font-medium">{{ thicknessLabel(record as SplitApi.Row) }} {{ thicknessText(record.stageThickness) }}</div>
            </template>
            <template v-else-if="column.key === 'spec'">{{ record.output ? materialText({ ...record.output, quantity: undefined }) : '待补生产规格' }}</template>
            <template v-else-if="column.key === 'inputs'">
              <div v-for="(input, index) in record.inputs" :key="index" class="text-xs">{{ materialText(input) }}</div>
              <div v-if="!record.inputs?.length" class="text-xs text-muted-foreground">无预计领料</div>
              <div v-if="record.upstreamProcesses?.length" class="mt-1 text-xs text-muted-foreground">上游：{{ record.upstreamProcesses.map((code: string) => PROCESS_LABELS[code] || code).join(' → ') }}</div>
            </template>
            <template v-else-if="column.key === 'status'">
              <Tag :color="record.status === 'READY' ? 'green' : record.status === 'BLOCKED' ? 'red' : 'default'">{{ statusLabels[record.status as keyof typeof statusLabels] }}</Tag>
              <div v-if="record.reason" class="mt-1 text-xs">{{ record.reason }}</div>
            </template>
          </template>
        </Table>
        <p v-if="!canRelease && !preview.errors.length && !invalidStockPicks && !needsRepreview && !hasFinishedGoodsPick && !previewing" class="m-0 text-xs text-orange-600">本批没有可下发的任务，或有未解决的配置问题。请检查各行提示后重新预览。</p>
        <label for="split-release-note" class="text-xs text-muted-foreground">下发说明（选填）</label>
        <Input.TextArea id="split-release-note" v-model:value="note" :maxlength="500" :rows="2" :disabled="submitting || !!submittedRequest" />
        <p v-if="submittedRequest && !submitting" class="m-0 text-xs text-muted-foreground">重试会保留本次提交内容，避免重复下发；如需修改说明，请重新预览。</p>
      </template>
    </div>
    <template #footer>
      <div class="flex flex-wrap justify-end gap-2">
        <Button :disabled="submitting || configBusy" @click="open = false">取消</Button>
        <Button v-if="preview" :disabled="submitting || previewing || configBusy" @click="back">返回选择订单</Button>
        <Button v-if="preview" :disabled="submitting || configBusy" :loading="previewing" @click="prepare">{{ needsRepreview ? '重新计算' : '重新预览' }}</Button>
        <Button v-if="!preview" type="primary" :disabled="!canPreview" :loading="previewing" @click="prepare">预览工序任务</Button>
        <Button v-else type="primary" :disabled="!canRelease" :loading="submitting" @click="release">确认下发 {{ preview.taskCount }} 个任务</Button>
      </div>
    </template>
  </Modal>
  <ItemProductionConfigModal v-if="configOrderId && configItemId" v-model:open="configOpen" :order-id="configOrderId" :item-id="configItemId" @saved="onConfigSaved" />
</template>
