<script setup lang="ts">
import type { TablePaginationConfig } from 'ant-design-vue';

import type { FdmgongchangStageStockApi as Api } from '#/api/fdmgongchang/stage-stock';

import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue';

import { useAccess } from '@vben/access';
import { formatDateTime } from '@vben/utils';

import { Button, Input, message, Select, Spin, Table, Tag } from 'ant-design-vue';

import {
  getDefectStats,
  getOrder,
  getOrderPage,
} from '#/api/fdmgongchang/stage-stock';

import {
  attrSummary,
  defectRate,
  formatQty,
  formatRate,
  makeLabels,
} from '../model';
import ReturnModal from './return-modal.vue';
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
const voidOpen = ref(false);
const voidTarget = ref<Api.Order>();

function openReturn(order: Api.Order) {
  returnOrderId.value = order.id;
  returnOpen.value = true;
}

function openVoid(order: Api.Order) {
  voidTarget.value = order;
  voidOpen.value = true;
}

function onAdjusted(text: string) {
  message.success(text);
  emit('changed');
}

/** 已回写合同生产进度的单不能作废。 */
const voidable = (order: Api.Order) =>
  order.status !== 'VOIDED' && Number(order.productionWriteback ?? 0) <= 0;

const labels = computed(() => makeLabels(props.options));
const processLabel = (code?: string) =>
  props.options.processes.find((p) => p.code === code)?.label ?? code ?? '';
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
  if (expanded && !details.value[record.id])
    details.value = {
      ...details.value,
      [record.id]: await getOrder(record.id),
    };
}

const columns = [
  { key: 'orderNo', title: '单号 / 领料时间' },
  { key: 'process', title: '工序' },
  { align: 'right' as const, key: 'input', title: '领料' },
  { align: 'right' as const, key: 'output', title: '产出' },
  { key: 'contract', title: '关联订单' },
  { key: 'people', title: '班组 · 操作人' },
  { align: 'right' as const, key: 'actions', title: '', width: 120 },
];

const statusOptions = [
  { label: '在制', value: 'IN_PROGRESS' },
  { label: '已完工', value: 'COMPLETED' },
  { label: '已作废', value: 'VOIDED' },
];
const processOptions = computed(() =>
  props.options.processes.map((p) => ({ label: p.label, value: p.code })),
);

function isSkipped(order: Api.Order) {
  const option = props.options.processes.find((p) => p.code === order.process);
  return option
    ? option.allowedSources[0] !== order.sourceStage && order.process !== 'MIX'
    : false;
}

