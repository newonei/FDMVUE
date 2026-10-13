<script setup lang="ts">
import type { FdmgongchangFactoryApi } from '#/api/fdmgongchang/factory';
import type { FdmgongchangProductionOrderApi } from '#/api/fdmgongchang/production-order';
import type { FdmgongchangStageStockApi as Api } from '#/api/fdmgongchang/stage-stock';
import type { FdmgongchangWageApi } from '#/api/fdmgongchang/wage';

import { computed, onBeforeUnmount, ref, watch } from 'vue';

import { useUserStore } from '@vben/stores';

import { Empty, Input, InputNumber, Modal, Select, Spin } from 'ant-design-vue';

import { getOpenProductionOrders } from '#/api/fdmgongchang/production-order';
import { createExtraOrder, getOrderOperators, getStockPage } from '#/api/fdmgongchang/stage-stock';
import { matchWageItems } from '#/api/fdmgongchang/wage';

import { finalProcess, routeIncludes } from '../../production-order/shared';
import { attrSummary, extraProcessesAt, formatQty, makeLabels, roundQty } from '../model';

/**
 * 附加工序报工（打孔、全检等，不改变规格）：选这个阶段的库存行，填加工数量和其中的残次，一次登记完。
 * 残次从这一行库存扣掉，良品原地不动；可关联工厂订单（工艺最后一道时累加完成数量），可同时登记计件。
 */
const props = defineProps<{ options: Api.Options; stage: string }>();
const emit = defineEmits<{ saved: [text: string] }>();
const open = defineModel<boolean>('open', { required: true });

interface Row {
  defect: null | number;
  quantity: null | number;
  stock: Api.Stock;
}

const userStore = useUserStore();
const labels = computed(() => makeLabels(props.options));
const stageOption = computed(() => props.options.stages.find((s) => s.code === props.stage));
const processes = computed(() => extraProcessesAt(props.options, props.stage));
const process = ref<string>();
const keyword = ref('');
const rows = ref<Row[]>([]);
const loading = ref(false);
const productionOrders = ref<FdmgongchangProductionOrderApi.Order[]>([]);
const productionItemId = ref<number>();
const operators = ref<FdmgongchangFactoryApi.Operator[]>([]);
const operatorUserId = ref<number>();
const wageItems = ref<FdmgongchangWageApi.Match[]>([]);
const wageItemId = ref<number>();
const remark = ref('');
const saving = ref(false);
const error = ref('');

const processLabel = computed(() => processes.value.find((p) => p.code === process.value)?.label ?? '');
const filled = computed(() => rows.value.filter((r) => (r.quantity ?? 0) > 0));
const totals = computed(() => {
  const quantity = roundQty(filled.value.reduce((t, r) => t + (r.quantity ?? 0), 0));
  const defect = roundQty(filled.value.reduce((t, r) => t + (r.defect ?? 0), 0));
  return { defect, good: roundQty(quantity - defect), quantity };
});
const itemOptions = computed(() =>
  productionOrders.value.flatMap((o) =>
    o.items
      .filter((i) => Number(i.quantity) > Number(i.completedQuantity) && (i.processes ?? []).length > 0)
      .filter((i) => process.value && routeIncludes(i, process.value))
      .map((i) => ({
        label: `${o.orderNo} · ${o.requesterDeptName || o.requesterName || ''} · ${i.productName}${finalProcess(i) === process.value ? '（最后一道，累加完成数量）' : ''}`,
        value: i.id,
      })),
  ),
);

async function loadStock() {
  loading.value = true;
  try {
    const page = await getStockPage({
      keyword: keyword.value.trim() || undefined,
      pageNo: 1,
      pageSize: 50,
      showZero: false,
      stage: props.stage,
    });
    // 已填过数量的行保留，搜索只是换一批可选的行
    const kept = filled.value;
    rows.value = [
      ...kept,
      ...page.list
        .filter((s) => !kept.some((k) => k.stock.id === s.id))
        .map((stock) => ({ defect: null, quantity: null, stock })),
    ];
  } catch {
    rows.value = filled.value;
  } finally {
    loading.value = false;
  }
}

