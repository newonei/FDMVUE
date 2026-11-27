<script setup lang="ts">
import type { FoamRawIssue, FoamRawMaterial, FoamRawOrder } from '#/api/fdmgongchang/foam-raw';

import { computed, ref, watch } from 'vue';

import { buildUUID } from '@vben/utils';

import { Alert, Button, DatePicker, Input, message, Modal, Select, Table, Tag } from 'ant-design-vue';
import dayjs from 'dayjs';

import {
  applyFoamRawOrder,
  cancelFoamRawOrder,
  getFoamRawOrders,
  issueFoamRawOrder,
  returnFoamRawIssue,
} from '#/api/fdmgongchang/foam-raw';

import { formatKilograms } from './format';
import QuantityInput from './quantity-input.vue';

const props = defineProps<{
  canApply: boolean;
  canIssue: boolean;
  factoryId: number;
  materials: FoamRawMaterial[];
  refreshKey: number;
}>();
const emit = defineEmits<{ changed: [] }>();

const pageNo = ref(1);
const pageSize = 15;
const total = ref(0);
const orders = ref<FoamRawOrder[]>([]);
const loading = ref(false);
const loadError = ref(false);
const saving = ref(false);
let loadVersion = 0;
const status = {
  CANCELLED: { color: 'default', label: '已取消余量' },
  ISSUED: { color: 'green', label: '已发齐' },
  PARTIAL: { color: 'blue', label: '部分实发' },
  PENDING: { color: 'orange', label: '待发' },
};
const columns = [
  { dataIndex: 'orderNo', key: 'orderNo', title: '领料单号', width: 165 },
  { key: 'status', title: '状态', width: 115 },
  { key: 'materials', title: '申请与实发', width: 330 },
  { key: 'createdAt', title: '申请时间', width: 155 },
  { dataIndex: 'remark', key: 'remark', title: '备注', width: 170 },
  { key: 'actions', title: '操作', width: 170 },
];

async function reload() {
  const version = ++loadVersion;
  loading.value = true;
  loadError.value = false;
  try {
    const result = await getFoamRawOrders(props.factoryId, pageNo.value, pageSize);
    if (version === loadVersion) {
      orders.value = result.list;
      total.value = result.total;
    }
  } catch {
    if (version === loadVersion) loadError.value = true;
  } finally {
    if (version === loadVersion) loading.value = false;
  }
}

watch([pageNo, () => props.refreshKey], reload, { immediate: true });

type RequestLine = { itemId?: number; key: string; quantity: null | number };
const draft = ref<
  | { issue: FoamRawIssue; kind: 'return'; occurredOn: string; quantity: null | number; reason: string; requestKey: string }
  | { kind: 'apply'; lines: RequestLine[]; remark: string; requestKey: string }
  | { kind: 'issue'; occurredOn: string; order: FoamRawOrder; quantities: Record<number, null | number>; requestKey: string }
>();
const title = computed(() => {
  if (draft.value?.kind === 'issue') return `确认实发 · ${draft.value.order.orderNo}`;
  if (draft.value?.kind === 'return') return `退回原料仓 · ${draft.value.issue.materialName}`;
  return '申请发泡原料';
});
const materialOptions = computed(() => props.materials.map((material) => ({
  label: `${material.materialName} · ${material.materialCode}`,
  value: material.itemId,
})));
const packageWeight = (itemId?: number) => props.materials.find((material) => material.itemId === itemId)?.packageWeight;
const quantityDifference = (a: number, b: number) => Math.max(0, Math.round((Number(a) - Number(b)) * 1000) / 1000);
const pending = (line: FoamRawOrder['lines'][number]) => quantityDifference(line.requestedQuantity, line.issuedQuantity);
const returnable = (issue: FoamRawIssue) => quantityDifference(issue.quantity, issue.returnedQuantity);
const canClose = (order: FoamRawOrder) => order.status === 'PARTIAL' || order.status === 'PENDING';

function addRequestLine() {
  if (draft.value?.kind === 'apply') draft.value.lines.push({ key: buildUUID(), quantity: null });
}

function openApply(itemId?: number) {
  if (!props.canApply) return;
  draft.value = {
    kind: 'apply',
    lines: [{ itemId, key: buildUUID(), quantity: null }],
    remark: '',
    requestKey: buildUUID(),
  };
}

