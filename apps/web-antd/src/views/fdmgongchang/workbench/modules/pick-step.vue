<script setup lang="ts">
import type { FdmgongchangStageStockApi as StockApi } from '#/api/fdmgongchang/stage-stock';

import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';

import { Alert, Empty, Input, InputNumber, message, Spin } from 'ant-design-vue';

import { getWorkbenchStock, prepareWorkbenchTaskStock } from '#/api/fdmgongchang/workbench';

import { dimensionTextInMm } from '../../shared/dimensions';
import { quantityPrecision } from '../../shared/quantity';
import { attrSummary, formatQty, makeLabels, toNumber } from '../../stage-stock/model';
import { issueShortages, slicePlanThicknessError, stageOf, useJob } from '../use-job';
import IssueShortages from './issue-shortages.vue';
import PlannedInputs from './planned-inputs.vue';
import StepHeader from './step-header.vue';

/**
 * 第 1 步 领材料：左边是上道库存，点一行选上，数量就在这一行里填；右边「本次领料」逐行列出
 * 领哪种料、哪个批次、领多少，一眼对得上。贴合要领两种片材：第一种是正面，第二种是反面。
 */
const props = defineProps<{ embedded?: boolean }>();
const emit = defineEmits<{ back: []; next: [] }>();
const job = useJob();

const stocks = ref<StockApi.Stock[]>([]);
const loading = ref(false);
const loadError = ref(false);
const prepareStockLoading = ref(false);
const prepareStockError = ref(false);
const stockKeyword = ref('');
let loadSequence = 0;
let disposed = false;
const labels = computed(() => makeLabels(job.options));
const laminate = computed(() => job.process?.code === 'LAMINATE');
const source = computed(() => stageOf(job, job.sourceStage));
const unit = computed(() => source.value?.unit ?? '');
const sourceStages = computed(() => job.prepare?.sourceStages?.length ? job.prepare.sourceStages : job.process?.sources ?? []);
const plannedOutput = computed(() => job.prepare?.outputAttrs ?? job.task?.output?.attrs);
const outputSpec = computed(() => plannedOutput.value ? attrSummary(job.process?.outputStage ?? '', plannedOutput.value, labels.value, [], 'mm') : dimensionTextInMm(job.task?.spec));
const planThicknessError = computed(() => slicePlanThicknessError(job, job.picks.map((pick) => ({ quantity: pick.qty, stock: pick.stock }))));
const followActualBatches = computed(() => job.prepare?.followActualBatches === true);
const exceedsAvailableStock = computed(() => followActualBatches.value && issueShortages(job).some((line) => line.stock.stage !== 'AUX'));
const canPrepareStock = computed(() => !!job.task && !!job.process
  && !followActualBatches.value
  && job.process.code !== 'MIX'
  && ['BOARD', 'CUT', 'EMBOSSED', 'ENGRAVED', 'FOLDED', 'LAMINATED', 'PUNCHED', 'SHEET'].includes(job.sourceStage)
  && !job.supplement && !job.order && !job.prepare?.inProgressOrderId);

async function load() {
  const sequence = ++loadSequence;
  loading.value = true;
  loadError.value = false;
  try {
    const page = await getWorkbenchStock(job.sourceStage, job.task?.id);
    if (sequence !== loadSequence) return;
    // 先进先出：批次早的排前面
    stocks.value = page.list.toSorted((a, b) => a.batchNo.localeCompare(b.batchNo));
    job.picks = job.picks.map((pick) => ({ ...pick, stock: stocks.value.find((stock) => stock.id === pick.stock.id) ?? pick.stock }));
  } catch {
    if (sequence === loadSequence) loadError.value = true;
  } finally {
    if (sequence === loadSequence) loading.value = false;
  }
}
onMounted(load);
onBeforeUnmount(() => { disposed = true; loadSequence++; });
watch(() => job.sourceStage, () => {
  job.picks = [];
  stockKeyword.value = '';
  prepareStockError.value = false;
  void load();
});

