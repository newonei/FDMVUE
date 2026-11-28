<script setup lang="ts">
import type { TablePaginationConfig } from 'ant-design-vue';

import type { FdmgongchangStageStockApi as Api } from '#/api/fdmgongchang/stage-stock';

import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue';

import { useAccess } from '@vben/access';
import { formatDateTime } from '@vben/utils';

import { Button, Image, Input, message, Select, Spin, Table, Tag } from 'ant-design-vue';

import { getHolds } from '#/api/fdmgongchang/quality';
import {
  getDefectStats,
  getOrder,
  getOrderPage,
} from '#/api/fdmgongchang/stage-stock';

import ReportCorrectionDialog from '../../shared/report-correction-dialog.vue';
import {
  attrSummary,
  defectRate,
  formatQty,
  formatRate,
  issueSeqLabel,
  makeLabels,
  materialGap,
  processLabel as processLabelOf,
  toNumber,
} from '../model';
import HoldModal from './hold-modal.vue';
import ReturnModal from './return-modal.vue';
import SupplementModal from './supplement-modal.vue';
import VoidModal from './void-modal.vue';

const props = defineProps<{ options: Api.Options; refreshKey: number }>();
const emit = defineEmits<{
  changed: [];
  create: [];
  report: [orderId: number];
}>();

const { hasAccessByCodes } = useAccess();
const canOperate = computed(() =>
  hasAccessByCodes(['fdmgongchang:stage-stock:operate']),
);
const canVoid = computed(() =>
  hasAccessByCodes(['fdmgongchang:stage-stock:void']),
);

const STATUS = {
  COMPLETED: { color: 'green', label: '已完工' },
  IN_PROGRESS: { color: 'orange', label: '在制' },
  VOIDED: { color: 'default', label: '已作废' },
} as const;
const statusOf = (status: Api.OrderStatus) =>
  STATUS[status] ?? { color: 'default', label: status };

const returnOpen = ref(false);
const returnOrderId = ref<number>();
const supplementOpen = ref(false);
const supplementOrderId = ref<number>();
const voidOpen = ref(false);
const voidTarget = ref<Api.Order>();
const correctionOpen = ref(false);
const correctionOrder = ref<Api.Order>();

function openCorrection(order: Api.Order) {
  correctionOrder.value = order;
  correctionOpen.value = true;
}

function openReturn(order: Api.Order) {
  returnOrderId.value = order.id;
  returnOpen.value = true;
}

function openSupplement(order: Api.Order) {
  supplementOrderId.value = order.id;
  supplementOpen.value = true;
}

function canReturn(order: Api.Order) {
  return order.process !== 'MIX' || (toNumber(order.inputQuantity) ?? 0) > (toNumber(order.returnedQuantity) ?? 0);
}

function openVoid(order: Api.Order) {
  voidTarget.value = order;
  voidOpen.value = true;
}

function onAdjusted(text: string) {
  message.success(text);
  emit('changed');
}

// ===== 质量冻结：产出行冻结一部分数量 =====
/** 工序单 → 产出行 → 冻结中的数量。 */
const held = ref<Record<number, Record<number, number>>>({});
async function loadHolds(orderId: number) {
  try {
    const list = await getHolds({ processOrderId: orderId });
    const map: Record<number, number> = {};
    for (const h of list) {
      if (h.status === 'HELD') map[h.outputId] = (map[h.outputId] ?? 0) + Number(h.quantity);
    }
    held.value = { ...held.value, [orderId]: map };
  } catch {
    // 没有权限或接口异常时不显示冻结
  }
}
const holdOpen = ref(false);
const holdLine = ref<Api.OrderLine>();
const holdOrder = ref<Api.Order>();
function openHold(order: Api.Order, line: Api.OrderLine) {
  holdOrder.value = order;
  holdLine.value = line;
  holdOpen.value = true;
}
async function onHeld(text: string) {
  message.success(text);
  if (holdOrder.value) await loadHolds(holdOrder.value.id);
  emit('changed');
}

