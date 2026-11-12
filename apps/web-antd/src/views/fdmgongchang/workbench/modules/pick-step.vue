<script setup lang="ts">
import type { FdmgongchangStageStockApi as StockApi } from '#/api/fdmgongchang/stage-stock';

import { computed, onMounted, ref, watch } from 'vue';

import { Alert, Checkbox, Empty, Input, InputNumber, message, Select, Spin } from 'ant-design-vue';

import { getWorkbenchRecipePlan, getWorkbenchStock } from '#/api/fdmgongchang/workbench';

import { dimensionTextInMm } from '../../shared/dimensions';
import { attrSummary, formatQty, makeLabels, recipePicks, toNumber } from '../../stage-stock/model';
import { slicePlanThicknessError, stageOf, useJob } from '../use-job';
import IssueShortages from './issue-shortages.vue';
import PlannedInputs from './planned-inputs.vue';
import StepHeader from './step-header.vue';

/**
 * 第 1 步 领材料：左边是上道库存，点一行选上，数量就在这一行里填；右边「本次领料」逐行列出
 * 领哪种料、哪个批次、领多少，一眼对得上。贴合要领两种片材：第一种是正面，第二种是反面。
 * 发泡可以按配方领：选配方和锅数，自动带出每种原料要领多少；补领时按单上的配方补齐还差的。
 */
const emit = defineEmits<{ back: []; next: [] }>();
const job = useJob();

const stocks = ref<StockApi.Stock[]>([]);
const loading = ref(false);
const loadError = ref(false);
const stockKeyword = ref('');
let loadSequence = 0;
const labels = computed(() => makeLabels(job.options));
const laminate = computed(() => job.process?.code === 'LAMINATE');
const source = computed(() => stageOf(job, job.sourceStage));
const unit = computed(() => source.value?.unit ?? '');
const sourceStages = computed(() => job.prepare?.sourceStages?.length ? job.prepare.sourceStages : job.process?.sources ?? []);
const plannedOutput = computed(() => job.prepare?.outputAttrs ?? job.task?.output?.attrs);
const outputSpec = computed(() => plannedOutput.value ? attrSummary(job.process?.outputStage ?? '', plannedOutput.value, labels.value, [], 'mm') : dimensionTextInMm(job.task?.spec));
const planThicknessError = computed(() => slicePlanThicknessError(job, job.picks.map((pick) => ({ quantity: pick.qty, stock: pick.stock }))));

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
watch(() => job.sourceStage, () => {
  job.picks = [];
  stockKeyword.value = '';
  void load();
});

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
  // 默认不填数量，免得忘了改；按配方带出的会自动填
  if (laminate.value) {
    if (job.picks.length >= 2) job.picks = job.picks.slice(1);
    const side = job.picks.some((p) => p.side === 'FRONT') ? 'BACK' : 'FRONT';
    job.picks = [...job.picks, { qty: 0, side, stock }];
  } else {
    // 一次可以领多种料（发泡一个配方要好几种原料）
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
    : [...job.picks.filter((pick) => pick.side !== side), { qty: 0, side, stock }];
}

/** 右边清单里某种原料本次一共领多少。 */
const pickedOf = (code: string) =>
  job.picks.filter((p) => p.stock.item?.rawMaterialCode === code).reduce((t, p) => t + (p.qty || 0), 0);
const pickTotal = computed(() => job.picks.reduce((t, p) => t + (p.qty || 0), 0));

