<script setup lang="ts">
import type { StageChoice } from '../../shared/schedule';

import type { FdmgongchangFactoryApi } from '#/api/fdmgongchang/factory';
import type { FdmgongchangScheduleApi as Api } from '#/api/fdmgongchang/schedule';

import { computed, onBeforeUnmount, ref, watch } from 'vue';

import { Alert, Input, InputNumber, Modal, Select } from 'ant-design-vue';
import dayjs from 'dayjs';

import { searchScheduleProducts } from '#/api/fdmgongchang/schedule';

import { specText } from '../../production-order/shared';
import { dateText, dayLabel, stageTaskPlan } from '../../shared/schedule';

/**
 * 手动派工的一个任务：哪天、哪道工序、做哪张订单（或备货）、做什么产品、做多少、谁来做。
 * 产品从产品中心选：选了订单时列这张订单里的产品，备货时搜产品中心；规格跟着产品带出，不手填。
 * 密炼产出的是板材、开片产出的是片材，不是成品：规格和建议数量按用料逆推的板材带出。
 * 待确认的排单加进方案里；已下发的排单直接保存，工人工作台马上能看到。
 */
const props = defineProps<{
  /** 改任务时传原来的内容；不传是新加。 */
  initial?: Api.PlanTask | null;
  options?: Api.FormOptions | null;
  schedule: Api.Schedule;
  submit: (task: Api.PlanTask) => Promise<void>;
  workers: FdmgongchangFactoryApi.Worker[];
}>();
const open = defineModel<boolean>('open', { required: true });

const STOCK = '__STOCK__';
const date = ref('');
const process = ref<string>();
const order = ref<string>(STOCK);
/** 选中的产品（下拉的 key）；产品名称和规格跟着它带出。 */
const productKey = ref<string>();
const keyword = ref('');
const searching = ref(false);
/** 备货时搜到的产品中心产品。 */
const found = ref<ProductChoice[]>([]);

interface ProductChoice extends StageChoice {
  code?: null | string;
  key: string;
}
const quantity = ref<null | number>(null);
/** 数量是系统带出的建议（没手改过）：换工序、换产品时跟着换。 */
const autoQuantity = ref(false);
const workerIds = ref<number[]>([]);
const reason = ref('');
const errors = ref<string[]>([]);
const saving = ref(false);

const dates = computed(() => {
  const start = new Date(`${dateText(props.schedule.startDate)}T00:00:00`);
  const pad = (n: number) => String(n).padStart(2, '0');
  return Array.from({ length: props.schedule.days }, (_, i) => {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  });
});
const dateOptions = computed(() => dates.value.map((d) => ({ label: dayLabel(d), value: d })));
const processOptions = computed(() =>
  (props.options?.processes ?? []).map((p) => ({ label: p.label, value: p.code })),
);
const unit = computed(() => props.options?.processes.find((p) => p.code === process.value)?.unit ?? '');
/** 同一张订单的几个产品合成一项。 */
const orderOptions = computed(() => {
  const products = new Map<string, Set<string>>();
  for (const d of props.options?.demand ?? []) {
    const set = products.get(d.contractCode) ?? new Set<string>();
    if (d.product) set.add(d.product);
    products.set(d.contractCode, set);
  }
  return [
    { label: '备货（不算哪张订单）', value: STOCK },
    ...[...products].map(([code, set]) => ({ label: [code, ...set].join(' · '), value: code })),
  ];
});
/** 原来任务上的产品（AI 排的或旧数据，不一定在产品中心里），改任务时保留可选。 */
const current = computed<null | ProductChoice>(() =>
  props.initial?.product ? { key: '__CURRENT__', name: props.initial.product, spec: props.initial.spec ?? '' } : null,
);
const choices = computed<ProductChoice[]>(() => {
  const list: ProductChoice[] =
    order.value === STOCK
      ? found.value
      : (props.options?.demand ?? [])
          .filter((d) => d.contractCode === order.value && d.product)
          .map((d) => ({
            boards: d.boards,
            boardSpec: d.boardSpec,
            code: d.productCode,
            key: d.productId || `name:${d.product}`,
            name: d.product!,
            remaining: d.remaining === null || d.remaining === undefined ? null : Number(d.remaining),
            sheets: d.sheets,
            sheetSpec: d.sheetSpec,
            spec: d.spec ?? '',
          }));
  const keep = current.value;
  return keep && !list.some((c) => c.name === keep.name && c.spec === keep.spec) ? [keep, ...list] : list;
});
const productOptions = computed(() =>
  choices.value.map((c) => ({ label: [c.name, c.code].filter(Boolean).join(' · '), value: c.key })),
);
const picked = computed(() => choices.value.find((c) => c.key === productKey.value));