/** 已回写合同生产进度的单不能作废。 */
const voidable = (order: Api.Order) =>
  order.status !== 'VOIDED' && Number(order.productionWriteback ?? 0) <= 0;

const labels = computed(() => makeLabels(props.options));
const processLabel = (code?: string) => processLabelOf(props.options, code);
const stageOf = (code?: string) =>
  props.options.stages.find((s) => s.code === code);

const filters = reactive({
  keyword: '',
  process: undefined as string | undefined,
  status: undefined as string | undefined,
});
const pageNo = ref(1);
const pageSize = ref(20);
const rows = ref<Api.Order[]>([]);
const total = ref(0);
const loading = ref(false);
const inProgress = ref<Api.Order[]>([]);
const stats = ref<Api.DefectStat[]>([]);
const expandedKeys = ref<number[]>([]);
const details = ref<Record<number, Api.Order>>({});

async function load() {
  loading.value = true;
  try {
    const page = await getOrderPage({
      keyword: filters.keyword.trim() || undefined,
      pageNo: pageNo.value,
      pageSize: pageSize.value,
      process: filters.process,
      status: filters.status,
    });
    rows.value = page.list;
    total.value = page.total;
  } finally {
    loading.value = false;
  }
}

async function loadSide() {
  const [wip, defect] = await Promise.all([
    getOrderPage({ pageNo: 1, pageSize: 50, status: 'IN_PROGRESS' }),
    getDefectStats(),
  ]);
  inProgress.value = wip.list;
  stats.value = defect;
}

watch(
  () => props.refreshKey,
  () => {
    details.value = {};
    load();
    loadSide();
  },
  { immediate: true },
);

let searchTimer: ReturnType<typeof setTimeout> | undefined;
watch(
  () => [filters.keyword, filters.process, filters.status],
  () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      pageNo.value = 1;
      load();
    }, 300);
  },
);
onBeforeUnmount(() => clearTimeout(searchTimer));

function onTableChange(pagination: TablePaginationConfig) {
  pageNo.value = pagination.current ?? 1;
  pageSize.value = pagination.pageSize ?? 20;
  load();
}

async function onExpand(expanded: boolean, record: Api.Order) {
  if (expanded && !held.value[record.id]) void loadHolds(record.id);
  if (expanded && !details.value[record.id])
    details.value = {
      ...details.value,
      [record.id]: await getOrder(record.id),
    };
}

const columns = [
  { dataIndex: 'orderNo', key: 'orderNo', title: '工序单号' },
  { key: 'issuedAt', title: '领料时间' },
  { key: 'process', title: '工序' },
  { key: 'status', title: '状态' },
  { align: 'right' as const, key: 'input', title: '领料' },
  { align: 'right' as const, key: 'output', title: '产出' },
  { key: 'contract', title: '关联订单' },
  { key: 'team', title: '班组' },
  { key: 'operator', title: '操作人' },
  { align: 'right' as const, key: 'actions', title: '操作', width: 120 },
];
const inProgressColumns = computed(() => [
  { dataIndex: 'orderNo', key: 'orderNo', title: '工序单号', width: 130 },
  { key: 'process', title: '工序', width: 70 },
  { key: 'source', title: '领料工段', width: 100 },
  { align: 'right' as const, key: 'input', title: '已领数量', width: 105 },
  { align: 'right' as const, key: 'returned', title: '已退数量', width: 105 },
  { align: 'right' as const, key: 'supplemented', title: '补领次数', width: 78 },
  { align: 'right' as const, key: 'reported', title: '报工次数', width: 78 },
  { align: 'right' as const, key: 'good', title: '良品数量', width: 105 },
  { key: 'team', title: '班组', width: 85 },
  { key: 'operator', title: '操作人', width: 85 },
  { key: 'issuedAt', title: '领料时间', width: 150 },
  ...(canOperate.value ? [{ key: 'actions', title: '操作', width: 192 }] : []),
]);

