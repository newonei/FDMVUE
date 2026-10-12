<script setup lang="ts">
import type { InputLine } from '../model';

import type { FdmgongchangStageStockApi as Api } from '#/api/fdmgongchang/stage-stock';

import { computed, ref, watch } from 'vue';

import {
  Alert,
  Button,
  Empty,
  Input,
  InputNumber,
  Modal,
  Select,
  Spin,
  Table,
} from 'ant-design-vue';

import {
  getOrder,
  getRecipePlan,
  getStockPage,
  supplementOrder,
} from '#/api/fdmgongchang/stage-stock';

import {
  attrSummary,
  formatQty,
  makeLabels,
  recipeCheck,
  recipePicks,
  sumQty,
  toNumber,
} from '../model';

/**
 * 在制工序单补领：生产过程中发现领少了，从同一段库存再领，一次可以补多种料。
 * 按配方领料的密炼单会列出每种原料还差多少，可以一键按配方补齐。
 */
const props = defineProps<{ options: Api.Options; orderId?: number }>();
const emit = defineEmits<{ saved: [message: string] }>();
const open = defineModel<boolean>('open', { required: true });

const order = ref<Api.Order>();
const plan = ref<Api.RecipePlan>();
const loading = ref(false);
const submitting = ref(false);
const stockRows = ref<Api.Stock[]>([]);
const stockTotal = ref(0);
const stockLoading = ref(false);
const keyword = ref('');
const quantities = ref<Record<number, null | number>>({});
const sides = ref<Record<number, Api.LaminationSide>>({});
/** 已填数量的库存行，换搜索后仍保留。 */
const picked = ref<Record<number, Api.Stock>>({});
const remark = ref('');
const errors = ref<string[]>([]);

const labels = computed(() => makeLabels(props.options));
const stageOf = (code?: string) =>
  props.options.stages.find((s) => s.code === code);
const source = computed(() => stageOf(order.value?.sourceStage));
const laminate = computed(() => order.value?.process === 'LAMINATE');
const processLabel = computed(
  () =>
    props.options.processes.find((p) => p.code === order.value?.process)
      ?.label ?? '',
);

const lines = computed<InputLine[]>(() =>
  Object.values(picked.value)
    .filter((stock) => (quantities.value[stock.id] ?? 0) > 0)
    .map((stock) => ({
      quantity: quantities.value[stock.id]!,
      side: sides.value[stock.id],
      stock,
    })),
);
const total = computed(() => sumQty(lines.value.map((l) => l.quantity)));
const checks = computed(() => recipeCheck(plan.value, lines.value, true));

watch(open, async (value) => {
  if (!value || !props.orderId) return;
  quantities.value = {};
  sides.value = {};
  picked.value = {};
  remark.value = '';
  errors.value = [];
  keyword.value = '';
  plan.value = undefined;
  loading.value = true;
  try {
    order.value = await getOrder(props.orderId);
    if (order.value.recipeCode) {
      plan.value = await getRecipePlan({ orderId: order.value.id }).catch(
        () => undefined,
      );
    }
    await loadStock();
  } finally {
    loading.value = false;
  }
});

async function loadStock() {
  if (!order.value) return;
  stockLoading.value = true;
  try {
    const page = await getStockPage({
      keyword: keyword.value.trim() || undefined,
      pageNo: 1,
      pageSize: 200,
      stage: order.value.sourceStage,
    });
    stockRows.value = page.list;
    stockTotal.value = page.total;
  } finally {
    stockLoading.value = false;
  }
}

let searchTimer: ReturnType<typeof setTimeout> | undefined;
watch(keyword, () => {
  if (!open.value) return;
  clearTimeout(searchTimer);
  searchTimer = setTimeout(loadStock, 300);
});

const visibleStock = computed(() => {
  const ids = new Set(stockRows.value.map((s) => s.id));
  const extra = Object.values(picked.value).filter((s) => !ids.has(s.id));
  return [...extra, ...stockRows.value];
});

function setQuantity(stock: Api.Stock, value: null | number) {
  quantities.value[stock.id] = value;
  if (value && value > 0) {
    picked.value[stock.id] = stock;
    if (laminate.value && !sides.value[stock.id]) sides.value[stock.id] = 'FRONT';
  }
}