function openIssue(order: FoamRawOrder) {
  draft.value = {
    kind: 'issue',
    occurredOn: dayjs().format('YYYY-MM-DD'),
    order,
    quantities: Object.fromEntries(order.lines.map((line) => [line.id, pending(line) || null])),
    requestKey: buildUUID(),
  };
}

function openReturn(issue: FoamRawIssue) {
  draft.value = {
    issue,
    kind: 'return',
    occurredOn: dayjs().format('YYYY-MM-DD'),
    quantity: null,
    reason: '',
    requestKey: buildUUID(),
  };
}

defineExpose({ openApply });

async function submit() {
  const current = draft.value;
  if (!current || saving.value) return;
  saving.value = true;
  try {
    if (current.kind === 'apply') {
      const lines = current.lines.flatMap((line) => line.itemId && line.quantity && line.quantity > 0
        ? [{ itemId: line.itemId, quantity: line.quantity }]
        : []);
      if (lines.length !== current.lines.length || new Set(lines.map((line) => line.itemId)).size !== lines.length) {
        message.warning('请为每一行选择不同原料并填写申请数量');
        return;
      }
      await applyFoamRawOrder(props.factoryId, { lines, remark: current.remark.trim(), requestKey: current.requestKey });
      pageNo.value = 1;
      message.success('已提交领料申请');
    } else if (current.kind === 'issue') {
      const lines = current.order.lines.flatMap((line) => {
        const quantity = current.quantities[line.id];
        return quantity && quantity > 0 ? [{ lineId: line.id, quantity }] : [];
      });
      if (!current.occurredOn || lines.length === 0 || current.order.lines.some((line) => (current.quantities[line.id] ?? 0) > pending(line))) {
        message.warning('请选择实际发料日期，并填写有效的实发数量');
        return;
      }
      await issueFoamRawOrder(props.factoryId, { lines, occurredOn: current.occurredOn, orderId: current.order.id, requestKey: current.requestKey });
      message.success('已按实发数量出库');
    } else {
      if (!current.occurredOn || !current.reason.trim() || !current.quantity
        || current.quantity <= 0 || current.quantity > returnable(current.issue)) {
        message.warning('请选择退料日期，并填写有效的退料数量和原因');
        return;
      }
      await returnFoamRawIssue(props.factoryId, {
        issueId: current.issue.id,
        occurredOn: current.occurredOn,
        quantity: current.quantity,
        reason: current.reason.trim(),
        requestKey: current.requestKey,
      });
      message.success('退料已入原料仓');
    }
    draft.value = undefined;
    emit('changed');
  } finally {
    saving.value = false;
  }
}

function closePending(order: FoamRawOrder) {
  Modal.confirm({
    content: '已经实发的料继续保留原记录。',
    title: `取消 ${order.orderNo} 尚未发出的数量？`,
    onOk: async () => {
      await cancelFoamRawOrder(props.factoryId, order.id);
      message.success('已取消未发数量');
      emit('changed');
    },
  });
}
</script>