async function prepareStock() {
  if (!canPrepareStock.value || prepareStockLoading.value || loading.value || !job.task) return;
  const taskId = job.task.id;
  const sourceStage = job.sourceStage;
  prepareStockLoading.value = true;
  prepareStockError.value = false;
  try {
    const prepared = await prepareWorkbenchTaskStock({
      onBehalfOf: job.onBehalfOf?.id, sourceStage, taskId,
    });
    if (disposed || job.task?.id !== taskId || job.sourceStage !== sourceStage) return;
    job.prepare = prepared;
    // 同一批次可分别供正面和反面领用，必须保留两条带面别的数量。
    job.picks = prepared.picks.map((pick) => ({ qty: toNumber(pick.quantity) ?? 0, side: pick.side, stock: pick.stock }));
    stocks.value = [...new Map([...stocks.value, ...prepared.picks.map((pick) => pick.stock)].map((stock) => [stock.id, stock])).values()];
    stockKeyword.value = '';
    await load();
  } catch {
    if (!disposed && job.task?.id === taskId && job.sourceStage === sourceStage) prepareStockError.value = true;
  } finally {
    prepareStockLoading.value = false;
  }
}

const nameOf = (stock: StockApi.Stock) => attrSummary(stock.stage, stock.item, labels.value, [], 'mm') || stock.itemCode;
const normalizeSearch = (value: string) => value.toLocaleLowerCase().replaceAll(/[×*＊]/g, 'x').replaceAll(/\s/g, '');
const visibleStocks = computed(() => {
  const keyword = normalizeSearch(stockKeyword.value);
  if (!keyword) return stocks.value;
  return stocks.value.filter((stock) => normalizeSearch([
    nameOf(stock), stock.item?.productName, stock.itemCode, stock.batchNo, stock.location,
  ].filter(Boolean).join(' ')).includes(keyword));
});
const pickOf = (stock: StockApi.Stock, side?: StockApi.LaminationSide) => job.picks.find((p) => p.stock.id === stock.id && (!side || p.side === side));
const SIDE_TEXT: Record<StockApi.LaminationSide, string> = { BACK: '反面', FRONT: '正面' };
const sideText = (side?: StockApi.LaminationSide) => (side ? SIDE_TEXT[side] : '');

function toggle(stock: StockApi.Stock) {
  const existing = pickOf(stock);
  if (existing) {
    job.picks = job.picks.filter((p) => p !== existing);
    return;
  }
  // 默认不填数量，免得忘了改。
  if (laminate.value) {
    if (!followActualBatches.value && job.picks.length >= 2) job.picks = job.picks.slice(1);
    const side = job.picks.some((p) => p.side === 'FRONT') ? 'BACK' : 'FRONT';
    job.picks = [...job.picks, { qty: 0, side, stock }];
  } else {
    job.picks = [...job.picks, { qty: 0, stock }];
  }
}

function setQty(stock: StockApi.Stock, value: unknown, side?: StockApi.LaminationSide) {
  const pick = pickOf(stock, side);
  if (pick) pick.qty = Math.max(0, toNumber(value) ?? 0);
}
function toggleSide(stock: StockApi.Stock, side: StockApi.LaminationSide) {
  const existing = pickOf(stock, side);
  job.picks = existing
    ? job.picks.filter((pick) => pick !== existing)
    : [...job.picks.filter((pick) => followActualBatches.value || pick.side !== side), { qty: 0, side, stock }];
}

const pickTotal = computed(() => job.picks.reduce((t, p) => t + (p.qty || 0), 0));

function next() {
  if (planThicknessError.value) {
    message.warning(planThicknessError.value);
    return;
  }
  if (job.picks.length === 0) {
    message.warning('先在左边点一下要用的料');
    return;
  }
  // 补领贴合片材可以只补一面
  if (laminate.value && !job.supplement && (['FRONT', 'BACK'] as const).some((side) => !job.picks.some((pick) => pick.side === side))) {
    message.warning('贴合要分别领用正面和反面片材，同一批次可各领一面');
    return;
  }
  const empty = job.picks.find((p) => !(p.qty > 0));
  if (empty) {
    message.warning(`请填写「${nameOf(empty.stock)}」领多少`);
    return;
  }
  if (exceedsAvailableStock.value) return;
  emit('next');
}
</script>

