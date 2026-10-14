<script setup lang="ts">
import type { FdmgongchangFactoryApi } from '#/api/fdmgongchang/factory';
import type { FdmgongchangScheduleApi as Api } from '#/api/fdmgongchang/schedule';

import { computed, ref, watch } from 'vue';

import { Alert, Input, InputNumber, Modal, Select } from 'ant-design-vue';
import dayjs from 'dayjs';

import { dateText, dayLabel } from '../../shared/schedule';

/**
 * 手动派工的一个任务：哪天、哪道工序、做哪张订单（或备货）、做多少、谁来做。
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
const product = ref('');
const spec = ref('');
const quantity = ref<null | number>(null);
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
  product.value = t?.product ?? '';
  spec.value = t?.spec ?? '';
  quantity.value = t ? Number(t.quantity) : null;
  workerIds.value = [...(t?.workerIds ?? [])];
  reason.value = t?.reason ?? '';
  errors.value = [];
});

/** 换工序后，没有这道工序岗位的人去掉。 */
watch(process, () => {
  const allowed = new Set(workerOptions.value.map((w) => w.value));
  workerIds.value = workerIds.value.filter((id) => allowed.has(id));
});

/** 选了订单、产品还没填时，带出订单上的产品。 */
watch(order, (code) => {
  if (code === STOCK || product.value.trim()) return;
  product.value = props.options?.demand.find((d) => d.contractCode === code)?.product ?? '';
});

async function save() {
  errors.value = [];
  if (!date.value) errors.value.push('请选择日期。');
  if (!process.value) errors.value.push('请选择工序。');
  if (!(quantity.value && quantity.value > 0)) errors.value.push('请填写数量，要大于 0。');
  if (errors.value.length > 0) return;
  saving.value = true;
  try {
    await props.submit({
      contractCode: order.value === STOCK ? null : order.value,
      date: date.value,
      process: process.value!,
      product: product.value.trim() || null,
      quantity: quantity.value!,
      reason: reason.value.trim() || null,
      sequence: props.initial?.date === date.value && props.initial?.process === process.value ? props.initial?.sequence : null,
      spec: spec.value.trim() || null,
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
      <label for="task-form-product" class="flex flex-col gap-1">
        产品（选填）
        <Input id="task-form-product" v-model:value="product" :maxlength="200" placeholder="例如 紫色瑜伽垫" />
      </label>
      <label for="task-form-spec" class="flex flex-col gap-1">
        规格（选填）
        <Input id="task-form-spec" v-model:value="spec" :maxlength="200" placeholder="例如 183x61x0.6" />
      </label>
      <label for="task-form-quantity" class="flex flex-col gap-1">
        做多少
        <span class="flex items-center gap-2">
          <InputNumber
            id="task-form-quantity"
            :min="0"
            :value="quantity ?? undefined"
            class="flex-1"
            @update:value="(v) => (quantity = (v as null | number | undefined) ?? null)"
          />
          <span class="w-6 shrink-0 text-foreground">{{ unit }}</span>
        </span>
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