<template>
  <div class="flex flex-col gap-3">
    <Alert v-if="loadError" type="error" show-icon message="领料记录加载失败。"><template #action><Button size="small" @click="reload">重试</Button></template></Alert>
    <div class="flex flex-wrap items-center justify-between gap-2">
      <p class="m-0 text-sm text-muted-foreground">仓管按实际交接数量确认出库，支持分次发料。</p>
      <Button v-if="canApply" type="primary" @click="openApply()">申请领料</Button>
    </div>
    <Table
      :columns="columns"
      :data-source="orders"
      :loading="loading"
      :pagination="{ current: pageNo, pageSize, total, showSizeChanger: false, onChange: (page: number) => pageNo = page }"
      :row-expandable="(row: FoamRawOrder) => row.issues.length > 0"
      :scroll="{ x: 1050 }"
      row-key="id"
      size="middle"
    >
      <template #bodyCell="{ column, record }">
        <Tag v-if="column.key === 'status'" :color="status[(record as FoamRawOrder).status]?.color">
          {{ status[(record as FoamRawOrder).status]?.label }}
        </Tag>
        <div v-else-if="column.key === 'materials'" class="flex flex-col gap-1">
          <div v-for="line in (record as FoamRawOrder).lines" :key="line.id" class="flex flex-wrap items-baseline gap-x-2">
            <b>{{ line.materialName }}</b><span class="text-muted-foreground">申请 {{ formatKilograms(line.requestedQuantity) }} · 实发 {{ formatKilograms(line.issuedQuantity) }}</span>
          </div>
        </div>
        <span v-else-if="column.key === 'createdAt'">{{ dayjs(record.createdAt).format('YYYY-MM-DD HH:mm') }}</span>
        <div v-else-if="column.key === 'actions' && canIssue && canClose(record as FoamRawOrder)" class="flex gap-2">
          <Button size="small" type="primary" @click="openIssue(record as FoamRawOrder)">确认实发</Button>
          <Button size="small" @click="closePending(record as FoamRawOrder)">取消未发</Button>
        </div>
      </template>
      <template #expandedRowRender="{ record }">
        <ul class="m-0 flex list-none flex-col gap-2 px-0 py-1">
          <li v-for="issue in (record as FoamRawOrder).issues" :key="issue.id" class="flex flex-wrap items-center gap-x-3 gap-y-1">
            <b>{{ issue.materialName }}</b>
            <span>实发 {{ formatKilograms(issue.quantity) }}</span>
            <span v-if="Number(issue.returnedQuantity) > 0">已退 {{ formatKilograms(issue.returnedQuantity) }}</span>
            <span class="text-muted-foreground">{{ issue.occurredOn }} · {{ issue.warehouseDocNo ?? '生产领料' }}</span>
            <Button v-if="canIssue && returnable(issue) > 0" size="small" @click="openReturn(issue)">退料</Button>
          </li>
        </ul>
      </template>
    </Table>
    <Modal :open="!!draft" :confirm-loading="saving" :mask-closable="false" :title="title" :width="640" @cancel="!saving && (draft = undefined)" @ok="submit">
      <div v-if="draft?.kind === 'apply'" class="flex flex-col gap-3 py-2">
        <div v-for="(line, index) in draft.lines" :key="line.key" class="grid gap-2 sm:grid-cols-[minmax(0,1fr)_10rem_auto] sm:items-center">
          <Select v-model:value="line.itemId" :aria-label="`第 ${index + 1} 行原料`" :options="materialOptions" option-filter-prop="label" placeholder="选择原料" show-search />
          <QuantityInput v-model="line.quantity" :label="`第 ${index + 1} 行申请数量`" :package-weight="packageWeight(line.itemId)" unit="t" />
          <Button :disabled="draft.lines.length === 1" @click="draft.lines.splice(index, 1)">移除</Button>
        </div>
        <Button block type="dashed" @click="addRequestLine">添加原料</Button>
        <Input.TextArea v-model:value="draft.remark" :maxlength="500" aria-label="领料备注" placeholder="备注（选填）" />
      </div>
      <div v-else-if="draft?.kind === 'issue'" class="flex flex-col gap-3 py-2">
        <label class="flex items-center gap-2">实发日期 <DatePicker v-model:value="draft.occurredOn" :allow-clear="false" value-format="YYYY-MM-DD" /></label>
        <div v-for="line in draft.order.lines.filter((row) => pending(row) > 0)" :key="line.id" class="grid items-center gap-2 sm:grid-cols-2">
          <div class="flex flex-col gap-1">
            <span>{{ line.materialName }} · 待发 {{ formatKilograms(pending(line)) }}</span>
            <span class="text-xs text-muted-foreground">原料仓库存 {{ formatKilograms(materials.find((material) => material.itemId === line.itemId)?.warehouseQuantity) }}</span>
          </div>
          <QuantityInput v-model="draft.quantities[line.id]!" :label="`${line.materialName}实发数量`" :max="pending(line)" :package-weight="packageWeight(line.itemId)" />
        </div>
      </div>
      <div v-else-if="draft?.kind === 'return'" class="flex flex-col gap-3 py-2">
        <label class="flex items-center gap-2">退回日期 <DatePicker v-model:value="draft.occurredOn" :allow-clear="false" value-format="YYYY-MM-DD" /></label>
        <div class="grid items-center gap-2 sm:grid-cols-2">
          <span>可退 {{ formatKilograms(returnable(draft.issue)) }}</span>
          <QuantityInput v-model="draft.quantity" :label="`${draft.issue.materialName}退回数量`" :max="returnable(draft.issue)" :package-weight="packageWeight(draft.issue.itemId)" />
        </div>
        <Input.TextArea v-model:value="draft.reason" :maxlength="500" aria-label="退料原因" placeholder="退料原因" />
      </div>
    </Modal>
  </div>
</template>