<template>
  <div class="flex min-h-full flex-col">
    <StepHeader
      v-if="!props.embedded"
      :current="1"
      :subtitle="job.supplement ? (job.order?.status === 'COMPLETED' ? `补登到已完工的 ${job.order?.orderNo ?? ''}，实际多拿的料在这里登记` : `补到 ${job.order?.orderNo ?? ''}，领少了的料在这里再领`) : job.task ? `${job.task.contractCode ? `订单 ${job.task.contractCode}` : '备货'} · ${[job.task.product, outputSpec].filter(Boolean).join(' ')}` : job.process?.code === 'SLICE' ? '独立开片 · 多种板材分别报工' : '独立开单'"
      :title="`${job.process?.label} · 第 1 步 ${job.order?.status === 'COMPLETED' ? '补登领料' : job.supplement ? '补领' : '选择实际领料批次'}`"
      :total="2"
      @back="emit('back')"
    />
    <main class="grid flex-1 grid-cols-1 content-start gap-4 p-4 md:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <div class="flex min-w-0 flex-col gap-3">
        <Alert v-if="planThicknessError" :message="planThicknessError" show-icon type="warning" />
        <PlannedInputs v-if="job.task && !job.supplement" :inputs="job.task.inputs" :labels="labels" :follow-actual-batches="followActualBatches" />
        <section v-if="job.prepare" class="flex flex-col gap-1 rounded-lg border border-primary/40 bg-primary/5 p-3 text-sm">
          <span class="font-bold">
            计划产出：{{ job.prepare.outputLabel || job.process?.outputLabel }} {{ formatQty(job.task?.quantity) }} {{ job.prepare.outputUnit || job.task?.unit }}
          </span>
          <span v-if="outputSpec">产出规格：{{ outputSpec }}</span>
          <span>本次领取：{{ source?.label }} → 报工产出：{{ job.prepare.outputLabel || job.process?.outputLabel }}</span>
          <span v-if="followActualBatches" class="text-muted-foreground">
            从补派工选定的库存或上道已报的合格批次中填写实际领料。上道新报工后，可刷新可领批次。
          </span>
          <span v-else-if="job.prepare.picks.length > 0" class="text-muted-foreground">
            系统推荐 {{ formatQty(job.prepare.required) }} {{ unit }}，仅作预填。可取消推荐、另选符合任务的材料，再填写实际领到的数量；下一步确认后才扣库存。
          </span>
          <span v-else class="text-muted-foreground">没有算出建议领料，请在下面点实际领的料，填领了多少。</span>
          <span v-if="job.prepare.hint" class="text-warning">{{ job.prepare.hint }}</span>
        </section>
        <section v-if="canPrepareStock" class="flex flex-col items-start gap-2 rounded-lg border border-border bg-muted/20 p-3 text-sm">
          <span>订单拆分下发时会自动建立缺少的半成品产品和零库存，可直接选择下方物料领料。账面不足允许负数，上道补报入库后冲抵。</span>
          <button
            :disabled="prepareStockLoading || loading || loadError"
            class="h-9 rounded-md border border-border bg-card px-4 font-semibold disabled:opacity-50"
            type="button"
            @click="prepareStock"
          >
            {{ prepareStockLoading ? '正在准备领料…' : '按任务规格准备领料' }}
          </button>
          <span class="text-xs text-muted-foreground">仅在历史任务未出现所需物料时使用“按任务规格准备领料”补齐。实际数量可修改，点击“确认领料”后才扣库存。</span>
          <span v-if="prepareStockError" role="alert" class="text-destructive">按任务规格准备领料失败，已选批次和填写数量已保留，请重试。</span>
        </section>
        <div v-if="!job.supplement && sourceStages.length > 1" class="flex flex-wrap items-center gap-1.5 text-sm">
          <span class="text-muted-foreground">从哪领：</span>
          <button
            v-for="code in sourceStages"
            :key="code"
            :class="code === job.sourceStage ? 'border-primary bg-primary/10 text-primary' : 'border-border'"
            :disabled="prepareStockLoading"
            class="h-8 rounded-md border px-2.5"
            type="button"
            @click="job.sourceStage = code"
          >
            {{ stageOf(job, code)?.label }}
          </button>
        </div>

        <section class="flex flex-col gap-1.5">
          <span class="text-xs text-muted-foreground">
            {{ laminate ? '先点正面用的片材，再点反面用的片材；选上后在这一行填领多少' : `点要用的${source?.label ?? ''}选上（可以选好几种），在这一行填领多少` }}
          </span>
          <div class="flex items-center gap-2">
            <Input
              id="stock-keyword"
              v-model:value="stockKeyword"
              allow-clear
              aria-label="搜索领料批次"
              placeholder="搜索名称、颜色、规格（mm）、编码、批次或库位"
            />
            <button v-if="followActualBatches" :disabled="loading" type="button" class="shrink-0 text-sm text-primary hover:underline" @click="load">刷新可领批次</button>
          </div>
          <Spin :spinning="loading">
            <div v-if="loadError" class="flex flex-col items-start gap-2 rounded-lg border border-warning/40 bg-warning/5 p-3 text-sm" role="alert">
              <span>库存批次加载失败，已选批次和填写数量已保留，请重试。</span>
              <button class="text-primary hover:underline" type="button" @click="load">重新加载领料批次</button>
            </div>
            <Empty v-else-if="!loading && visibleStocks.length === 0" :description="stocks.length > 0 ? '没有匹配的领料批次，请调整搜索关键词' : followActualBatches ? '暂无可领批次，请核对选定库存或等待上道报工' : job.task ? '暂无符合当前任务条件的领料批次' : `${source?.label ?? ''}现在没有库存`" />
            <div v-else class="flex flex-col divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
              <div
                v-for="(s, i) in visibleStocks"
                :key="s.id"
                :class="pickOf(s) ? 'bg-primary/5' : ''"
                class="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3 py-2"
              >
                <button
                  :aria-pressed="!!pickOf(s)"
                  class="flex min-w-0 flex-1 items-center gap-2.5 text-left"
                  type="button"
                  @click="toggle(s)"
                >
                  <span
                    :class="pickOf(s) ? 'border-primary bg-primary text-primary-foreground' : 'border-border'"
                    class="flex size-5 shrink-0 items-center justify-center rounded border text-xs"
                    aria-hidden="true"
                  >{{ pickOf(s) ? '✓' : '' }}</span>
                  <span class="flex min-w-0 flex-col">
                    <span class="flex items-center gap-1.5 text-sm font-semibold">
                      <span class="truncate">{{ nameOf(s) }}</span>
                      <span v-if="pickOf(s)?.side" class="shrink-0 rounded bg-primary px-1.5 text-xs font-normal leading-5 text-primary-foreground">{{ sideText(pickOf(s)?.side) }}</span>
                      <span v-else-if="i === 0 && !pickOf(s) && (toNumber(s.quantity) ?? 0) > 0" class="shrink-0 rounded bg-primary/10 px-1.5 text-xs font-normal leading-5 text-primary">先领这批</span>
                      <span v-if="(toNumber(s.quantity) ?? 0) <= 0" class="shrink-0 rounded bg-warning/10 px-1.5 text-xs font-normal leading-5 text-warning">待补录库存</span>
                    </span>
                    <span class="text-xs text-muted-foreground">
                      {{ source?.label }} · 批次 {{ s.batchNo }} · {{ s.location }} · 账面 {{ formatQty(s.quantity) }} {{ unit }}
                    </span>
                  </span>
                </button>
                <span v-if="pickOf(s) && !laminate" class="flex shrink-0 items-center gap-1.5">
                  <InputNumber
                    :id="`pick-${s.id}`"
                    :aria-label="`${nameOf(s)} 领用数量`"
                    :min="0"
                    :precision="quantityPrecision(unit)"
                    :addon-after="unit"
                    :value="pickOf(s)!.qty || undefined"
                    class="w-36"
                    placeholder="领多少"
                    @change="(v) => setQty(s, v)"
                  />
                  <button v-if="(toNumber(s.quantity) ?? 0) > 0" class="text-xs text-primary hover:underline" type="button" @click="setQty(s, s.quantity)">按账面量</button>
                </span>
                <div v-if="laminate" class="flex w-full flex-wrap gap-3">
                  <span v-for="side in (['FRONT', 'BACK'] as const)" :key="side" class="flex items-center gap-2">
                    <button type="button" class="text-xs text-primary" :aria-pressed="!!pickOf(s, side)" @click="toggleSide(s, side)">{{ pickOf(s, side) ? '已选' : '选择' }}{{ sideText(side) }}</button>
                    <InputNumber v-if="pickOf(s, side)" :id="`pick-${s.id}-${side}`" :aria-label="`${nameOf(s)} ${sideText(side)}领用数量`" :min="0" :precision="quantityPrecision(unit)" :addon-after="unit" :value="pickOf(s, side)!.qty || undefined" class="w-32" @change="(v) => setQty(s, v, side)" />
                  </span>
                </div>
              </div>
            </div>
          </Spin>
        </section>
      </div>

      <aside class="flex min-w-0 flex-col gap-2 md:sticky md:top-4 md:self-start">
        <section class="flex flex-col gap-2 rounded-lg border border-border bg-card p-3">
          <h3 class="m-0 flex items-baseline justify-between text-sm font-bold">
            本次实际领料
            <span class="text-xs font-normal text-muted-foreground">{{ job.picks.length }} 批次 · 共 {{ formatQty(pickTotal) }} {{ unit }}</span>
          </h3>
          <p v-if="job.picks.length === 0" class="m-0 text-xs text-muted-foreground">还没选料，在左边点要用的料。</p>
          <table v-else class="w-full text-sm">
            <thead>
              <tr class="text-left text-xs text-muted-foreground">
                <th class="py-1 font-normal">材料 / 批次</th>
                <th class="py-1 text-right font-normal">领用</th>
                <th class="w-6"></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="p in job.picks" :key="`${p.stock.id}:${p.side ?? ''}`" class="border-t border-border">
                <td class="py-2 pr-2">
                  <span class="font-semibold">{{ nameOf(p.stock) }}</span>
                  <span v-if="p.side" class="ml-1 text-xs text-primary">{{ sideText(p.side) }}</span>
                  <span class="mt-1 block break-all font-mono text-xs text-muted-foreground">{{ p.stock.batchNo }}</span>
                </td>
                <td class="whitespace-nowrap py-1.5 text-right tabular-nums" :class="p.qty > 0 ? 'font-semibold' : 'text-destructive'">
                  <InputNumber
                    :id="`actual-pick-${p.stock.id}${p.side ? `-${p.side}` : ''}`"
                    :aria-label="`${nameOf(p.stock)} 批次 ${p.stock.batchNo} 实际领用数量`"
                    :min="0"
                    :precision="quantityPrecision(unit)"
                    :addon-after="unit"
                    :value="p.qty || undefined"
                    class="w-32"
                    placeholder="领多少"
                    @change="(v) => setQty(p.stock, v, p.side)"
                  />
                </td>
                <td class="py-1.5 text-right">
                  <button :aria-label="`去掉 ${nameOf(p.stock)}${sideText(p.side)}`" class="text-muted-foreground hover:text-destructive" type="button" @click="job.picks = job.picks.filter((pick) => pick !== p)">×</button>
                </td>
              </tr>
            </tbody>
          </table>
        </section>
        <section v-if="job.prepare && job.auxPicks.length > 0" class="flex flex-col gap-2 rounded-lg border border-border bg-card p-3">
          <h3 class="m-0 text-sm font-bold">辅料（按订单用量带出，改成实际领的）</h3>
          <div v-for="a in job.auxPicks" :key="a.stock.id" class="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-1.5">
            <span class="flex min-w-0 flex-col">
              <span class="truncate text-sm font-semibold">{{ a.name }}</span>
              <span class="text-xs text-muted-foreground">批次 {{ a.stock.batchNo }} · 库里有 {{ formatQty(a.stock.quantity) }} {{ a.unit }}</span>
            </span>
            <InputNumber
              :id="`aux-${a.stock.id}`"
              v-model:value="a.qty"
              :aria-label="`${a.name} 实际领用数量`"
              :addon-after="a.unit"
              :min="0"
              :precision="quantityPrecision(a.unit)"
              class="w-36"
            />
          </div>
        </section>
        <IssueShortages />
        <button :disabled="loading || loadError || prepareStockLoading || exceedsAvailableStock" class="h-10 rounded-md bg-primary text-sm font-semibold text-primary-foreground disabled:opacity-50" type="button" @click="next">
          {{ props.embedded ? '确认本项用料' : '下一步：确认领料' }}
        </button>
      </aside>
    </main>
  </div>
</template>
