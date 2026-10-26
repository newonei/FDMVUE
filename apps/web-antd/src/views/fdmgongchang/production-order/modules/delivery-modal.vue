<script setup lang="ts">
import type { Dayjs } from 'dayjs';

import type { FdmgongchangProductionOrderApi as Api } from '#/api/fdmgongchang/production-order';
import type { FdmgongchangStageStockApi as StockApi } from '#/api/fdmgongchang/stage-stock';

import { computed, onBeforeUnmount, ref, watch } from 'vue';

import { DatePicker, Empty, Input, InputNumber, Modal, Select, Spin } from 'ant-design-vue';
import dayjs from 'dayjs';

import { createDelivery, getDeliveryWarehouses } from '#/api/fdmgongchang/production-order';
import { getStockPage } from '#/api/fdmgongchang/stage-stock';

import { num } from '../shared';

/**
 * 交货：把这个产品做好的货交到采购部门仓库。
 * 从订单工艺最后一道的库存阶段选库存行扣减，采购仓库同一步登记生产入库；订单完成数量随之累加。
 * 订单按产品单位，库存按工序产出单位，交货按 1:1 计。
 * 采购单生成的单（finish）是完工登记：货留在工厂，转到订单号批次，采购单到货随之更新，不选仓库。
 */
const props = defineProps<{ finish?: boolean; item?: Api.Item; orderNo?: string }>();
const emit = defineEmits<{ saved: [text: string] }>();
const open = defineModel<boolean>('open', { required: true });

interface Row {
  quantity: null | number;
  stock: StockApi.Stock;
}

const warehouses = ref<Api.Warehouse[]>([]);
const warehouseId = ref<string>();
const deliveredDate = ref<Dayjs>(dayjs());
const keyword = ref('');
const rows = ref<Row[]>([]);
const loading = ref(false);
const remark = ref('');
const saving = ref(false);
const error = ref('');

const remaining = computed(() =>
  props.item ? Math.max(0, num(props.item.quantity) - num(props.item.completedQuantity)) : 0,
);
const filled = computed(() => rows.value.filter((r) => (r.quantity ?? 0) > 0));
const total = computed(() => filled.value.reduce((t, r) => t + (r.quantity ?? 0), 0));
const unitDiffers = computed(
  () => !!props.item?.deliveryUnit && !!props.item?.unit && props.item.deliveryUnit !== props.item.unit,
);

