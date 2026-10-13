<script setup lang="ts">
import type { FdmgongchangStageStockApi as StockApi } from '#/api/fdmgongchang/stage-stock';

import { computed, onMounted, ref, watch } from 'vue';

import { Empty, InputNumber, message, Select, Spin } from 'ant-design-vue';

import { getWorkbenchRecipePlan, getWorkbenchStock } from '#/api/fdmgongchang/workbench';

import { attrSummary, formatQty, makeLabels, recipePicks, toNumber } from '../../stage-stock/model';
import { stageOf, useJob } from '../use-job';
import StepHeader from './step-header.vue';

/**
 * 第 1 步 领材料：左边是上道库存，点一行选上，数量就在这一行里填；右边「本次领料」逐行列出
 * 领哪种料、哪个批次、领多少，一眼对得上。贴合要领两种片材：第一种是正面，第二种是反面。
 * 密炼可以按配方领：选配方和锅数，自动带出每种原料要领多少；补领时按单上的配方补齐还差的。
 */
const emit = defineEmits<{ back: []; next: [] }>();
const job = useJob();

const stocks = ref<StockApi.Stock[]>([]);
const loading = ref(false);
const labels = computed(() => makeLabels(job.options));
const laminate = computed(() => job.process?.code === 'LAMINATE');
const source = computed(() => stageOf(job, job.sourceStage));
const unit = computed(() => source.value?.unit ?? '');

async function load() {
  loading.value = true;
  try {
    const page = await getWorkbenchStock(job.sourceStage);
    // 先进先出：批次早的排前面
    stocks.value = page.list.toSorted((a, b) => a.batchNo.localeCompare(b.batchNo));
  } finally {
    loading.value = false;
  }
}
onMounted(load);
watch(() => job.sourceStage, () => {
  job.picks = [];
  void load();
});

const nameOf = (stock: StockApi.Stock) => attrSummary(stock.stage, stock.item, labels.value) || stock.itemCode;
const pickOf = (stock: StockApi.Stock) => job.picks.find((p) => p.stock.id === stock.id);
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
    // 一次可以领多种料（密炼一个配方要好几种原料）
    job.picks = [...job.picks, { qty: 0, stock }];
  }
}

function setQty(stock: StockApi.Stock, value: unknown) {
  const pick = pickOf(stock);
  if (pick) pick.qty = Math.min(Number(value) || 0, toNumber(stock.quantity) ?? 0);
}

/** 右边清单里某种原料本次一共领多少。 */
const pickedOf = (code: string) =>
  job.picks.filter((p) => p.stock.item?.rawMaterialCode === code).reduce((t, p) => t + (p.qty || 0), 0);
const pickTotal = computed(() => job.picks.reduce((t, p) => t + (p.qty || 0), 0));

