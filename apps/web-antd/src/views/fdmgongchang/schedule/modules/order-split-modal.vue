<script setup lang="ts">
import type { TableColumnsType } from 'ant-design-vue';

import type { FdmgongchangProductionOrderApi as OrderApi } from '#/api/fdmgongchang/production-order';
import type { FdmgongchangOrderSplitApi as SplitApi } from '#/api/fdmgongchang/schedule';

import { computed, onBeforeUnmount, ref, watch } from 'vue';

import { useAccess } from '@vben/access';

import { Alert, Button, Input, Modal, Select, Table, Tag } from 'ant-design-vue';

import { getOpenProductionOrders, getProductionOrder } from '#/api/fdmgongchang/production-order';
import { previewOrderSplit, releaseOrderSplit } from '#/api/fdmgongchang/schedule';

import { colorModeText, parameterText, thicknessText } from '../../production-order/manufacturing';
import ItemProductionConfigModal from '../../production-order/modules/item-production-config-modal.vue';
import OrderItemsTable from '../../production-order/modules/order-items-table.vue';
import { dateText, num, specText } from '../../production-order/shared';
import { dimensionTextInMm } from '../../shared/dimensions';
import { materialText, PROCESS_LABELS } from '../../shared/schedule';
import OrderSplitSpecsTable from './order-split-specs-table.vue';

const props = defineProps<{ orders?: OrderApi.Order[] }>();
const emit = defineEmits<{ changed: [order: OrderApi.Order]; released: [scheduleId: number] }>();
const open = defineModel<boolean>('open', { required: true });
const { hasAccessByCodes } = useAccess();
const canEdit = computed(() => hasAccessByCodes(['fdmgongchang:production-order:handle']));

const MAX = 50;
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
const preview = ref<SplitApi.Preview>();
const previewIds = ref<number[]>([]);
const requestId = ref('');
const submittedRequest = ref<SplitApi.ReleaseRequest>();
const configOpen = ref(false);
const configOrderId = ref<number>();
const configItemId = ref<number>();
const refreshError = ref(false);
let version = 0;

const orderColumns: TableColumnsType<OrderApi.Order> = [
  { key: 'order', title: '订单 / 客户', width: 205 },
  { key: 'products', title: '产品明细 / 订单数量', width: 370 },
  { key: 'route', title: '实际工艺路线', width: 300 },
  { key: 'date', title: '交期', width: 130 },
];
const taskColumns: TableColumnsType<SplitApi.Row> = [
  { key: 'order', title: '订单 / 产品明细', width: 230, fixed: 'left' },
  { key: 'process', title: '工序 / 车间', width: 145 },
  { key: 'layer', title: '生产层别', width: 120 },
  { key: 'output', title: '实际产出：颜色 / 厚度', width: 245 },
  { key: 'spec', title: '工序生产规格', width: 220 },
  { key: 'quantity', title: '工序计划数量', width: 120 },
  { key: 'inputs', title: '预计领料 / 上游工序', width: 240 },
  { key: 'status', title: '配置检查 / 提醒', width: 230 },
];
const statusLabels = { BLOCKED: '待补配置 / 暂不能下发', DONE: '已完成，无需下发', READY: '配置通过' };
const statusOptions = Object.entries(statusLabels).map(([value, label]) => ({ value, label }));
const canPreview = computed(() => selectedIds.value.length > 0 && selectedIds.value.length <= MAX && !loading.value && !configOpen.value);
const canRelease = computed(() => !configOpen.value && !previewing.value && !!preview.value?.canRelease && preview.value.taskCount > 0
  && preview.value.errors.length === 0 && !preview.value.rows.some((row) => row.status === 'BLOCKED'));
const productSpecs = computed(() => [...new Map((preview.value?.rows ?? [])
  .map((row) => [`${row.orderId}-${row.itemId}`, row])).values()]);

