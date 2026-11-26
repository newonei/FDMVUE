<script setup lang="ts">
import type { ShortageDispatchSeed } from '../../shared/schedule';

import type { FdmgongchangOrderSplitApi as Api } from '#/api/fdmgongchang/schedule';

import { computed, nextTick, ref, watch } from 'vue';

import { Alert, Button, InputNumber, message, Spin, Tag } from 'ant-design-vue';

import { previewOrderSplit, releaseOrderSplit } from '#/api/fdmgongchang/schedule';
import { newIdempotencyKey } from '#/api/fdmplatform';

import { num } from '../../production-order/shared';
import { businessError } from '../../shared/business-error';
import FactoryDialog from '../../shared/factory-dialog.vue';
import { materialText, PROCESS_LABELS } from '../../shared/schedule';
import { formatQty } from '../../stage-stock/model';

const props = defineProps<{ factoryId?: null | number; seed: ShortageDispatchSeed }>();
const emit = defineEmits<{ released: [id: number] }>();
const open = defineModel<boolean>('open', { required: true });

const catalog = ref<Api.Preview>();
const preview = ref<Api.Preview>();
const picks = ref<Record<number, number>>({});
const previewHeading = ref<HTMLElement>();
const loading = ref(false);
const previewing = ref(false);
const submitting = ref(false);
const loadError = ref('');
const previewError = ref('');
const releaseError = ref('');
const releaseRequest = ref<Api.ReleaseRequest>();
let version = 0;

const shortage = computed(() => catalog.value?.shortage);
const hasShortage = computed(() => num(shortage.value?.netGoodShortage) > 0);
const line = computed(() => catalog.value?.rows.find((row) => row.itemId === props.seed.itemId));
const productName = computed(() => line.value?.productName || props.seed.productName || `订单明细 #${props.seed.itemId}`);
const productCode = computed(() => line.value?.productCode || props.seed.productCode);
const unit = computed(() => line.value?.orderUnit || props.seed.unit || '成品');
const candidates = computed(() => (catalog.value?.stockCandidates ?? []).filter((stock) =>
  stock.itemId === props.seed.itemId && !stock.deliverable && ['BOARD', 'CUT', 'SHEET'].includes(stock.stage)));
const groups = computed(() => [
  {
    title: '优先选用匹配片材',
    candidates: candidates.value.filter((stock) => stock.stage === 'CUT' || stock.stage === 'SHEET')
      .toSorted((a, b) => Number(b.stage === 'CUT') - Number(a.stage === 'CUT')),
    empty: '暂无可用的匹配片材。',
  },
  {
    title: '片材不足时选用板材',
    candidates: candidates.value.filter((stock) => stock.stage === 'BOARD'),
    empty: '暂无可用的匹配板材。',
  },
]);
const busy = computed(() => loading.value || previewing.value || submitting.value);
const selection = computed<Api.StockSelection[]>(() => Object.entries(picks.value)
  .filter(([, quantity]) => quantity !== 0)
  .map(([id, quantity]) => ({ itemId: props.seed.itemId, stockId: Number(id), quantity })));
const invalidStock = computed(() => selection.value.some(({ stockId, quantity }) => {
  const batch = candidates.value.find((stock) => stock.stockId === stockId);
  const count = Number(quantity);
  return !batch || !Number.isInteger(count) || count <= 0 || count > num(batch.available);
}));
const canPreview = computed(() => !busy.value && hasShortage.value && selection.value.length > 0 && !invalidStock.value);
const canRelease = computed(() => !busy.value && !invalidStock.value && !!preview.value?.canRelease
  && preview.value.taskCount > 0 && preview.value.errors.length === 0 && !!releaseRequest.value
  && !preview.value.rows.some((row) => row.status === 'BLOCKED'));
const coverage = computed(() => preview.value?.stockCoverage?.find((stock) => stock.itemId === props.seed.itemId));
const sideLabels = { BACK: '反面层', BOTH: '正反两面', FRONT: '正面层' };

function processLabel(process: string) {
  return PROCESS_LABELS[process] || process;
}

function changeSelection() {
  preview.value = undefined;
  previewError.value = '';
  releaseError.value = '';
  releaseRequest.value = undefined;
}

function applySuggestions() {
  picks.value = Object.fromEntries((catalog.value?.suggestedStockSelections ?? [])
    .filter((suggestion) => suggestion.itemId === props.seed.itemId)
    .map(({ stockId, quantity }) => [stockId, num(quantity)]));
  changeSelection();
}