const statCards = computed(() =>
  props.options.processes.map((p) => {
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
      <div class="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-2">
        <div
          v-for="o in inProgress"
          :key="o.id"
          class="flex flex-col gap-1.5 rounded-md border border-border p-3"
        >
          <div class="flex items-center justify-between gap-2">
            <span class="font-mono text-xs">{{ o.orderNo }}</span>
            <Tag color="orange">{{ processLabel(o.process) }} · 在制</Tag>
          </div>
          <div class="text-sm">
            已领 <b class="tabular-nums">{{ formatQty(o.inputQuantity) }}</b>
            {{ stageOf(o.sourceStage)?.unit }}
            {{ stageOf(o.sourceStage)?.label }}
            <span
              v-if="Number(o.returnedQuantity ?? 0) > 0"
              class="text-xs text-muted-foreground"
            >（已退 {{ formatQty(o.returnedQuantity) }}）</span>
          </div>
          <div
            v-if="(o.reportCount ?? 0) > 0"
            class="text-xs text-muted-foreground"
          >
            已报 {{ o.reportCount }} 次，良品
            {{ formatQty(o.goodQuantity) }}
            {{ stageOf(o.outputStage)?.unit }}
          </div>
          <div
            class="flex items-center justify-between gap-2 text-xs text-muted-foreground"
          >
            <span>{{ [o.team, o.operatorName].filter(Boolean).join(' · ') }} ·
              {{ formatDateTime(o.issuedAt) }}</span>
            <span v-if="canOperate" class="flex gap-1">
              <Button size="small" @click="openReturn(o)">退料</Button>
              <Button size="small" type="primary" @click="emit('report', o.id)">
                报产出
              </Button>
            </span>
          </div>
        </div>
      </div>
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
            class="w-52"
            placeholder="单号、订单号或操作人"
            size="small"
          />
          <Button
            v-if="canOperate"
            size="small"
            type="primary"
            @click="emit('create')"
          >
            ＋ 新建工序单
          </Button>
        </div>
      </div>
      <Table
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
          <template v-if="column.key === 'orderNo'">
            <div class="flex flex-col">
              <span class="font-mono text-xs">{{ record.orderNo }}</span>
              <span class="whitespace-nowrap text-xs text-muted-foreground">
                {{ formatDateTime(record.issuedAt) }}
              </span>
            </div>
          </template>
          <template v-else-if="column.key === 'process'">
            <div class="flex flex-wrap items-center gap-1">
              <span class="whitespace-nowrap">{{ processLabel(record.process) }}</span>
              <Tag :color="statusOf(record.status).color" class="m-0">
                {{ statusOf(record.status).label }}
              </Tag>
              <Tag v-if="isSkipped(record as Api.Order)" class="m-0">跳过工序</Tag>
            </div>
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
          <template v-else-if="column.key === 'people'">
            <span class="text-xs">
              {{ [record.team, record.operatorName].filter(Boolean).join(' · ') || '—' }}
            </span>
          </template>
          <template v-else-if="column.key === 'actions'">
            <span class="flex justify-end gap-2 whitespace-nowrap text-xs">
              <button
                v-if="canOperate && record.status === 'IN_PROGRESS'"
                type="button"
                class="text-primary hover:underline"
                @click="emit('report', record.id)"
              >
                报产出
              </button>
              <button
                v-if="canOperate && record.status === 'IN_PROGRESS'"
                type="button"
                class="text-primary hover:underline"
                @click="openReturn(record as Api.Order)"
              >
                退料
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
              class="grid grid-cols-1 gap-4 py-1 text-xs md:grid-cols-2"
            >
              <div>
                <h4 class="m-0 mb-1 text-sm font-semibold">
                  领料（扣{{ stageOf(record.sourceStage)?.label }}库存）
                </h4>
                <ul class="m-0 flex list-disc flex-col gap-1 pl-4">
                  <li v-for="line in details[record.id]!.inputs" :key="line.id">
                    <span class="font-mono">{{ line.itemCode }}</span>
                    <span class="ml-2">{{
                      attrSummary(line.stage, line.item, labels)
                    }}</span>
                    <span class="ml-2 text-muted-foreground">批次
                      <span class="font-mono">{{ line.batchNo }}</span></span>
                    <b class="ml-2 tabular-nums">{{ formatQty(line.quantity) }}
                      {{ stageOf(line.stage)?.unit }}</b>
                    <span
                      v-if="Number(line.returnedQuantity ?? 0) > 0"
                      class="ml-1 text-muted-foreground"
                    >已退 {{ formatQty(line.returnedQuantity) }}</span>
                    <Tag v-if="line.laminationSide" class="ml-1">
                      {{ line.laminationSide === 'FRONT' ? '正面' : '反面' }}
                    </Tag>
                  </li>
                </ul>
              </div>
              <div>
                <h4 class="m-0 mb-1 text-sm font-semibold">
                  产出（入{{ stageOf(record.outputStage)?.label }}库存）
                </h4>
                <ul
                  v-if="(details[record.id]!.outputs ?? []).length > 0"
                  class="m-0 flex list-disc flex-col gap-1 pl-4"
                >
                  <li
                    v-for="line in details[record.id]!.outputs"
                    :key="line.id"
                  >
                    <Tag
                      v-if="(details[record.id]!.reportCount ?? 0) > 1"
                      class="mr-1"
                    >
                      第 {{ line.reportSeq ?? 1 }} 次
                    </Tag>
                    <span class="font-mono">{{ line.itemCode }}</span>
                    <span class="ml-2">{{
                      attrSummary(line.stage, line.item, labels)
                    }}</span>
                    <span class="ml-2 text-muted-foreground">批次
                      <span class="font-mono">{{ line.batchNo }}</span></span>
                    <span class="ml-2">良品
                      <b class="tabular-nums">{{
                        formatQty(line.goodQuantity)
                      }}</b></span>
                    <span class="ml-2">残次
                      <b class="tabular-nums">{{
                        formatQty(line.defectQuantity)
                      }}</b>
                      {{ stageOf(line.stage)?.unit }}</span>
                  </li>
                </ul>
                <p v-else class="m-0 text-muted-foreground">还没报产出。</p>
              </div>
              <div v-if="record.remark" class="md:col-span-2">
                <b class="mr-2">备注</b>{{ record.remark }}
              </div>
              <div
                v-if="record.status === 'VOIDED'"
                class="text-muted-foreground md:col-span-2"
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
    <VoidModal v-model:open="voidOpen" :order="voidTarget" @saved="onAdjusted" />
  </div>
</template>