async function loadStock() {
  if (!props.item?.deliveryStage) return;
  loading.value = true;
  try {
    const page = await getStockPage({
      keyword: keyword.value.trim() || undefined,
      pageNo: 1,
      pageSize: 50,
      showZero: false,
      stage: props.item.deliveryStage,
    });
    const kept = filled.value;
    rows.value = [
      ...kept,
      ...page.list
        // 已经完工登记过的货（订单号批次）不再列出
        .filter((s) => !kept.some((k) => k.stock.id === s.id) && !(props.finish && s.batchNo === props.orderNo))
        .map((stock) => ({ quantity: null, stock })),
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
  keyword.value = '';
  rows.value = [];
  remark.value = '';
  error.value = '';
  deliveredDate.value = dayjs();
  await Promise.all([
    loadStock(),
    props.finish
      ? undefined
      : getDeliveryWarehouses()
      .then((list) => {
        warehouses.value = list;
        warehouseId.value = list.find((w) => w.isDefault)?.id ?? list[0]?.id;
      })
      .catch(() => (warehouses.value = [])),
  ]);
});

async function submit() {
  error.value = '';
  if (!props.item) return;
  if (!props.finish && !warehouseId.value) {
    error.value = '请选择交到哪个仓库';
    return;
  }
  if (filled.value.length === 0) {
    error.value = '请至少在一行库存上填交货数量';
    return;
  }
  const over = filled.value.find((r) => (r.quantity ?? 0) > Number(r.stock.quantity));
  if (over) {
    error.value = `${over.stock.batchNo} 只有 ${num(over.stock.quantity)}，不能交更多`;
    return;
  }
  if (total.value > remaining.value) {
    error.value = `这个产品还差 ${remaining.value}${props.item.unit ?? ''}，这次最多交这么多`;
    return;
  }
  saving.value = true;
  try {
    await createDelivery({
      deliveredDate: deliveredDate.value?.format('YYYY-MM-DD'),
      lines: filled.value.map((r) => ({ quantity: r.quantity as number, stockId: r.stock.id })),
      productionOrderItemId: props.item.id,
      remark: remark.value.trim() || undefined,
      warehouseId: props.finish ? undefined : warehouseId.value,
    });
    open.value = false;
    if (props.finish) {
      emit('saved', `已登记完工 ${total.value}${props.item.unit ?? ''}，货在工厂，采购单到货已更新`);
      return;
    }
    const warehouse = warehouses.value.find((w) => w.id === warehouseId.value)?.name ?? '';
    emit('saved', `已交货 ${total.value}${props.item.unit ?? ''}，入${warehouse}`);
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
    :width="780"
    :ok-text="finish ? '确认完工' : '确认交货'"
    :title="`${finish ? '完工登记' : '交货'} · ${item?.productName ?? ''}`"
    @ok="submit"
  >
    <div v-if="item" class="flex flex-col gap-3 text-sm">
      <p v-if="finish" class="m-0 text-xs text-muted-foreground">
        选「{{ item.deliveryStageLabel }}」库存登记完工：货留在工厂，转到批次 {{ orderNo }}（留给这张单出货），采购单到货同一步更新。
        这个产品还差 <b class="text-foreground">{{ remaining }}</b> {{ item.unit }}。
      </p>
      <p v-else class="m-0 text-xs text-muted-foreground">
        从「{{ item.deliveryStageLabel }}」库存交到采购部门仓库，仓库同一步登记生产入库，订单完成数量随之累加。
        这个产品还差 <b class="text-foreground">{{ remaining }}</b> {{ item.unit }}。
      </p>
      <p v-if="unitDiffers" class="m-0 rounded bg-warning/10 px-2 py-1 text-xs text-warning">
        库存单位是「{{ item.deliveryUnit }}」，订单单位是「{{ item.unit }}」，交货按 1 {{ item.deliveryUnit }} = 1 {{ item.unit }} 计。
      </p>
      <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label v-if="!finish" for="delivery-warehouse" class="flex flex-col gap-1 text-xs text-muted-foreground">
          交到哪个仓库
          <Select
            id="delivery-warehouse"
            v-model:value="warehouseId"
            :options="warehouses.map((w) => ({ label: w.isDefault ? `${w.name}（默认）` : w.name, value: w.id }))"
            :placeholder="warehouses.length > 0 ? '选仓库' : '采购部门还没有启用的仓库'"
          />
        </label>
        <label for="delivery-date" class="flex flex-col gap-1 text-xs text-muted-foreground">
          {{ finish ? '完工日期' : '交货日期' }}
          <DatePicker id="delivery-date" v-model:value="deliveredDate" :allow-clear="false" class="w-full" />
        </label>
      </div>
      <div class="flex items-center justify-between gap-2">
        <span class="text-xs text-muted-foreground">在要交的库存行上填数量</span>
        <Input id="delivery-keyword" v-model:value="keyword" allow-clear class="max-w-60" placeholder="搜编码或批次" size="small" />
      </div>
      <Spin :spinning="loading">
        <Empty v-if="rows.length === 0 && !loading" :description="`${item.deliveryStageLabel ?? ''}没有库存`" />
        <ul v-else class="m-0 flex max-h-72 list-none flex-col overflow-auto rounded-md border border-border p-0">
          <li
            v-for="r in rows"
            :key="r.stock.id"
            class="grid grid-cols-1 items-center gap-2 border-b border-border px-3 py-2 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_auto]"
            :class="(r.quantity ?? 0) > 0 ? 'bg-primary/5' : ''"
          >
            <span class="flex min-w-0 flex-col">
              <span class="truncate font-mono text-xs">{{ r.stock.itemCode }}</span>
              <span class="truncate text-xs text-muted-foreground">
                批次 {{ r.stock.batchNo }} · {{ r.stock.location }} · 库存 {{ num(r.stock.quantity) }}{{ item.deliveryUnit }}
              </span>
            </span>
            <label :for="`delivery-qty-${r.stock.id}`" class="flex items-center gap-1 text-xs text-muted-foreground">
              交
              <InputNumber
                :id="`delivery-qty-${r.stock.id}`"
                :max="Number(r.stock.quantity)"
                :min="0"
                :value="r.quantity ?? undefined"
                :style="{ width: '7rem' }"
                size="small"
                @change="(v) => (r.quantity = (v as null | number | undefined) ?? null)"
              />
            </label>
          </li>
        </ul>
      </Spin>
      <label for="delivery-remark" class="flex flex-col gap-1 text-xs text-muted-foreground">
        备注
        <Input id="delivery-remark" v-model:value="remark" :maxlength="255" placeholder="选填，例如 送货车牌、签收人" />
      </label>
      <p class="m-0 text-sm">本次{{ finish ? '完工' : '交货' }} <b class="tabular-nums">{{ total }}</b> {{ item.unit }}</p>
      <p v-if="error" class="m-0 text-sm text-destructive">{{ error }}</p>
    </div>
  </Modal>
</template>