/** 密炼做板材、开片做片材：规格、建议数量按用料逆推带出；原来任务上的产品保留原规格、不带建议。 */
const keepCurrent = computed(() => picked.value?.key === '__CURRENT__');
const stagePlan = computed(() => (picked.value ? stageTaskPlan(process.value, picked.value) : null));
const stageOutput = computed(() => stagePlan.value?.kind);
const taskSpec = computed(() => (keepCurrent.value ? picked.value!.spec : (stagePlan.value?.spec ?? '')));
const suggested = computed(() => (keepCurrent.value ? null : (stagePlan.value?.suggested ?? null)));
const suggestText = computed(() => (keepCurrent.value ? '' : (stagePlan.value?.hint ?? '')));

let timer: ReturnType<typeof setTimeout> | undefined;
let seq = 0;
onBeforeUnmount(() => clearTimeout(timer));
/** 备货时按名称、编码或规格搜产品中心。 */
function search(value: string) {
  keyword.value = value;
  if (order.value !== STOCK) return;
  clearTimeout(timer);
  const k = value.trim();
  if (!k) return;
  timer = setTimeout(async () => {
    const mine = ++seq;
    searching.value = true;
    try {
      const list = await searchScheduleProducts(k);
      if (mine !== seq) return;
      const keep = picked.value;
      found.value = [
        ...(keep && keep.key !== '__CURRENT__' && !list.some((p) => p.id === keep.key) ? [keep] : []),
        ...list.map((p) => ({ code: p.code, key: p.id, name: p.displayName ?? p.name, spec: specText(p) })),
      ];
    } finally {
      if (mine === seq) searching.value = false;
    }
  }, 300);
}

const workerOptions = computed(() =>
  props.workers
    .filter((w) => !process.value || w.posts.includes(process.value))
    .map((w) => ({ label: [w.nickname, w.team].filter(Boolean).join(' · '), value: w.userId })),
);

watch([open, () => props.initial], ([value]) => {
  if (!value) return;
  const t = props.initial;
  date.value = t?.date ?? dates.value.find((d) => d >= dayjs().format('YYYY-MM-DD')) ?? dates.value[0] ?? '';
  process.value = t?.process ?? undefined;
  order.value = t?.contractCode || STOCK;
  found.value = [];
  keyword.value = '';
  productKey.value = t?.product ? '__CURRENT__' : undefined;
  quantity.value = t ? Number(t.quantity) : null;
  autoQuantity.value = !t;
  workerIds.value = [...(t?.workerIds ?? [])];
  reason.value = t?.reason ?? '';
  errors.value = [];
});

/** 换工序后，没有这道工序岗位的人去掉。 */
watch(process, () => {
  const allowed = new Set(workerOptions.value.map((w) => w.value));
  workerIds.value = workerIds.value.filter((id) => allowed.has(id));
});

/** 换工序、换产品时带出建议数量；手改过的不动。 */
watch(suggested, (value) => {
  if (!open.value || !autoQuantity.value) return;
  quantity.value = value;
});
function inputQuantity(v: null | number | undefined) {
  quantity.value = v ?? null;
  autoQuantity.value = false;
}

/** 换了订单：原来选的产品不在这张单里就清掉；单里只有一个产品时直接选上。 */
watch(order, () => {
  if (!choices.value.some((c) => c.key === productKey.value)) productKey.value = undefined;
  const own = choices.value.filter((c) => c.key !== '__CURRENT__');
  if (!productKey.value && order.value !== STOCK && own.length === 1) productKey.value = own[0]!.key;
});