const statusOptions = [
  { label: '在制', value: 'IN_PROGRESS' },
  { label: '已完工', value: 'COMPLETED' },
  { label: '已作废', value: 'VOIDED' },
];
const processOptions = computed(() => [
  ...props.options.processes.map((p) => ({ label: p.label, value: p.code })),
  ...(props.options.extraProcesses ?? []).map((p) => ({ label: `${p.label}（附加）`, value: p.code })),
]);

function isSkipped(order: Api.Order) {
  const option = props.options.processes.find((p) => p.code === order.process);
  return option
    ? option.allowedSources[0] !== order.sourceStage && order.process !== 'MIX'
    : false;
}

const statCards = computed(() =>
  [
    ...props.options.processes,
    ...(props.options.extraProcesses ?? [])
      .filter((p) => p.enabled)
      .map((p) => ({ code: p.code, label: p.label, outputStage: p.stage })),
  ].map((p) => {
    const s = stats.value.find((x) => x.process === p.code);
    const rate = defectRate(s?.goodQuantity, s?.defectQuantity);
    return {
      code: p.code,
      defect: s?.defectQuantity ?? 0,
      label: p.label,
      output: Number(s?.goodQuantity ?? 0) + Number(s?.defectQuantity ?? 0),
      rate,
      unit: stageOf(p.outputStage)?.unit,
    };
  }),
);
</script>