// ===== 按配方领（发泡） =====
const mixFromRaw = computed(() => job.process?.code === 'MIX' && job.sourceStage === 'RAW');
const recipeOptions = computed(() =>
  (job.options?.recipes ?? []).filter((r) => r.enabled).map((r) => ({ label: `${r.name}（${r.code}）`, value: r.code })),
);
const orderRecipe = computed(() => (job.supplement ? job.order?.recipeCode : undefined));
// 只有一个配方时直接选上
const recipeCode = ref<string | undefined>(
  job.recipe?.code ?? (recipeOptions.value.length === 1 ? recipeOptions.value[0]!.value : undefined),
);
const batches = ref<null | number>(job.recipe?.batches ?? 1);
const plannedBatches = computed(() => toNumber(job.task?.output?.recipeBatches ?? job.prepare?.task.output?.recipeBatches));
const recipeLoading = ref(false);
/** 配方每种原料：配方要多少、库存缺多少；本次领多少按右边清单实时算。 */
const recipeLines = ref<StockApi.RecipePlanLine[]>([]);
/** 按配方每种原料一共要领多少（原材料编码 → kg），显示在对应的库存行上。 */
const recipeNeeds = ref<Record<string, number>>({});

async function applyRecipe() {
  if (!job.supplement && (!recipeCode.value || !(batches.value && batches.value > 0))) {
    message.warning('先选配方，再填几锅');
    return;
  }
  recipeLoading.value = true;
  try {
    const plan = await getWorkbenchRecipePlan(
      job.supplement && job.order
        ? { orderId: job.order.id }
        : { batches: batches.value!, recipeCode: recipeCode.value },
    );
    job.picks = recipePicks(plan).map((l) => ({
      qty: l.quantity,
      stock: stocks.value.find((s) => s.id === l.stock.id) ?? (l.stock as StockApi.Stock),
    }));
    recipeNeeds.value = Object.fromEntries(
      plan.lines.map((l) => [l.rawMaterialCode, toNumber(l.remaining) ?? toNumber(l.required) ?? 0]),
    );
    recipeLines.value = plan.lines;
    if (!job.supplement) job.recipe = { batches: batches.value!, code: recipeCode.value! };
    if (job.picks.length === 0) message.info(job.supplement ? '按配方已经领够了' : '原料库存里没有这个配方的料');
  } finally {
    recipeLoading.value = false;
  }
}

// 换了配方或锅数，等重新带出后再记到单上
watch([recipeCode, batches], () => {
  if (!job.supplement) job.recipe = undefined;
});

function next() {
  if (job.urgent && job.sourceStage === 'BOARD' && !job.urgentReason.trim()) {
    message.warning('勾了加急要写原因');
    return;
  }
  if (planThicknessError.value) {
    message.warning(planThicknessError.value);
    return;
  }
  if (job.picks.length === 0) {
    message.warning('先在左边点一下要用的料');
    return;
  }
  // 补领贴合片材可以只补一面
  if (laminate.value && !job.supplement && job.picks.length < 2) {
    message.warning('贴合要分别领用正面和反面片材，同一批次可各领一面');
    return;
  }
  const empty = job.picks.find((p) => !(p.qty > 0));
  if (empty) {
    message.warning(`请填写「${nameOf(empty.stock)}」领多少`);
    return;
  }
  emit('next');
}
</script>