/** 按配方把还差的料填进去（先进先出），已填的会被覆盖。 */
function fillFromRecipe() {
  if (!plan.value) return;
  quantities.value = {};
  picked.value = {};
  for (const line of recipePicks(plan.value)) {
    const stock =
      stockRows.value.find((s) => s.id === line.stock.id) ??
      (line.stock as Api.Stock);
    picked.value[stock.id] = stock;
    quantities.value[stock.id] = line.quantity;
  }
}

const columns = computed(() => [
  { key: 'itemCode', title: '编码' },
  { key: 'attrs', title: '属性' },
  { key: 'batchNo', title: '批次' },
  { align: 'right' as const, key: 'available', title: '可用' },
  { align: 'right' as const, key: 'take', title: '补领数量', width: 140 },
  ...(laminate.value ? [{ key: 'side', title: '贴合面', width: 100 }] : []),
]);

async function submit() {
  errors.value = [];
  if (lines.value.length === 0) errors.value.push('请至少填写一行补领数量。');
  for (const line of lines.value) {
    if (line.quantity > (toNumber(line.stock.quantity) ?? 0))
      errors.value.push(
        `${line.stock.itemCode}（批次 ${line.stock.batchNo}）只剩 ${formatQty(line.stock.quantity)}，补领数量不能超过库存。`,
      );
    if (laminate.value && !line.side)
      errors.value.push(`${line.stock.itemCode} 请选择是正面还是反面片材。`);
  }
  if (errors.value.length > 0 || !order.value) return;
  submitting.value = true;
  try {
    await supplementOrder({
      id: order.value.id,
      inputs: lines.value.map((l) => ({
        laminationSide: laminate.value ? l.side : undefined,
        quantity: l.quantity,
        stockId: l.stock.id,
      })),
      remark: remark.value.trim() || undefined,
    });
    emit(
      'saved',
      `${order.value.orderNo} 已补领 ${lines.value.length} 种料，共 ${formatQty(total.value)} ${source.value?.unit ?? ''}`,
    );
    open.value = false;
  } catch {
    // 后端错误已由全局提示展示
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <Modal
    v-model:open="open"
    :confirm-loading="submitting"
    :title="`补领 · ${order?.orderNo ?? ''}`"
    :width="860"
    ok-text="确认补领"
    @ok="submit"
  >
    <Spin :spinning="loading">
      <div class="flex flex-col gap-3">
        <p class="m-0 text-xs text-muted-foreground">
          {{ processLabel }}生产中领少了，从{{ source?.label }}库存再领，提交后立即扣库存；单子继续在制。
          一次可以补多种料，补领单独记一行，之后也能退回。
        </p>

        <section
          v-if="order?.recipeCode"
          class="flex flex-col gap-2 rounded-md border border-border p-3 text-xs"
        >
          <div class="flex flex-wrap items-center justify-between gap-2">
            <span>
              按配方
              <b class="text-sm">{{ order.recipeName || order.recipeCode }}</b>
              × {{ formatQty(order.recipeBatches) }} 锅领料
            </span>
            <Button
              v-if="plan"
              size="small"
              :disabled="!plan.lines.some((l) => l.picks.length > 0)"
              @click="fillFromRecipe"
            >
              按配方补齐还差的
            </Button>
          </div>
          <table v-if="plan" class="w-full border-collapse tabular-nums">
            <thead>
              <tr class="text-left text-muted-foreground">
                <th class="py-1 font-normal">原料</th>
                <th class="py-1 text-right font-normal">应领</th>
                <th class="py-1 text-right font-normal">已领</th>
                <th class="py-1 text-right font-normal">还差</th>
                <th class="py-1 text-right font-normal">这次补</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="line in plan.lines"
                :key="line.rawMaterialCode"
                class="border-t border-border"
              >
                <td class="py-1">
                  {{ line.rawMaterialName || line.rawMaterialCode }}
                  <span v-if="line.required == null" class="text-muted-foreground">（配方外）</span>
                </td>
                <td class="py-1 text-right">
                  {{ line.required == null ? '—' : formatQty(line.required) }}
                </td>
                <td class="py-1 text-right">{{ formatQty(line.issued) }}</td>
                <td
                  class="py-1 text-right"
                  :class="Number(line.remaining) > 0 ? 'font-semibold text-warning' : 'text-muted-foreground'"
                >
                  {{ formatQty(line.remaining) }}
                  <span v-if="Number(line.shortage) > 0" class="text-destructive">（库存缺 {{ formatQty(line.shortage) }}）</span>
                </td>
                <td class="py-1 text-right">
                  {{ formatQty(checks.find((c) => c.code === line.rawMaterialCode)?.filled ?? 0) }}
                </td>
              </tr>
            </tbody>
          </table>
          <span v-else class="text-muted-foreground">配方已停用或删除，按库存手动补领。</span>
        </section>

        <div class="flex flex-wrap items-center gap-3">
          <Input
            id="supplement-stock-search"
            v-model:value="keyword"
            allow-clear
            :style="{ width: '13rem' }"
            placeholder="搜编码或批次"
            size="small"
          />
          <span v-if="stockTotal > 200" class="text-xs text-muted-foreground">共 {{ stockTotal }} 行，只显示前 200 行，请用搜索缩小范围</span>
        </div>
        <Table
          :columns="columns"
          :data-source="visibleStock"
          :loading="stockLoading"
          :pagination="false"
          :scroll="{ x: 'max-content', y: 280 }"
          row-key="id"
          size="small"
        >
          <template #bodyCell="{ column, record }">
            <template v-if="column.key === 'itemCode'">
              <span class="font-mono text-xs">{{ record.itemCode }}</span>
            </template>
            <template v-else-if="column.key === 'attrs'">
              <span class="text-xs">{{ attrSummary(record.stage, record.item, labels) }}</span>
            </template>
            <template v-else-if="column.key === 'batchNo'">
              <span class="font-mono text-xs">{{ record.batchNo }}</span>
            </template>
            <template v-else-if="column.key === 'available'">
              <span class="tabular-nums">{{ formatQty(record.quantity) }}</span>
              <span class="ml-1 text-xs text-muted-foreground">{{ source?.unit }}</span>
            </template>
            <template v-else-if="column.key === 'take'">
              <InputNumber
                :id="`supplement-take-${record.id}`"
                :value="quantities[record.id] ?? undefined"
                :aria-label="`${record.itemCode} 补领数量`"
                :max="Number(record.quantity)"
                :min="0"
                :precision="3"
                :style="{ width: '7rem' }"
                size="small"
                @change="
                  (v) =>
                    setQuantity(
                      record as Api.Stock,
                      (v as null | number | undefined) ?? null,
                    )
                "
              />
            </template>
            <template v-else-if="column.key === 'side'">
              <Select
                :id="`supplement-side-${record.id}`"
                :value="sides[record.id]"
                :disabled="!(quantities[record.id] ?? 0)"
                :options="[
                  { value: 'FRONT', label: '正面' },
                  { value: 'BACK', label: '反面' },
                ]"
                aria-label="贴合面"
                class="w-20"
                size="small"
                @change="(v) => (sides[record.id] = v as Api.LaminationSide)"
              />
            </template>
          </template>
          <template #emptyText>
            <Empty :description="`${source?.label ?? ''}没有可用库存`" />
          </template>
        </Table>
        <div v-if="lines.length > 0" class="text-xs">
          这次补领 <b>{{ lines.length }}</b> 行，共
          <b class="tabular-nums">{{ formatQty(total) }}</b> {{ source?.unit }}
        </div>
        <label for="supplement-remark" class="flex flex-col gap-1 text-xs text-muted-foreground">
          补领原因
          <Input id="supplement-remark" v-model:value="remark" :maxlength="200" placeholder="选填，例如 色母不够、损耗" />
        </label>
        <Alert v-if="errors.length > 0" type="error" show-icon>
          <template #message>
            <ul class="m-0 list-disc pl-4">
              <li v-for="e in errors" :key="e">{{ e }}</li>
            </ul>
          </template>
        </Alert>
      </div>
    </Spin>
  </Modal>
</template>
