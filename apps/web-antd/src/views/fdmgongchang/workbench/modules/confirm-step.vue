<script setup lang="ts">
import type { FdmgongchangProductionOrderApi as OrderApi } from '#/api/fdmgongchang/production-order';

import { computed, onMounted, ref } from 'vue';

import { InputNumber, Select } from 'ant-design-vue';

import { getWorkbenchProductionOrders } from '#/api/fdmgongchang/workbench';
import ImageUpload from '#/components/upload/image-upload.vue';

import { finalProcess } from '../../production-order/shared';
import { attrSummary, formatQty, frozenLayerRule, frozenPlainEmboss, makeLabels, toNumber } from '../../stage-stock/model';
import { stageOf, useJob } from '../use-job';
import IssueShortages from './issue-shortages.vue';
import StepHeader from './step-header.vue';

/** 第 2 步 确认领料：只显示领多少、领什么、领完还剩多少。 */
const props = defineProps<{ reportAfterPicking?: boolean; submitting: boolean }>();
const emit = defineEmits<{ back: []; issueOnly: []; reportNow: [] }>();
const job = useJob();
const labels = computed(() => makeLabels(job.options));
const source = computed(() => stageOf(job, job.sourceStage));
const total = computed(() => job.picks.reduce((t, p) => t + (p.qty || 0), 0));

const independent = computed(() => !job.supplement && !job.task);
const foaming = computed(() => job.process?.code === 'MIX');
const independentFoaming = computed(() => foaming.value && independent.value);
const recipes = computed(() => (job.options?.recipes ?? []).filter((recipe) => recipe.enabled)
  .map((recipe) => ({ label: `${recipe.name}（${recipe.code}）`, value: recipe.code })));
const recipeCode = ref(job.recipe?.code ?? (recipes.value.length === 1 ? recipes.value[0]?.value : undefined));
const recipeBatches = ref(job.recipe?.batches);
// 手动开包装单时，成品入库需要订单明细来确定商品。
const packaging = computed(() => independent.value && job.process?.code === 'PACK');
const openOrders = ref<OrderApi.Order[]>([]);
const ordersLoading = ref(false);
const ordersFailed = ref(false);
const orderChoices = computed(() =>
  openOrders.value.flatMap((o) =>
    o.items
      .filter((i) => Number(i.quantity) > Number(i.completedQuantity) && finalProcess(i) === job.process?.code)
      .map((i) => ({
        allowPlainEmboss: frozenPlainEmboss(i),
        layerRule: frozenLayerRule(i),
        targetThickness: i.targetThickness,
        id: i.id,
        label: i.productName,
        left: `还差 ${formatQty(Number(i.quantity) - Number(i.completedQuantity))} ${i.unit ?? ''}`,
        orderNo: o.orderNo,
        party: o.requesterDeptName || o.requesterName || '',
      })),
  ),
);
async function loadOrders() {
  ordersLoading.value = true;
  ordersFailed.value = false;
  try {
    openOrders.value = await getWorkbenchProductionOrders();
  } catch {
    ordersFailed.value = true;
  } finally {
    ordersLoading.value = false;
  }
}
onMounted(() => {
  if (packaging.value) void loadOrders();
});
/** 已完工的单补登领料：要写原因。 */
const late = computed(() => job.supplement && job.order?.status === 'COMPLETED');
const reasons = ['实际多拿了料没登记', '损耗比预计多'];
const orderText = computed(() => {
  if (job.supplement) {
    return `${late.value ? '补登到' : '补到'} ${job.order?.orderNo ?? ''}`;
  }
  const orderNo = job.task?.contractCode || job.productionItem?.orderNo;
  if (orderNo) return orderNo;
  if (packaging.value) return '待选择';
  return independent.value ? '独立生产' : '备货';
});
const cannotIssue = computed(() => props.submitting
  || (late.value && !job.supplementRemark.trim())
  || (independentFoaming.value && (!recipeCode.value || !recipeBatches.value || recipeBatches.value <= 0 || recipeBatches.value > 9999))
  || (packaging.value && !orderChoices.value.some((choice) => choice.id === job.productionItem?.id)));

function confirm(reportNow = false) {
  if (cannotIssue.value) return;
  if (independentFoaming.value) {
    job.recipe = { batches: recipeBatches.value!, code: recipeCode.value! };
  }
  if (reportNow) emit('reportNow');
  else emit('issueOnly');
}
</script>