let timer: ReturnType<typeof setTimeout> | undefined;
watch(keyword, () => {
  clearTimeout(timer);
  timer = setTimeout(loadStock, 300);
});
onBeforeUnmount(() => clearTimeout(timer));

watch(open, async (value) => {
  if (!value) return;
  process.value = processes.value[0]?.code;
  keyword.value = '';
  rows.value = [];
  productionItemId.value = undefined;
  operatorUserId.value = undefined;
  wageItemId.value = undefined;
  remark.value = '';
  error.value = '';
  await Promise.all([
    loadStock(),
    getOpenProductionOrders()
      .then((list) => (productionOrders.value = list))
      .catch(() => (productionOrders.value = [])),
  ]);
});

watch(process, async (code) => {
  productionItemId.value = undefined;
  wageItemId.value = undefined;
  operators.value = [];
  wageItems.value = [];
  if (!code) return;
  const [ops, wages] = await Promise.all([
    getOrderOperators(code).catch(() => []),
    matchWageItems({ process: code }).catch(() => []),
  ]);
  if (code !== process.value) return;
  operators.value = ops;
  wageItems.value = wages;
  if (wages.length === 1) wageItemId.value = wages[0]!.itemId;
});

async function submit() {
  error.value = '';
  if (!process.value) {
    error.value = '请选择附加工序';
    return;
  }
  if (filled.value.length === 0) {
    error.value = '请至少在一行库存上填加工数量';
    return;
  }
  const bad = filled.value.find((r) => (r.defect ?? 0) > (r.quantity ?? 0));
  if (bad) {
    error.value = `${bad.stock.batchNo}：残次不能多于加工数量`;
    return;
  }
  const over = filled.value.find((r) => (r.quantity ?? 0) > Number(r.stock.quantity));
  if (over) {
    error.value = `${over.stock.batchNo} 只有 ${formatQty(over.stock.quantity)}，加工数量不能更多`;
    return;
  }
  const userId = operatorUserId.value ?? userStore.userInfo?.id;
  saving.value = true;
  try {
    await createExtraOrder({
      lines: filled.value.map((r) => ({
        defectQuantity: r.defect ?? 0,
        quantity: r.quantity as number,
        stockId: r.stock.id,
      })),
      operatorUserId: operatorUserId.value,
      pieceworks:
        wageItemId.value && userId && totals.value.good > 0
          ? [{ itemId: wageItemId.value, quantity: totals.value.good, userId: Number(userId) }]
          : [],
      process: process.value,
      productionOrderItemId: productionItemId.value,
      remark: remark.value.trim() || undefined,
    });
    open.value = false;
    emit(
      'saved',
      `已登记${processLabel.value}：良品 ${formatQty(totals.value.good)}，残次 ${formatQty(totals.value.defect)}${stageOption.value?.unit ?? ''}`,
    );
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
    :width="820"
    ok-text="登记"
    :title="`附加工序 · ${stageOption?.label ?? ''}`"
    @ok="submit"
  >
    <div class="flex flex-col gap-3 text-sm">
      <p class="m-0 text-xs text-muted-foreground">
        附加工序不改变规格：填这次加工了多少、其中残次多少。残次从这一行库存扣掉，良品留在{{ stageOption?.label }}库存不动。
      </p>
      <div class="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <label for="extra-process" class="flex flex-col gap-1 text-xs text-muted-foreground">
          工序
          <Select
            id="extra-process"
            v-model:value="process"
            :options="processes.map((p) => ({ label: p.label, value: p.code }))"
            placeholder="选附加工序"
          />
        </label>
        <label for="extra-operator" class="flex flex-col gap-1 text-xs text-muted-foreground">
          操作人
          <Select
            id="extra-operator"
            v-model:value="operatorUserId"
            :options="operators.map((o) => ({ label: [o.nickname, o.team].filter(Boolean).join(' · '), value: o.userId }))"
            allow-clear
            option-filter-prop="label"
            placeholder="不选就是我自己"
            show-search
          />
        </label>
        <label for="extra-wage" class="flex flex-col gap-1 text-xs text-muted-foreground">
          计件（选填，按良品数）
          <Select
            id="extra-wage"
            v-model:value="wageItemId"
            :options="wageItems.map((w) => ({ label: `${w.name}${w.price ? ` · ${w.price}/${w.unit}` : ''}`, value: w.itemId }))"
            allow-clear
            :placeholder="wageItems.length > 0 ? '选计价项目' : '这道工序还没有计价项目'"
          />
        </label>
      </div>
      <label
        v-if="itemOptions.length > 0"
        for="extra-production-item"
        class="flex flex-col gap-1 text-xs text-muted-foreground"
      >
        关联工厂订单（选填，只列工艺里有这道工序的单）
        <Select
          id="extra-production-item"
          v-model:value="productionItemId"
          :options="itemOptions"
          allow-clear
          option-filter-prop="label"
          placeholder="选内部部门下给本厂的生产订单"
          show-search
        />
      </label>

      <div class="flex items-center justify-between gap-2">
        <span class="text-xs text-muted-foreground">在要加工的库存行上填数量</span>
        <Input id="extra-keyword" v-model:value="keyword" allow-clear class="max-w-60" placeholder="搜编码或批次" size="small" />
      </div>
      <Spin :spinning="loading">
        <Empty v-if="rows.length === 0 && !loading" :description="`${stageOption?.label ?? ''}没有库存`" />
        <ul v-else class="m-0 flex max-h-72 list-none flex-col overflow-auto rounded-md border border-border p-0">
          <li
            v-for="r in rows"
            :key="r.stock.id"
            class="grid grid-cols-1 items-center gap-2 border-b border-border px-3 py-2 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_auto_auto]"
            :class="(r.quantity ?? 0) > 0 ? 'bg-primary/5' : ''"
          >
            <span class="flex min-w-0 flex-col">
              <span class="truncate font-mono text-xs">{{ r.stock.itemCode }}</span>
              <span class="truncate text-xs text-muted-foreground">
                批次 {{ r.stock.batchNo }} · {{ r.stock.location }} · 库存 {{ formatQty(r.stock.quantity) }}{{ stageOption?.unit }}
                <template v-if="attrSummary(stage, r.stock.item, labels)"> · {{ attrSummary(stage, r.stock.item, labels) }}</template>
              </span>
            </span>
            <label :for="`extra-qty-${r.stock.id}`" class="flex items-center gap-1 text-xs text-muted-foreground">
              加工
              <InputNumber
                :id="`extra-qty-${r.stock.id}`"
                :max="Number(r.stock.quantity)"
                :min="0"
                :value="r.quantity ?? undefined"
                :style="{ width: '6.5rem' }"
                size="small"
                @change="(v) => (r.quantity = (v as null | number | undefined) ?? null)"
              />
            </label>
            <label :for="`extra-defect-${r.stock.id}`" class="flex items-center gap-1 text-xs text-muted-foreground">
              残次
              <InputNumber
                :id="`extra-defect-${r.stock.id}`"
                :min="0"
                :value="r.defect ?? undefined"
                :style="{ width: '5.5rem' }"
                size="small"
                @change="(v) => (r.defect = (v as null | number | undefined) ?? null)"
              />
            </label>
          </li>
        </ul>
      </Spin>

      <label for="extra-remark" class="flex flex-col gap-1 text-xs text-muted-foreground">
        备注
        <Input id="extra-remark" v-model:value="remark" :maxlength="255" placeholder="选填" />
      </label>
      <p class="m-0 text-sm">
        合计加工 <b class="tabular-nums">{{ formatQty(totals.quantity) }}</b>，残次
        <b class="tabular-nums text-destructive">{{ formatQty(totals.defect) }}</b>，良品
        <b class="tabular-nums text-success">{{ formatQty(totals.good) }}</b> {{ stageOption?.unit }}
      </p>
      <p v-if="error" class="m-0 text-sm text-destructive">{{ error }}</p>
    </div>
  </Modal>
</template>