function changeQuantity(stockId: number, quantity: null | number | string) {
  const count = quantity === null ? 0 : Number(quantity);
  if ((picks.value[stockId] ?? 0) === count) return;
  picks.value = { ...picks.value, [stockId]: count };
  changeSelection();
}

async function load() {
  const current = ++version;
  loading.value = true;
  previewing.value = false;
  submitting.value = false;
  catalog.value = undefined;
  picks.value = {};
  loadError.value = '';
  changeSelection();
  try {
    const result = await previewOrderSplit([props.seed.orderId], [], props.seed.itemId);
    if (current !== version || !open.value) return;
    catalog.value = result;
    applySuggestions();
  } catch {
    if (current === version) loadError.value = '补派工资料加载失败，请重试。';
  } finally {
    if (current === version) loading.value = false;
  }
}

watch([open, () => props.factoryId, () => props.seed.orderId, () => props.seed.itemId], ([isOpen]) => {
  if (isOpen) void load();
  else ++version;
}, { immediate: true });

async function prepare() {
  if (!canPreview.value) return;
  const current = ++version;
  const productionOrderIds = [props.seed.orderId];
  const shortageItemId = props.seed.itemId;
  const stockSelections = selection.value;
  changeSelection();
  previewing.value = true;
  try {
    const result = await previewOrderSplit(productionOrderIds, stockSelections, shortageItemId);
    if (current !== version || !open.value) return;
    catalog.value = result;
    preview.value = result;
    releaseRequest.value = {
      productionOrderIds,
      shortageItemId,
      stockSelections,
      previewKey: result.previewKey,
      requestId: newIdempotencyKey(),
    };
    await nextTick();
    previewHeading.value?.focus({ preventScroll: true });
    previewHeading.value?.scrollIntoView?.({ block: 'nearest' });
  } catch {
    if (current === version) previewError.value = '工序预览加载失败，当前批次选择已保留，请重试。';
  } finally {
    if (current === version) previewing.value = false;
  }
}

async function release() {
  if (!canRelease.value || !releaseRequest.value) return;
  const current = version;
  submitting.value = true;
  releaseError.value = '';
  try {
    const result = await releaseOrderSplit(releaseRequest.value);
    if (current !== version || !open.value) return;
    message.success(`已下发 ${result.tasks} 道补产工序任务`);
    if (result.warnings?.length) message.warning(result.warnings.join('；'));
    open.value = false;
    emit('released', result.scheduleId);
  } catch (error) {
    if (current !== version) return;
    const { code, msg } = businessError(error);
    if (code >= 1_000_000_000 || /预览过期|重新预览/.test(msg)) {
      changeSelection();
      releaseError.value = `${msg}。请重新预览工序。`;
    } else {
      releaseError.value = '暂未收到下发结果。可再次确认，系统会沿用本次提交编号。';
    }
  } finally {
    if (current === version) submitting.value = false;
  }
}
</script>