<template>
  <div class="mx-auto flex min-h-full w-full max-w-[720px] flex-col">
    <StepHeader
      :current="foaming ? undefined : 2"
      :subtitle="foaming ? undefined : job.supplement ? `${late ? '补登到' : '补到'} ${job.order?.orderNo ?? ''}，看一眼，对了就点确认` : '看一眼，对了就点确认'"
      :title="foaming ? '发泡 · 确认开工' : `${job.process?.label} · 第 2 步 ${late ? '确认补登' : job.supplement ? '确认补领' : '确认领料'}`"
      :total="foaming ? undefined : 2"
      @back="emit('back')"
    />
    <main class="flex flex-1 flex-col gap-3 p-4">
      <section class="flex flex-col gap-2 rounded-lg border border-border bg-card p-3">
        <div v-if="independentFoaming" class="flex flex-wrap items-end gap-3 text-sm">
          <label for="recipe-code" class="flex min-w-48 flex-1 flex-col gap-1">
            发泡配方
            <Select id="recipe-code" v-model:value="recipeCode" :options="recipes" option-filter-prop="label" placeholder="选择配方" show-search />
          </label>
          <label for="recipe-batches" class="flex flex-col gap-1">
            预计锅数
            <InputNumber
              id="recipe-batches" :value="recipeBatches" :min="0.1" :max="9999" :precision="1"
              addon-after="锅" class="w-32" @update:value="(value) => (recipeBatches = toNumber(value))"
            />
          </label>
        </div>
        <template v-else-if="foaming">
          <p v-if="job.prepare?.target" class="m-0 text-sm">{{ job.prepare.target }}</p>
          <p v-if="job.recipe" class="m-0 text-sm">
            配方 {{ labels.recipe(job.recipe.code) }}<template v-if="job.recipe.batches"> · 预计 {{ formatQty(job.recipe.batches) }} 锅</template>
          </p>
        </template>
        <h3 v-else class="m-0 flex items-baseline justify-between text-sm font-bold">
          从{{ source?.label }}领走
          <span class="text-xs font-normal text-muted-foreground">{{ job.picks.length }} 批次 · 共 {{ formatQty(total) }} {{ source?.unit }}</span>
        </h3>
        <table v-if="!foaming" class="w-full text-sm">
          <thead>
            <tr class="text-left text-xs text-muted-foreground">
              <th class="py-1 font-normal">材料</th>
              <th class="py-1 font-normal">批次</th>
              <th class="py-1 text-right font-normal">领用</th>
              <th class="py-1 text-right font-normal">领完还剩</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="p in job.picks" :key="`${p.stock.id}:${p.side ?? ''}`" class="border-t border-border">
              <td class="py-1.5 pr-2">
                <span class="font-semibold">{{ attrSummary(p.stock.stage, p.stock.item, labels, [], 'mm') || p.stock.itemCode }}</span>
                <span v-if="p.side" class="ml-1 text-xs text-primary">{{ p.side === 'FRONT' ? '正面' : '反面' }}</span>
              </td>
              <td class="py-1.5 pr-2 font-mono text-xs text-muted-foreground">{{ p.stock.batchNo }}</td>
              <td class="whitespace-nowrap py-1.5 text-right font-semibold tabular-nums">{{ formatQty(p.qty) }} {{ source?.unit }}</td>
              <td class="whitespace-nowrap py-1.5 text-right tabular-nums" :class="(toNumber(p.stock.quantity) ?? 0) - p.qty < 0 ? 'font-semibold text-destructive' : 'text-muted-foreground'">
                {{ formatQty((toNumber(p.stock.quantity) ?? 0) - p.qty) }} {{ source?.unit }}
              </td>
            </tr>
          </tbody>
        </table>
        <div class="grid grid-cols-2 gap-2 border-t border-dashed border-border pt-2 text-xs">
          <div class="flex flex-col"><span class="text-muted-foreground">做的订单</span><b class="text-sm">{{ orderText }}</b></div>
          <div class="flex flex-col"><span class="text-muted-foreground">做的人</span><b class="text-sm">{{ job.my?.userName }}{{ job.my?.team ? `（${job.my.team}）` : '' }}</b></div>
        </div>
      </section>
      <IssueShortages v-if="!foaming" />
      <p v-if="independent && !packaging" class="m-0 rounded-md bg-primary/5 p-3 text-sm">
        <template v-if="job.process?.code === 'SLICE'">本次为独立开片，所有板材登记在同一张工序单。产出按实际领料的颜色、长宽和填写的单层厚度分别入库，不计入已下发任务或订单进度。</template>
        <template v-else>本次为独立{{ job.process?.label }}，产出入库，不计入已下发任务或订单进度。</template>
      </p>
      <section v-if="job.task && !job.supplement && !foaming" class="flex flex-col gap-2 rounded-lg border border-border bg-card p-3">
        <span class="text-sm font-bold">本次领料凭证<span class="ml-1 font-normal text-muted-foreground">（选填）</span></span>
        <ImageUpload v-model:value="job.sheets" :max-number="9" :max-size="10" :show-description="false" directory="fdmgongchang/issue-sheet" multiple />
        <span class="text-xs text-muted-foreground">可拍照留存实际领取批次和数量，后续报工沿用已上传的凭证。</span>
      </section>
      <section v-if="packaging" class="flex flex-col gap-1.5 rounded-lg border border-border bg-card p-3">
        <span class="text-sm font-bold">选择包装对应的工厂订单</span>
        <span class="text-xs text-muted-foreground">包装良品按所选订单明细入成品仓，并计入对应订单的完成数量。</span>
        <span v-if="ordersLoading" class="text-sm text-muted-foreground">正在加载工厂订单…</span>
        <div v-else-if="ordersFailed" class="text-sm text-destructive">
          工厂订单加载失败
          <button type="button" class="px-2 text-primary" @click="loadOrders">重试</button>
        </div>
        <span v-else-if="orderChoices.length === 0" class="text-sm text-muted-foreground">当前没有待完成且以包装为最后一道工序的订单明细。</span>
        <button
          v-for="c in orderChoices"
          :key="c.id"
          :class="job.productionItem?.id === c.id ? 'border-primary bg-primary/10' : 'border-border'"
          class="flex flex-col items-start justify-center rounded-md border px-3 py-1.5 text-left"
          type="button"
          :aria-pressed="job.productionItem?.id === c.id"
          :disabled="props.submitting"
          @click="job.productionItem = c"
        >
          <span class="text-sm font-semibold">{{ c.label }}</span>
          <span class="text-xs text-muted-foreground">{{ c.orderNo }} · {{ c.party }} · {{ c.left }}</span>
        </button>
      </section>
      <section v-if="late" class="flex flex-col gap-1.5 rounded-lg border border-warning/60 bg-card p-3">
        <label for="workbench-late-reason" class="text-sm font-bold">为什么要补登？<span class="font-normal text-destructive">（必填）</span></label>
        <div class="flex flex-wrap gap-1.5">
          <button
            v-for="r in reasons"
            :key="r"
            :class="job.supplementRemark === r ? 'border-primary bg-primary/10 text-primary' : 'border-border'"
            class="h-8 rounded-md border px-2.5 text-sm"
            type="button"
            @click="job.supplementRemark = r"
          >
            {{ r }}
          </button>
        </div>
        <input
          id="workbench-late-reason"
          v-model="job.supplementRemark"
          class="h-9 rounded-md border border-border bg-background px-2 text-sm"
          maxlength="200"
          placeholder="也可以自己写"
        />
      </section>
      <p v-if="foaming" class="m-0 text-xs leading-relaxed text-muted-foreground">
        用量按配方估算，实际原料出入库由仓库另行登记。
      </p>
      <p v-else-if="reportAfterPicking" class="m-0 text-xs leading-relaxed text-muted-foreground">
        继续填写实际产出，最后一起提交领料和报工。
      </p>
      <p v-else-if="late" class="m-0 text-xs leading-relaxed text-muted-foreground">
        这张单已经完工。补登的料从{{ source?.label }}库存扣掉，算进这张单的领料，会记下是你补登的和原因。
      </p>
      <p v-else-if="job.supplement" class="m-0 text-xs leading-relaxed text-muted-foreground">
        补领的料从{{ source?.label }}库存扣掉，加到你手上这张单里。做完后在「在制工序单」点「报本工序产出」。
      </p>
      <p v-else class="m-0 text-xs leading-relaxed text-muted-foreground">
        确认后从{{ source?.label }}库存扣减本次领料，生成在制工序单。生产完成后，在「在制工序单」报本工序实际产出。
      </p>
    </main>
    <footer class="sticky bottom-0 grid grid-cols-1 gap-2 border-t border-border bg-card px-4 pb-4 pt-3 sm:grid-cols-2">
      <button
        v-if="!reportAfterPicking"
        :disabled="cannotIssue"
        class="h-10 rounded-md bg-primary text-sm font-semibold text-primary-foreground disabled:opacity-50"
        type="button"
        @click="confirm()"
      >
        {{ foaming ? '确认开工' : late ? '确认补登' : job.supplement ? '确认补领，接着干活' : '确认领料，去干活' }}
      </button>
      <button
        v-if="independent" :disabled="cannotIssue"
        :class="reportAfterPicking ? 'bg-primary text-primary-foreground sm:col-span-2' : 'bg-primary/10 text-primary'"
        class="h-10 rounded-md text-sm font-semibold disabled:opacity-50" type="button" @click="confirm(true)"
      >
        {{ foaming ? '已经做完了，直接报工' : '已经做完了，领料同时报数量' }}
      </button>
    </footer>
  </div>
</template>