<template>
  <div class="flex flex-col gap-5">
    <section v-if="inProgress.length > 0" class="flex flex-col gap-2">
      <h3 class="m-0 text-sm font-semibold">
        车间在制<span class="ml-2 text-xs font-normal text-muted-foreground">已领料、还没报完工</span>
      </h3>
      <Table
        aria-label="车间在制工序单"
        bordered
        :columns="inProgressColumns"
        :data-source="inProgress"
        :pagination="false"
        :scroll="{ x: 'max-content', y: 300 }"
        row-key="id"
        size="small"
      >
        <template #bodyCell="{ column, record }">
          <span v-if="column.key === 'orderNo'" class="whitespace-nowrap font-mono text-xs">{{ record.orderNo }}</span>
          <span v-else-if="column.key === 'process'" class="whitespace-nowrap">{{ processLabel(record.process) }}</span>
          <span v-else-if="column.key === 'source'" class="whitespace-nowrap">{{ stageOf(record.sourceStage)?.label || '—' }}</span>
          <span v-else-if="column.key === 'input'" class="whitespace-nowrap tabular-nums">{{ formatQty(record.inputQuantity) }} {{ stageOf(record.sourceStage)?.unit }}</span>
          <span v-else-if="column.key === 'returned'" class="whitespace-nowrap tabular-nums">{{ formatQty(record.returnedQuantity ?? 0) }} {{ stageOf(record.sourceStage)?.unit }}</span>
          <span v-else-if="column.key === 'supplemented'" class="tabular-nums">{{ record.supplementCount ?? 0 }}</span>
          <span v-else-if="column.key === 'reported'" class="tabular-nums">{{ record.reportCount ?? 0 }}</span>
          <span v-else-if="column.key === 'good'" class="whitespace-nowrap tabular-nums">{{ (record.reportCount ?? 0) > 0 ? `${formatQty(record.goodQuantity)} ${stageOf(record.outputStage)?.unit ?? ''}` : '—' }}</span>
          <span v-else-if="column.key === 'team'">{{ record.team || '—' }}</span>
          <span v-else-if="column.key === 'operator'">{{ record.operatorName || '—' }}</span>
          <span v-else-if="column.key === 'issuedAt'" class="whitespace-nowrap tabular-nums">{{ formatDateTime(record.issuedAt) }}</span>
          <div v-else-if="column.key === 'actions' && canOperate" class="flex gap-1 whitespace-nowrap">
            <Button v-if="record.process !== 'MIX'" size="small" @click="openSupplement(record as Api.Order)">补领</Button>
            <Button v-if="canReturn(record as Api.Order)" size="small" @click="openReturn(record as Api.Order)">退料</Button>
            <Button size="small" type="primary" @click="emit('report', record.id)">报产出</Button>
          </div>
        </template>
      </Table>
    </section>

    <section class="flex flex-col gap-2">
      <h3 class="m-0 text-sm font-semibold">
        各工序残次率<span class="ml-2 text-xs font-normal text-muted-foreground">近 30 天已完工工序单；2% 及以上标红</span>
      </h3>
      <div class="grid grid-cols-[repeat(auto-fill,minmax(112px,1fr))] gap-2">
        <div
          v-for="s in statCards"
          :key="s.code"
          class="flex min-w-0 flex-col rounded-md border border-border px-3 py-1.5 text-xs"
        >
          <span class="text-muted-foreground">{{ s.label }}</span>
          <b
            class="text-base tabular-nums"
            :class="
              s.rate !== null && s.rate >= 0.02
                ? 'text-destructive'
                : 'text-foreground'
            "
            >{{ formatRate(s.rate) }}</b>
          <span class="text-muted-foreground">残次 {{ formatQty(s.defect) }} / 产出 {{ formatQty(s.output) }}
            {{ s.unit }}</span>
        </div>
      </div>
    </section>

    <section class="flex flex-col gap-2">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <h3 class="m-0 text-sm font-semibold">工序单</h3>
        <div class="flex flex-wrap items-center gap-2">
          <Select
            id="order-filter-process"
            v-model:value="filters.process"
            :options="processOptions"
            allow-clear
            class="w-32"
            placeholder="全部工序"
            size="small"
          />
          <Select
            id="order-filter-status"
            v-model:value="filters.status"
            :options="statusOptions"
            allow-clear
            class="w-28"
            placeholder="全部状态"
            size="small"
          />
          <Input
            id="order-filter-keyword"
            v-model:value="filters.keyword"
            allow-clear
            :style="{ width: '13rem' }"
            placeholder="单号、订单号或操作人"
            size="small"
          />
          <Button
            v-if="canOperate && options.processes.some((process) => process.code !== 'MIX')"
            size="small"
            type="primary"
            @click="emit('create')"
          >
            ＋ 新建工序单
          </Button>
        </div>
      </div>
      <Table
        aria-label="工序单"
        bordered
        v-model:expanded-row-keys="expandedKeys"
        :columns="columns"
        :data-source="rows"
        :loading="loading"
        :pagination="{
          current: pageNo,
          pageSize,
          total,
          showSizeChanger: true,
          showTotal: (t: number) => `共 ${t} 张`,
        }"
        :scroll="{ x: 'max-content' }"
        row-key="id"
        size="small"
        @change="onTableChange"
        @expand="onExpand"
      >
        <template #bodyCell="{ column, record }">
          <span v-if="column.key === 'orderNo'" class="whitespace-nowrap font-mono text-xs">{{ record.orderNo }}</span>
          <span v-else-if="column.key === 'issuedAt'" class="whitespace-nowrap tabular-nums">{{ formatDateTime(record.issuedAt) }}</span>
          <template v-else-if="column.key === 'process'">
            <div class="flex flex-wrap items-center gap-1">
              <span class="whitespace-nowrap">{{ processLabel(record.process) }}</span>
              <Tag v-if="isSkipped(record as Api.Order)" class="m-0">跳过工序</Tag>
            </div>
          </template>
          <template v-else-if="column.key === 'status'">
              <Tag :color="statusOf(record.status).color" class="m-0">
                {{ statusOf(record.status).label }}
              </Tag>
          </template>
          <template v-else-if="column.key === 'input'">
            <div class="flex flex-col items-end">
              <span class="whitespace-nowrap tabular-nums">
                {{ formatQty(record.inputQuantity) }}
                <small class="text-xs text-muted-foreground">
                  {{ stageOf(record.sourceStage)?.unit }}
                </small>
              </span>
              <span class="whitespace-nowrap text-xs text-muted-foreground">
                {{ stageOf(record.sourceStage)?.label }}
              </span>
              <span
                v-if="(materialGap(record as Api.Order) ?? 0) !== 0"
                class="whitespace-nowrap text-xs text-warning"
                :title="`领料 ${formatQty(record.inputQuantity)} − 退料 ${formatQty(record.returnedQuantity ?? 0)} − 良品 ${formatQty(record.goodQuantity)} − 残次 ${formatQty(record.defectQuantity)}`"
              >
                差额 {{ formatQty(materialGap(record as Api.Order)) }}（损耗或漏报）
              </span>
            </div>
          </template>
          <template v-else-if="column.key === 'output'">
            <div
              v-if="record.status === 'COMPLETED' || (record.reportCount ?? 0) > 0"
              class="flex flex-col items-end"
              :class="record.status === 'VOIDED' ? 'line-through opacity-60' : ''"
            >
              <span class="whitespace-nowrap tabular-nums">
                良品 {{ formatQty(record.goodQuantity) }}
                <small class="text-xs text-muted-foreground">
                  {{ stageOf(record.outputStage)?.unit }}
                </small>
              </span>
              <span
                class="whitespace-nowrap text-xs tabular-nums"
                :class="
                  (defectRate(record.goodQuantity, record.defectQuantity) ?? 0) >= 0.02
                    ? 'text-destructive'
                    : 'text-muted-foreground'
                "
              >
                残次 {{ formatQty(record.defectQuantity) }} ·
                {{ formatRate(defectRate(record.goodQuantity, record.defectQuantity)) }}
              </span>
              <span
                v-if="Number(record.productionWriteback ?? 0) > 0"
                class="whitespace-nowrap text-xs text-primary"
              >
                回写合同 {{ formatQty(record.productionWriteback) }}
              </span>
            </div>
            <span v-else class="text-xs text-muted-foreground">{{
              record.status === 'VOIDED' ? '—' : '未报产出'
            }}</span>
          </template>
          <template v-else-if="column.key === 'contract'">
            <span v-if="record.contractCode" class="font-mono text-xs">
              {{ record.contractCode }}
            </span>
            <span v-else class="text-muted-foreground">—</span>
          </template>
          <span v-else-if="column.key === 'team'">{{ record.team || '—' }}</span>
          <span v-else-if="column.key === 'operator'">{{ record.operatorName || '—' }}</span>
          <template v-else-if="column.key === 'actions'">
            <span class="flex justify-end gap-2 whitespace-nowrap text-xs">
              <button
                v-if="record.status !== 'VOIDED' && ((record.reportCount ?? 0) > 0 || record.status === 'COMPLETED')"
                type="button"
                class="text-primary hover:underline"
                @click="openCorrection(record as Api.Order)"
              >
                报工记录与更正
              </button>
              <button
                v-if="canOperate && record.status === 'IN_PROGRESS'"
                type="button"
                class="text-primary hover:underline"
                @click="emit('report', record.id)"
              >
                报产出
              </button>
              <button
                v-if="canOperate && record.status === 'IN_PROGRESS' && record.process !== 'MIX'"
                type="button"
                class="text-primary hover:underline"
                @click="openSupplement(record as Api.Order)"
              >
                补领
              </button>
              <button
                v-if="canOperate && record.status === 'IN_PROGRESS' && canReturn(record as Api.Order)"
                type="button"
                class="text-primary hover:underline"
                @click="openReturn(record as Api.Order)"
              >
                退料
              </button>
              <button
                v-if="canOperate && record.lateSupplementable && record.process !== 'MIX'"
                type="button"
                class="text-primary hover:underline"
                title="完工当月或次月，补登实际使用但漏记的领料"
                @click="openSupplement(record as Api.Order)"
              >
                补登领料
              </button>
              <button
                v-if="canOperate && record.status === 'COMPLETED' && record.lateSupplementable && Number(record.inputQuantity ?? 0) > Number(record.returnedQuantity ?? 0)"
                type="button"
                class="text-primary hover:underline"
                title="完工当月或次月，补登实际未使用而多记的领料"
                @click="openReturn(record as Api.Order)"
              >
                补登退料
              </button>
              <button
                v-if="canVoid && voidable(record as Api.Order)"
                type="button"
                class="text-destructive hover:underline"
                @click="openVoid(record as Api.Order)"
              >
                作废
              </button>
            </span>
          </template>
        </template>
        <template #expandedRowRender="{ record }">
          <Spin :spinning="!details[record.id]">
            <div
              v-if="details[record.id]"
              class="flex flex-col gap-4 py-1 text-xs"
            >
              <div class="min-w-0">
                <h4 class="m-0 mb-1 text-sm font-semibold">
                  {{ record.process === 'MIX' && !details[record.id]!.inputs?.length ? '发泡预计用料' : `领料（扣${stageOf(record.sourceStage)?.label}库存）` }}
                  <span
                    v-if="details[record.id]!.recipeCode"
                    class="ml-1 text-xs font-normal text-muted-foreground"
                  >按配方 {{ details[record.id]!.recipeName || details[record.id]!.recipeCode }} ×
                    {{ formatQty(details[record.id]!.recipeBatches) }} 锅</span>
                </h4>
                <div v-if="details[record.id]!.inputs?.length" class="overflow-x-auto">
                  <table aria-label="领料明细" class="order-detail-table">
                    <thead>
                      <tr>
                        <th scope="col">领料记录</th>
                        <th scope="col">物料编码</th>
                        <th scope="col">规格</th>
                        <th scope="col">批次</th>
                        <th scope="col" class="text-right">领料数量</th>
                        <th scope="col" class="text-right">已退数量</th>
                        <th scope="col">用料面</th>
                        <th scope="col">补领登记</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr v-for="line in details[record.id]!.inputs" :key="line.id">
                        <td class="whitespace-nowrap">{{ issueSeqLabel(line.issueSeq) || '领料' }}</td>
                        <td class="font-mono">{{ line.itemCode }}</td>
                        <td>{{ attrSummary(line.stage, line.item, labels) }}</td>
                        <td class="font-mono">{{ line.batchNo }}</td>
                        <td class="whitespace-nowrap text-right tabular-nums">{{ formatQty(line.quantity) }} {{ stageOf(line.stage)?.unit }}</td>
                        <td class="whitespace-nowrap text-right tabular-nums">{{ formatQty(line.returnedQuantity ?? 0) }} {{ stageOf(line.stage)?.unit }}</td>
                        <td class="whitespace-nowrap">{{ line.laminationSide ? (line.laminationSide === 'FRONT' ? '正面' : '反面') : '—' }}</td>
                        <td>{{ (line.issueSeq ?? 0) > 0 ? [line.issuedBy, line.issueRemark].filter(Boolean).join(' · ') || '—' : '—' }}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <div v-if="details[record.id]!.recipeLines?.length" class="mt-2 overflow-x-auto">
                  <table aria-label="配方用料明细" class="order-detail-table">
                    <thead>
                      <tr>
                        <th scope="col">配方原料</th>
                        <th scope="col" class="text-right">已领 (kg)</th>
                        <th scope="col" class="text-right">应领 (kg)</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr v-for="r in details[record.id]!.recipeLines" :key="r.rawMaterialCode" :class="{ 'text-warning': Number(r.remaining) > 0 }">
                        <td>{{ r.rawMaterialName || r.rawMaterialCode }}</td>
                        <td class="text-right tabular-nums">{{ formatQty(r.issued) }}</td>
                        <td class="text-right tabular-nums">{{ r.required == null ? '配方外' : formatQty(r.required) }}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
              <div class="min-w-0">
                <h4 class="m-0 mb-1 text-sm font-semibold">
                  产出（入{{ stageOf(record.outputStage)?.label }}库存）
                </h4>
                <div v-if="details[record.id]!.outputs?.length" class="overflow-x-auto">
                  <table aria-label="产出明细" class="order-detail-table">
                    <thead>
                      <tr>
                        <th scope="col">报工批次</th>
                        <th scope="col">物料编码</th>
                        <th scope="col">规格</th>
                        <th scope="col">物料批次</th>
                        <th scope="col" class="text-right">良品</th>
                        <th scope="col" class="text-right">残次</th>
                        <th scope="col" class="text-right">冻结数量</th>
                        <th v-if="canOperate" scope="col">操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr v-for="line in details[record.id]!.outputs" :key="line.id">
                        <td class="whitespace-nowrap">第 {{ line.reportSeq ?? 1 }} 次</td>
                        <td class="font-mono">{{ line.itemCode }}</td>
                        <td>{{ attrSummary(line.stage, line.item, labels) }}</td>
                        <td class="font-mono">{{ line.batchNo }}</td>
                        <td class="whitespace-nowrap text-right tabular-nums">{{ formatQty(line.goodQuantity) }} {{ stageOf(line.stage)?.unit }}</td>
                        <td class="text-right tabular-nums">
                          <template v-if="line.frontDefectQuantity != null && line.backDefectQuantity != null">
                            <span class="block whitespace-nowrap">正面 {{ labels.color(line.item?.frontColor) }} {{ formatQty(line.frontDefectQuantity) }} 片</span>
                            <span class="block whitespace-nowrap">反面 {{ labels.color(line.item?.backColor) }} {{ formatQty(line.backDefectQuantity) }} 片</span>
                          </template>
                          <span v-else class="whitespace-nowrap">{{ formatQty(line.defectQuantity) }} {{ stageOf(line.stage)?.unit }}</span>
                        </td>
                        <td class="text-right tabular-nums">{{ formatQty(held[record.id]?.[line.id]) }}</td>
                        <td v-if="canOperate">
                          <Button
                            v-if="record.status !== 'VOIDED' && Number(line.goodQuantity ?? 0) > 0"
                            size="small"
                            type="link"
                            @click="openHold(details[record.id]!, line)"
                          >
                            冻结
                          </Button>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <p v-else class="m-0 text-muted-foreground">还没报产出。</p>
              </div>
              <div v-if="record.remark">
                <b class="mr-2">备注</b>{{ record.remark }}
              </div>
              <div v-if="record.issueSheetUrls" class="flex flex-wrap items-start gap-2">
                <b class="mr-2">领料单</b>
                <Image.PreviewGroup>
                  <Image
                    v-for="url in record.issueSheetUrls.split(',')"
                    :key="url"
                    :src="url"
                    :width="72"
                    alt="纸质领料单照片"
                    class="rounded border border-border object-cover"
                  />
                </Image.PreviewGroup>
              </div>
              <div
                v-if="record.status === 'VOIDED'"
                class="text-muted-foreground"
              >
                <b class="mr-2 text-foreground">已作废</b>{{ record.voidReason }} ·
                {{ record.voidedBy }} · {{ formatDateTime(record.voidedAt) }}
              </div>
            </div>
          </Spin>
        </template>
      </Table>
    </section>
      <ReturnModal
      v-model:open="returnOpen"
      :options="options"
      :order-id="returnOrderId"
      @saved="onAdjusted"
    />
    <SupplementModal
      v-model:open="supplementOpen"
      :options="options"
      :order-id="supplementOrderId"
      @saved="onAdjusted"
    />
    <VoidModal v-model:open="voidOpen" :order="voidTarget" @saved="onAdjusted" />
    <ReportCorrectionDialog
      v-model:open="correctionOpen"
      :order-id="correctionOrder?.id"
      :order-no="correctionOrder?.orderNo"
      :unit="stageOf(correctionOrder?.outputStage)?.unit"
      @saved="emit('changed')"
    />
    <HoldModal
      v-model:open="holdOpen"
      :held="holdLine ? held[holdOrder?.id ?? 0]?.[holdLine.id] : undefined"
      :line="holdLine"
      :order-no="holdOrder?.orderNo"
      :unit="stageOf(holdLine?.stage)?.unit"
      @saved="onHeld"
    />
  </div>
</template>

<style scoped>
.order-detail-table {
  width: 100%;
  text-align: left;
  border-collapse: collapse;
}

.order-detail-table th,
.order-detail-table td {
  padding: 6px 8px;
  border: 1px solid hsl(var(--border));
}

.order-detail-table th {
  white-space: nowrap;
  background: hsl(var(--muted));
}
</style>