function editItem(orderId: number, itemId: number) {
  if (!canEdit.value || submitting.value || previewing.value) return;
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
  preview.value = undefined;
  requestId.value = '';
  submittedRequest.value = undefined;
  refreshError.value = false;
  previewing.value = true;
  try {
    const fresh = await getProductionOrder(orderId);
    if (current !== version || !open.value) return;
    loadedOrders.value = loadedOrders.value.map((order) => order.id === fresh.id ? fresh : order);
    emit('changed', fresh);
  } catch {
    if (current === version) refreshError.value = true;
    return;
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
  return (preview.value?.rows ?? []).filter((row) => (!status.value || row.status === status.value)
    && (!search || [row.orderNo, row.productName, row.productCode, row.processLabel, row.reason,
      row.stageColor, row.stageColorName, row.frontColor, row.frontColorName, row.backColor, row.backColorName,
      row.textureFrontName, row.textureBackName, layerText(row),
      row.output && materialText(row.output), row.process && `${PROCESS_LABELS[row.process] ?? row.process}车间`]
      .filter(Boolean).join(' ').toLocaleLowerCase().includes(search)));
});
const rowSelection = computed(() => ({
  selectedRowKeys: selectedIds.value,
  preserveSelectedRowKeys: true,
  getCheckboxProps: (order: OrderApi.Order) => ({ 'aria-label': `选择订单 ${order.orderNo}`, disabled: previewing.value }),
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
  configOpen.value = false;
  if (!value) return;
  loadedOrders.value = [];
  selectedIds.value = [];
  preview.value = undefined;
  requestId.value = '';
  submittedRequest.value = undefined;
  refreshError.value = false;
  keyword.value = '';
  note.value = '';
  status.value = undefined;
  page.value = 1;
  previewPage.value = 1;
  previewing.value = false;
  void loadOrders();
});
watch([keyword, status], () => { page.value = 1; previewPage.value = 1; });
onBeforeUnmount(() => { ++version; });

function back() {
  preview.value = undefined;
  requestId.value = '';
  submittedRequest.value = undefined;
  keyword.value = '';
  status.value = undefined;
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
  const ids = [...selectedIds.value];
  previewing.value = true;
  // 重新计算时旧预览不能再被确认；重试下发则保留原 requestId。
  preview.value = undefined;
  requestId.value = '';
  submittedRequest.value = undefined;
  try {
    const result = await previewOrderSplit(ids);
    if (current !== version || !open.value) return;
    preview.value = result;
    previewIds.value = ids;
    requestId.value = newRequestId();
    keyword.value = '';
    status.value = undefined;
    previewPage.value = 1;
  } catch {
    // API 统一提示具体错误，保留所选订单以便重新预览。
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
    };
    const result = await releaseOrderSplit(submittedRequest.value);
    open.value = false;
    Modal.success({
      title: `已下发 ${result.tasks} 个工序任务`,
      content: `任务已分配到对应车间，所需半成品产品和零库存已自动补齐，可直接领料。账面不足时允许领为负数，上道补报入库后冲抵。${result.warnings.length > 0 ? `提醒：${result.warnings.join('；')}` : ''}`,
      width: 560,
    });
    emit('released', result.scheduleId);
  } catch {
    // 保留 requestId，网络错误后重试由后端返回同一批下发结果。
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <Modal v-model:open="open" :width="1320" :closable="!submitting && !configOpen" :keyboard="!submitting && !configOpen" :mask-closable="false" title="订单拆分 → 工序任务">
    <div class="flex flex-col gap-3 text-sm">
      <div class="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-border pb-2 text-sm">
        <span :class="preview ? 'text-muted-foreground' : 'font-semibold text-primary'">1. 选择订单</span>
        <span :class="preview ? 'font-semibold text-primary' : 'text-muted-foreground'">2. 核对各工序任务</span>
        <span class="text-muted-foreground">3. 确认下发到车间</span>
      </div>
      <p class="m-0 text-xs text-muted-foreground">
        按订单产品的实际工艺路线完整拆分。订单数量与每道工序的计划数量分别核算；库存不足只提醒，缺少工艺或生产配置时需补齐后再下发。
      </p>
      <p class="m-0 text-xs text-primary">
        确认下发时自动建立缺少的半成品产品和零库存，车间可直接领料；账面不足允许领为负数，上道补报入库后冲抵。预览不会创建产品或变更库存。
      </p>
      <Alert v-if="refreshError" type="warning" show-icon message="参数已保存，订单刷新失败。旧预览已作废，请重新打开预览核对。" />
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
          <template #expandedRowRender="{ record }"><OrderItemsTable :items="record.items" :editable="canEdit && !previewing" @edit="editItem(record.id, $event.id)" /></template>
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
      <template v-else>
        <div class="flex flex-wrap items-center gap-3">
          <strong>{{ preview.orderCount }} 张订单 · {{ preview.itemCount }} 条产品明细 · {{ preview.taskCount }} 个计划任务</strong>
          <Input id="split-task-search" v-model:value="keyword" allow-clear placeholder="搜订单、产品、车间、规格、提醒" class="max-w-80" />
          <Select v-model:value="status" allow-clear :options="statusOptions" placeholder="全部检查状态" class="w-48" />
        </div>
        <details class="rounded border border-border px-3 py-2 text-xs">
          <summary class="cursor-pointer font-medium">本次拆分的订单产品参数（{{ productSpecs.length }} 条明细，展开核对单双色、正反颜色、层厚和纹路）</summary>
          <div class="mt-2"><OrderSplitSpecsTable :rows="productSpecs" :editable="canEdit && !submitting" @edit="editItem($event.orderId, $event.itemId)" /></div>
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
          <summary class="cursor-pointer text-orange-600">生产提醒 {{ preview.warnings.length }} 项（不省略工艺任务，展开查看）</summary>
          <ul class="m-0 mt-1 max-h-24 list-disc overflow-auto pl-4"><li v-for="(warning, index) in preview.warnings" :key="index">{{ warning }}</li></ul>
        </details>
        <Table
          class="split-process-tasks" :columns="taskColumns" :data-source="shownTasks" :scroll="{ x: 1550, y: 420 }"
          :pagination="{ current: previewPage, pageSize: 20, showSizeChanger: false, showTotal: (total: number) => `共 ${total} 行工序检查` }"
          row-key="rowKey" size="small" @change="(p) => previewPage = p.current ?? 1"
        >
          <template #bodyCell="{ column, record }">
            <template v-if="column.key === 'order'">
              <div class="font-mono text-xs">{{ record.orderNo }}</div>
              <div>{{ record.productName || '未填写产品名称' }}</div>
              <div class="text-xs text-muted-foreground">{{ record.productCode || '未填写编码' }} · 明细 #{{ record.itemId }}</div>
              <Button v-if="canEdit" class="!px-0" size="small" type="link" :disabled="submitting || previewing" @click="editItem(record.orderId, record.itemId)">修改参数与工艺</Button>
            </template>
            <template v-else-if="column.key === 'process'">
              <div><template v-if="record.sequence !== null && record.sequence !== undefined">{{ record.sequence }}. </template>{{ record.processLabel || (record.process && PROCESS_LABELS[record.process]) || '工艺待配置' }}</div>
              <div v-if="record.process" class="text-xs text-muted-foreground">{{ record.processLabel || PROCESS_LABELS[record.process] || record.process }}车间</div>
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
            <template v-else-if="column.key === 'quantity'">
              <span v-if="record.quantity !== null && record.quantity !== undefined" class="font-medium">{{ record.quantity }} {{ record.unit }}</span><span v-else class="text-orange-600">待核算</span>
            </template>
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
        <p v-if="!canRelease && !preview.errors.length" class="m-0 text-xs text-orange-600">本批没有可下发的任务，或有未解决的配置问题。请检查各行提示后重新预览。</p>
        <label for="split-release-note" class="text-xs text-muted-foreground">下发说明（选填）</label>
        <Input.TextArea id="split-release-note" v-model:value="note" :maxlength="500" :rows="2" :disabled="submitting || !!submittedRequest" />
        <p v-if="submittedRequest && !submitting" class="m-0 text-xs text-muted-foreground">重试会保留本次提交内容，避免重复下发；如需修改说明，请重新预览。</p>
      </template>
    </div>
    <template #footer>
      <div class="flex flex-wrap justify-end gap-2">
        <Button :disabled="submitting || configOpen" @click="open = false">取消</Button>
        <Button v-if="preview" :disabled="submitting" @click="back">返回选择订单</Button>
        <Button v-if="preview" :disabled="submitting" :loading="previewing" @click="prepare">重新预览</Button>
        <Button v-if="!preview" type="primary" :disabled="!canPreview" :loading="previewing" @click="prepare">预览工序任务</Button>
        <Button v-else type="primary" :disabled="!canRelease" :loading="submitting" @click="release">确认下发 {{ preview.taskCount }} 个任务</Button>
      </div>
    </template>
  </Modal>
  <ItemProductionConfigModal v-if="configOrderId && configItemId" v-model:open="configOpen" :order-id="configOrderId" :item-id="configItemId" @saved="onConfigSaved" />
</template>