async function save() {
  errors.value = [];
  if (!date.value) errors.value.push('请选择日期。');
  if (!process.value) errors.value.push('请选择工序。');
  if (!picked.value) errors.value.push('请从产品中心选择产品。');
  if (!(quantity.value && quantity.value > 0)) errors.value.push('请填写数量，要大于 0。');
  if (errors.value.length > 0) return;
  saving.value = true;
  try {
    await props.submit({
      contractCode: order.value === STOCK ? null : order.value,
      date: date.value,
      process: process.value!,
      product: picked.value!.name,
      quantity: quantity.value!,
      reason: reason.value.trim() || null,
      sequence: props.initial?.date === date.value && props.initial?.process === process.value ? props.initial?.sequence : null,
      spec: taskSpec.value || null,
      unit: unit.value || null,
      workerIds: workerIds.value,
    });
    open.value = false;
  } catch {
    // 后端错误已由全局提示展示
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <Modal
    v-model:open="open"
    :confirm-loading="saving"
    :title="initial ? '修改任务' : '添加任务'"
    :width="560"
    ok-text="保存"
    @ok="save"
  >
    <div class="grid grid-cols-1 gap-3 text-xs text-muted-foreground sm:grid-cols-2">
      <label for="task-form-date" class="flex flex-col gap-1">
        哪天
        <Select id="task-form-date" v-model:value="date" :options="dateOptions" />
      </label>
      <label for="task-form-process" class="flex flex-col gap-1">
        工序
        <Select id="task-form-process" v-model:value="process" :options="processOptions" placeholder="选工序" />
      </label>
      <label for="task-form-order" class="flex flex-col gap-1 sm:col-span-2">
        做哪张订单
        <Select id="task-form-order" v-model:value="order" :options="orderOptions" option-filter-prop="label" show-search />
      </label>
      <label for="task-form-product" class="flex flex-col gap-1 sm:col-span-2">
        做什么产品（从产品中心选）
        <Select
          id="task-form-product"
          v-model:value="productKey"
          :filter-option="order === STOCK ? false : undefined"
          :loading="searching"
          :not-found-content="order === STOCK ? (keyword.trim() ? '产品中心没有找到，新产品请先在「产品中心 → 产品档案」建档' : '输入名称、编码或规格搜索') : '这张订单里没有产品'"
          :options="productOptions"
          :placeholder="order === STOCK ? '搜产品中心：名称、编码或规格' : '选这张订单里的产品'"
          option-filter-prop="label"
          show-search
          @search="search"
        />
        <span v-if="picked" class="text-foreground">
          <template v-if="stageOutput">{{ stageOutput === 'board' ? '做板材' : '做片材' }}，</template>规格：{{ taskSpec || '—' }}
        </span>
      </label>
      <label for="task-form-quantity" class="flex flex-col gap-1">
        做多少
        <span class="flex items-center gap-2">
          <InputNumber
            id="task-form-quantity"
            :min="0"
            :value="quantity ?? undefined"
            class="flex-1"
            @update:value="(v) => inputQuantity(v as null | number | undefined)"
          />
          <span class="w-6 shrink-0 text-foreground">{{ unit }}</span>
        </span>
        <span v-if="suggestText" :class="suggested ? 'text-muted-foreground' : 'text-warning'">{{ suggestText }}</span>
      </label>
      <label for="task-form-workers" class="flex flex-col gap-1">
        谁来做
        <Select
          id="task-form-workers"
          v-model:value="workerIds"
          :options="workerOptions"
          mode="multiple"
          option-filter-prop="label"
          :placeholder="process ? '只列有这道工序岗位的人' : '先选工序'"
        />
      </label>
      <label for="task-form-reason" class="flex flex-col gap-1 sm:col-span-2">
        说明（选填）
        <Input id="task-form-reason" v-model:value="reason" :maxlength="300" placeholder="例如 先做紫色，下午换蓝色" />
      </label>
      <Alert v-if="errors.length > 0" class="sm:col-span-2" show-icon type="error">
        <template #message>
          <ul class="m-0 list-disc pl-4">
            <li v-for="e in errors" :key="e">{{ e }}</li>
          </ul>
        </template>
      </Alert>
    </div>
  </Modal>
</template>