<template>
  <div class="flex min-h-full flex-col">
    <StepHeader
      :current="1"
      :subtitle="job.supplement ? (job.order?.status === 'COMPLETED' ? `补登到已完工的 ${job.order?.orderNo ?? ''}，实际多拿的料在这里登记` : `补到 ${job.order?.orderNo ?? ''}，领少了的料在这里再领`) : job.task ? `${job.task.contractCode ? `订单 ${job.task.contractCode}` : '备货'} · ${[job.task.product, outputSpec].filter(Boolean).join(' ')}` : job.process?.code === 'SLICE' ? '独立开片 · 多种板材分别报工' : '自己开单'"
      :title="`${job.process?.label} · 第 1 步 ${job.order?.status === 'COMPLETED' ? '补登领料' : job.supplement ? '补领' : '选择实际领料批次'}`"
      :total="2"
      @back="emit('back')"
    />
    <main class="grid flex-1 grid-cols-1 content-start gap-4 p-4 md:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <div class="flex min-w-0 flex-col gap-3">
        <Alert v-if="planThicknessError" :message="planThicknessError" show-icon type="warning" />
        <PlannedInputs v-if="job.task && !job.supplement" :inputs="job.task.inputs" :labels="labels" />
        <section v-if="job.prepare" class="flex flex-col gap-1 rounded-lg border border-primary/40 bg-primary/5 p-3 text-sm">
          <span class="font-bold">
            计划产出：{{ job.prepare.outputLabel || job.process?.outputLabel }} {{ formatQty(job.task?.quantity) }} {{ job.prepare.outputUnit || job.task?.unit }}
          </span>
          <span v-if="outputSpec">产出规格：{{ outputSpec }}</span>
          <span>本次领取：{{ source?.label }} → 报工产出：{{ job.prepare.outputLabel || job.process?.outputLabel }}</span>
          <span v-if="job.prepare.picks.length > 0" class="text-muted-foreground">
            系统按任务推荐领取 {{ formatQty(job.prepare.required) }} {{ unit }}，已预选批次。请按实际领取修改数量，确认后才扣库存。
          </span>
          <span v-else class="text-muted-foreground">没有算出建议领料，请在下面点实际领的料，填领了多少。</span>
          <span v-if="job.prepare.hint" class="text-warning">{{ job.prepare.hint }}</span>
        </section>
        <section v-if="mixFromRaw && (!job.supplement || orderRecipe)" class="flex flex-col gap-2 rounded-lg border border-primary/40 bg-card p-3">
          <span class="text-sm font-bold">{{ job.supplement ? '按配方补齐' : '按配方领（一次领齐所有原料）' }}</span>
          <div v-if="!job.supplement" class="flex flex-wrap items-center gap-2">
            <Select
              id="recipe-code"
              v-model:value="recipeCode"
              :options="recipeOptions"
              class="min-w-[14rem] flex-1"
              option-filter-prop="label"
              placeholder="选配方，可输入名称搜索"
              show-search
            />
            <label for="recipe-batches" class="flex items-center gap-2 text-xs text-muted-foreground">
              本次实际锅数
              <InputNumber
                id="recipe-batches"
                :min="0"
                :value="batches ?? undefined"
                :precision="1"
                :step="1"
                addon-after="锅"
                class="w-32"
                @update:value="(v) => (batches = v === null || v === undefined || v === '' ? null : Number(v))"
              />
            </label>
          </div>
          <span v-else class="text-xs text-muted-foreground">这张单是按配方领的，点下面按配方算出还差哪些料</span>
          <span v-if="!job.supplement" class="text-xs text-muted-foreground">
            {{ plannedBatches && plannedBatches > 0 ? `任务预计 ${formatQty(plannedBatches)} 锅，已按计划预填，请核对本次实际锅数。` : '任务未填写预计锅数，暂按 1 锅预填，请核对本次实际锅数。' }}
          </span>
          <button
            :disabled="recipeLoading"
            class="h-9 self-start rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground"
            type="button"
            @click="applyRecipe"
          >
            {{ recipeLoading ? '正在算…' : job.supplement ? '按配方补齐还差的' : '按配方带出要领的料' }}
          </button>
          <table v-if="recipeLines.length > 0" class="w-full text-sm">
            <thead>
              <tr class="text-left text-xs text-muted-foreground">
                <th class="py-1 font-normal">原料</th>
                <th class="py-1 text-right font-normal">{{ job.supplement ? '还差' : '配方要' }}</th>
                <th class="py-1 text-right font-normal">本次领</th>
                <th class="py-1 text-right font-normal">库存缺</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="l in recipeLines" :key="l.rawMaterialCode" class="border-t border-border">
                <td class="py-1 pr-2 font-semibold">{{ l.rawMaterialName || l.rawMaterialCode }}</td>
                <td class="py-1 text-right tabular-nums">{{ formatQty(l.remaining ?? l.required) }} kg</td>
                <td class="py-1 text-right tabular-nums" :class="pickedOf(l.rawMaterialCode) > 0 ? 'font-semibold text-primary' : 'text-muted-foreground'">
                  {{ formatQty(pickedOf(l.rawMaterialCode)) }} kg
                </td>
                <td class="py-1 text-right tabular-nums" :class="Number(l.shortage) > 0 ? 'font-semibold text-destructive' : 'text-muted-foreground'">
                  {{ Number(l.shortage) > 0 ? `${formatQty(l.shortage)} kg` : '—' }}
                </td>
              </tr>
            </tbody>
          </table>
          <p v-if="recipeLines.some((l) => Number(l.shortage) > 0)" class="m-0 text-xs text-destructive">
            标红的是账面缺料。请按实际领取数量登记，库存可暂时为负，并补录对应原材料入库。
          </p>
        </section>

        <div v-if="!job.supplement && sourceStages.length > 1" class="flex flex-wrap items-center gap-1.5 text-sm">
          <span class="text-muted-foreground">从哪领：</span>
          <button
            v-for="code in sourceStages"
            :key="code"
            :class="code === job.sourceStage ? 'border-primary bg-primary/10 text-primary' : 'border-border'"
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
          <Input
            id="stock-keyword"
            v-model:value="stockKeyword"
            allow-clear
            aria-label="搜索领料批次"
            placeholder="搜索名称、颜色、规格（mm）、编码、批次或库位"
          />
          <Spin :spinning="loading">
            <div v-if="loadError" class="flex flex-col items-start gap-2 rounded-lg border border-warning/40 bg-warning/5 p-3 text-sm" role="alert">
              <span>库存批次加载失败，已选批次和填写数量已保留，请重试。</span>
              <button class="text-primary hover:underline" type="button" @click="load">重新加载领料批次</button>
            </div>
            <Empty v-else-if="!loading && visibleStocks.length === 0" :description="stocks.length > 0 ? '没有匹配的领料批次，请调整搜索关键词' : job.task ? '暂无符合当前任务条件的领料批次' : `${source?.label ?? ''}现在没有库存`" />
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
                      <template v-if="s.item?.rawMaterialCode && recipeNeeds[s.item.rawMaterialCode] !== undefined"> · 配方要 {{ formatQty(recipeNeeds[s.item.rawMaterialCode]) }} {{ unit }}</template>
                    </span>
                  </span>
                </button>
                <span v-if="pickOf(s) && !laminate" class="flex shrink-0 items-center gap-1.5">
                  <InputNumber
                    :id="`pick-${s.id}`"
                    :aria-label="`${nameOf(s)} 领用数量`"
                    :min="0"
                    :precision="3"
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
                    <InputNumber v-if="pickOf(s, side)" :id="`pick-${s.id}-${side}`" :aria-label="`${nameOf(s)} ${sideText(side)}领用数量`" :min="0" :precision="3" :addon-after="unit" :value="pickOf(s, side)!.qty || undefined" class="w-32" @change="(v) => setQty(s, v, side)" />
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
                    :precision="3"
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
        <section v-if="job.sourceStage === 'BOARD' && !job.supplement" class="flex flex-col gap-2 rounded-lg border border-border bg-card p-3">
          <Checkbox v-model:checked="job.urgent">加急：要用刚发泡、还在静置的板材</Checkbox>
          <Input
            v-if="job.urgent"
            id="urgent-reason"
            v-model:value="job.urgentReason"
            :maxlength="200"
            placeholder="写原因，例如：客户加急，下午要出货"
          />
          <p class="m-0 text-xs text-muted-foreground">板材一般发泡第二天才用；领了还在静置的板，提交时会提示，勾加急写原因后就能领，原因会记进异常台账。</p>
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
              :precision="3"
              class="w-36"
            />
          </div>
        </section>
        <IssueShortages />
        <button :disabled="loading || loadError" class="h-10 rounded-md bg-primary text-sm font-semibold text-primary-foreground disabled:opacity-50" type="button" @click="next">
          下一步：确认领料
        </button>
      </aside>
    </main>
  </div>
</template>