// ===== 按配方领（密炼） =====
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
  if (job.picks.length === 0) {
    message.warning('先在左边点一下要用的料');
    return;
  }
  // 补领贴合片材可以只补一面
  if (laminate.value && !job.supplement && job.picks.length < 2) {
    message.warning('贴合要选正面和反面两种片材');
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
      :subtitle="job.supplement ? `补到 ${job.order?.orderNo ?? ''}，领少了的料在这里再领` : job.task ? `${job.task.contractCode ? `订单 ${job.task.contractCode}` : '备货'} · ${[job.task.product, job.task.spec].filter(Boolean).join(' ')}` : '自己开单'"
      :title="`${job.process?.label} · 第 1 步 ${job.supplement ? '补领' : '领材料'}`"
      :total="job.supplement ? 2 : 3"
      @back="emit('back')"
    />
    <main class="grid flex-1 grid-cols-1 content-start gap-4 p-4 md:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <div class="flex min-w-0 flex-col gap-3">
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
          </div>
          <span v-else class="text-xs text-muted-foreground">这张单是按配方领的，点下面按配方算出还差哪些料</span>
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
            标红的原料库存不够，先领有的，到料后在「我手上在做的」里点「料不够，补领」。
          </p>
        </section>

        <div v-if="!job.supplement && (job.process?.sources.length ?? 0) > 1" class="flex flex-wrap items-center gap-1.5 text-sm">
          <span class="text-muted-foreground">从哪领：</span>
          <button
            v-for="code in job.process?.sources"
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
          <Spin :spinning="loading">
            <Empty v-if="!loading && stocks.length === 0" :description="`${source?.label ?? ''}现在没有库存`" />
            <div v-else class="flex flex-col divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
              <div
                v-for="(s, i) in stocks"
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
                      <span v-else-if="i === 0 && !pickOf(s)" class="shrink-0 rounded bg-primary/10 px-1.5 text-xs font-normal leading-5 text-primary">先领这批</span>
                    </span>
                    <span class="text-xs text-muted-foreground">
                      批次 {{ s.batchNo }} · 库里有 {{ formatQty(s.quantity) }} {{ unit }}
                      <template v-if="s.item?.rawMaterialCode && recipeNeeds[s.item.rawMaterialCode] !== undefined"> · 配方要 {{ formatQty(recipeNeeds[s.item.rawMaterialCode]) }} {{ unit }}</template>
                    </span>
                  </span>
                </button>
                <span v-if="pickOf(s)" class="flex shrink-0 items-center gap-1.5">
                  <InputNumber
                    :id="`pick-${s.id}`"
                    :aria-label="`${nameOf(s)} 领用数量`"
                    :max="toNumber(s.quantity)"
                    :min="0"
                    :precision="3"
                    :addon-after="unit"
                    :value="pickOf(s)!.qty || undefined"
                    class="w-36"
                    placeholder="领多少"
                    @change="(v) => setQty(s, v)"
                  />
                  <button class="text-xs text-primary hover:underline" type="button" @click="setQty(s, s.quantity)">全部</button>
                </span>
              </div>
            </div>
          </Spin>
        </section>
      </div>

      <aside class="flex min-w-0 flex-col gap-2 md:sticky md:top-4 md:self-start">
        <section class="flex flex-col gap-2 rounded-lg border border-border bg-card p-3">
          <h3 class="m-0 flex items-baseline justify-between text-sm font-bold">
            本次领料
            <span class="text-xs font-normal text-muted-foreground">{{ job.picks.length }} 种 · 共 {{ formatQty(pickTotal) }} {{ unit }}</span>
          </h3>
          <p v-if="job.picks.length === 0" class="m-0 text-xs text-muted-foreground">还没选料，在左边点要用的料。</p>
          <table v-else class="w-full text-sm">
            <thead>
              <tr class="text-left text-xs text-muted-foreground">
                <th class="py-1 font-normal">材料</th>
                <th class="py-1 font-normal">批次</th>
                <th class="py-1 text-right font-normal">领用</th>
                <th class="w-6"></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="p in job.picks" :key="p.stock.id" class="border-t border-border">
                <td class="py-1.5 pr-2">
                  <span class="font-semibold">{{ nameOf(p.stock) }}</span>
                  <span v-if="p.side" class="ml-1 text-xs text-primary">{{ sideText(p.side) }}</span>
                </td>
                <td class="py-1.5 pr-2 font-mono text-xs text-muted-foreground">{{ p.stock.batchNo }}</td>
                <td class="whitespace-nowrap py-1.5 text-right tabular-nums" :class="p.qty > 0 ? 'font-semibold' : 'text-destructive'">
                  {{ p.qty > 0 ? `${formatQty(p.qty)} ${unit}` : '未填' }}
                </td>
                <td class="py-1.5 text-right">
                  <button :aria-label="`去掉 ${nameOf(p.stock)}`" class="text-muted-foreground hover:text-destructive" type="button" @click="toggle(p.stock)">×</button>
                </td>
              </tr>
            </tbody>
          </table>
        </section>
        <button class="h-10 rounded-md bg-primary text-sm font-semibold text-primary-foreground" type="button" @click="next">下一步：确认领料</button>
      </aside>
    </main>
  </div>
</template>