<template>
  <FactoryDialog
    v-model:open="open"
    :busy="submitting"
    :title="`补派工 · ${seed.orderNo}`"
    :width="1360"
    :z-index="2100"
  >
    <div aria-label="补派工表单" class="space-y-5">
      <div v-if="loading" class="flex items-center gap-3 py-6" role="status">
        <Spin size="small" /> 正在核算良品缺口和匹配库存…
      </div>
      <Alert v-else-if="loadError" :message="loadError" show-icon type="warning">
        <template #action><Button @click="load">重试</Button></template>
      </Alert>
      <template v-else-if="catalog">
        <section v-if="shortage" class="rounded-lg border border-border bg-muted/30 p-4" aria-label="订单良品缺口">
          <h3 class="m-0 break-words text-base font-semibold">{{ productName }}</h3>
          <p v-if="productCode" class="mb-0 mt-1 break-words text-sm text-muted-foreground">{{ productCode }}</p>
          <dl class="mb-0 mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div class="rounded-md border border-border bg-card p-2 sm:p-3">
              <dt class="text-sm text-muted-foreground">订单应交</dt>
              <dd class="m-0 mt-1 text-base font-semibold tabular-nums">{{ formatQty(shortage.orderQuantity) }} {{ unit }}</dd>
            </div>
            <div class="rounded-md border border-border bg-card p-2 sm:p-3">
              <dt class="text-sm text-muted-foreground">已达成良品</dt>
              <dd class="m-0 mt-1 text-base font-semibold tabular-nums">{{ formatQty(shortage.fulfilledGoodQuantity) }} {{ unit }}</dd>
            </div>
            <div class="rounded-md border border-border bg-card p-2 sm:p-3">
              <dt class="text-sm text-muted-foreground">在制预计覆盖</dt>
              <dd class="m-0 mt-1 text-base font-semibold tabular-nums">{{ formatQty(shortage.pendingGoodQuantity) }} {{ unit }}</dd>
            </div>
            <div class="rounded-md border border-warning/30 bg-warning/10 p-2 sm:p-3">
              <dt class="text-sm font-semibold">本次良品缺口</dt>
              <dd class="m-0 mt-1 text-base font-bold tabular-nums">{{ formatQty(shortage.netGoodShortage) }} {{ unit }}</dd>
            </div>
          </dl>
        </section>
        <Alert v-if="shortage && !hasShortage" message="这条明细已无需要补派工的良品缺口。" show-icon type="success" />
        <Alert v-else-if="!shortage" message="暂时无法核算这条订单明细的良品缺口。" show-icon type="warning">
          <template v-if="catalog.errors.length" #description>
            <ul class="m-0 list-disc pl-5"><li v-for="error in catalog.errors" :key="error">{{ error }}</li></ul>
          </template>
        </Alert>
        <template v-else>
          <section aria-labelledby="shortage-stock-heading" class="space-y-3">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 id="shortage-stock-heading" class="m-0 text-base font-semibold">选择库存批次</h3>
                <p class="mb-0 mt-1 text-sm text-muted-foreground">核对批次并填写计划用量。留空或填 0 表示本次不用。</p>
              </div>
              <Button v-if="catalog.suggestedStockSelections?.length" :disabled="busy" @click="applySuggestions">恢复推荐用量</Button>
            </div>
            <div class="grid items-start gap-3 lg:grid-cols-2">
              <section v-for="group in groups" :key="group.title" class="rounded-lg border border-border">
                <h4 class="m-0 rounded-t-lg bg-muted/35 px-4 py-3 text-sm font-semibold">{{ group.title }}</h4>
                <p v-if="group.candidates.length === 0" class="m-0 px-4 py-3 text-sm text-muted-foreground">{{ group.empty }}</p>
                <ul v-else class="m-0 max-h-72 list-none divide-y divide-border overflow-auto p-0">
                  <li v-for="stock in group.candidates" :key="stock.stockId" class="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3">
                    <div class="min-w-0 break-words">
                      <div class="font-medium">{{ stock.stageLabel }} · {{ stock.batchNo || stock.itemCode }}</div>
                      <div class="mt-1 text-sm text-muted-foreground">
                        {{ [stock.batchNo && stock.itemCode, stock.location, stock.side && sideLabels[stock.side]].filter(Boolean).join(' · ') }}
                      </div>
                      <div class="mt-1 text-sm text-muted-foreground">
                        可用 {{ formatQty(stock.available) }} {{ stock.unit }}
                        <template v-if="stock.startProcessLabel || stock.startProcess">
                          · 从{{ stock.startProcessLabel || processLabel(stock.startProcess!) }}接做
                        </template>
                      </div>
                    </div>
                    <div class="flex items-center gap-2">
                      <label :for="`shortage-stock-${stock.stockId}`" class="text-sm">拟用</label>
                      <InputNumber
                        :id="`shortage-stock-${stock.stockId}`"
                        :aria-label="`${stock.batchNo || stock.itemCode} 计划用量`"
                        :disabled="busy"
                        :max="num(stock.available)"
                        :min="0"
                        :precision="0"
                        :value="picks[stock.stockId] || undefined"
                        class="w-24"
                        placeholder="0"
                        @update:value="(value) => changeQuantity(stock.stockId, value ?? null)"
                      />
                      <span>{{ stock.unit }}</span>
                    </div>
                  </li>
                </ul>
              </section>
            </div>
            <Alert v-if="invalidStock" message="部分批次可用量已变化，或所填数量无效。请调整用量后再预览。" show-icon type="warning">
              <template #action><Button :disabled="busy" @click="load">刷新库存</Button></template>
            </Alert>
            <p v-if="!candidates.length && catalog.errors.length" class="m-0 text-sm text-muted-foreground">
              {{ catalog.errors.join('；') }}
            </p>
          </section>
          <Alert v-if="previewError" :message="previewError" show-icon type="warning" />
          <section v-if="preview" aria-labelledby="shortage-preview-heading" class="space-y-3">
            <div class="flex flex-wrap items-baseline justify-between gap-2">
              <h3 id="shortage-preview-heading" ref="previewHeading" tabindex="-1" class="m-0 text-base font-semibold">工序预览</h3>
              <span v-if="coverage" class="text-sm text-muted-foreground">
                所选批次覆盖 {{ formatQty(coverage.covered) }} {{ unit }} ·
                <b :class="{ 'text-warning': num(coverage.remainingFromStart) > 0 }">
                  尚缺 {{ formatQty(coverage.remainingFromStart) }} {{ unit }}
                </b>
              </span>
            </div>
            <Alert v-if="preview.errors.length" message="请处理以下问题后重新预览" show-icon type="warning">
              <template #description>
                <ul class="m-0 list-disc pl-5"><li v-for="error in preview.errors" :key="error">{{ error }}</li></ul>
              </template>
            </Alert>
            <dl v-if="preview.stockPlan?.length" class="m-0 flex flex-wrap items-baseline gap-x-4 gap-y-1 rounded-lg bg-muted/30 px-4 py-3 text-sm">
              <dt class="font-semibold">计划领用批次</dt>
              <dd v-for="(stock, index) in preview.stockPlan" :key="`${stock.stockId}-${index}`" class="m-0 break-words text-muted-foreground">
                {{ stock.batchNo || stock.itemCode }} · {{ formatQty(stock.quantity) }} {{ stock.unit }}
                <span v-if="stock.side"> · {{ sideLabels[stock.side] }}</span>
              </dd>
            </dl>
            <ol v-if="preview.rows.length" aria-label="补产工序清单" class="m-0 list-none divide-y divide-border rounded-lg border border-border p-0">
              <li
                v-for="row in preview.rows"
                :key="row.rowKey"
                class="grid gap-2 px-4 py-3 md:grid-cols-[minmax(10rem,0.7fr)_minmax(8rem,0.45fr)_minmax(0,2fr)]"
              >
                <div>
                  <div class="flex flex-wrap items-center gap-2 font-semibold">
                    <span>{{ row.processLabel || (row.process && processLabel(row.process)) || '订单明细' }}</span>
                    <Tag v-if="row.side" class="m-0">{{ sideLabels[row.side] }}</Tag>
                  </div>
                  <div v-if="row.reason" class="mt-1 text-sm text-muted-foreground">{{ row.reason }}</div>
                </div>
                <div v-if="row.quantity != null" class="tabular-nums">
                  <span class="text-sm text-muted-foreground">计划产出</span>
                  <b class="ml-2 text-base">{{ formatQty(row.quantity) }} {{ row.unit }}</b>
                  <p v-if="row.output" class="mb-0 mt-1 break-words text-sm text-muted-foreground">
                    {{ materialText({ ...row.output, quantity: undefined }) }}
                  </p>
                </div>
                <ul v-if="row.inputs.length || row.upstreamProcesses.length" class="m-0 list-none space-y-1 break-words p-0 text-sm">
                  <li v-for="(input, index) in row.inputs" :key="index">
                    <span class="font-medium">{{ input.plannedStockId ? '选定库存' : input.requiresUpstreamBatch ? '待上道合格批次' : '计划领料' }}</span>
                    {{ materialText(input) }}
                    <span v-if="input.plannedBatchNo" class="text-muted-foreground"> · 批次 {{ input.plannedBatchNo }}</span>
                  </li>
                  <li v-if="row.upstreamProcesses.length" class="font-medium text-primary">
                    等待{{ row.upstreamProcesses.map(processLabel).join('、') }}报出合格批次后领料
                  </li>
                </ul>
              </li>
            </ol>
            <Alert v-if="preview.warnings.length" message="开工前核对" show-icon type="info">
              <template #description>
                <ul class="m-0 list-disc pl-5"><li v-for="warning in preview.warnings" :key="warning">{{ warning }}</li></ul>
              </template>
            </Alert>
          </section>
        </template>
      </template>
    </div>
    <template #footer>
      <div class="flex flex-wrap items-center justify-end gap-2">
        <p v-if="releaseError" class="m-0 mr-auto text-left text-sm text-destructive" role="alert">{{ releaseError }}</p>
        <div class="flex flex-wrap justify-end gap-2">
          <Button :disabled="submitting" size="large" @click="open = false">取消</Button>
          <Button v-if="hasShortage" :disabled="!canPreview" :loading="previewing" size="large" @click="prepare">预览工序</Button>
          <Button v-if="hasShortage" :disabled="!canRelease" :loading="submitting" size="large" type="primary" @click="release">
            确认下发
          </Button>
        </div>
      </div>
    </template>
  </FactoryDialog>
</template>
