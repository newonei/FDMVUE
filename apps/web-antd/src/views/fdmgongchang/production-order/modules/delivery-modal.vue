<script setup lang="ts">
import type { Dayjs } from 'dayjs';

import type { FdmgongchangProductionOrderApi as Api } from '#/api/fdmgongchang/production-order';
import type { FdmgongchangStageStockApi as StockApi } from '#/api/fdmgongchang/stage-stock';

import { computed, onBeforeUnmount, ref, watch } from 'vue';

import { DatePicker, Empty, Input, InputNumber, Modal, Select, Spin } from 'ant-design-vue';

import { createDelivery, getDeliveryWarehouses } from '#/api/fdmgongchang/production-order';
import { getStockPage } from '#/api/fdmgongchang/stage-stock';

import { factoryToday } from '../../shared/factory-date';
import { num } from '../shared';

/**
 * 交货（生产入库）：把这个产品做好的货交到仓库。
 * 从订单工艺最后一道的库存阶段选库存行扣减，仓库同一步登记生产入库；订单完成数量随之累加。
 * 订单按产品单位，库存按工序产出单位，交货按 1:1 计。
 * 采购单生成的单（purchase）默认入本厂仓库，采购单到货随之更新；之后由仓库销售出库或其它出库。
 */
const props = defineProps<{
  factoryId?: number;
  item?: Api.Item;
  preset?: { quantity: number; stockId: number };
  purchase?: boolean;
}>();
const emit = defineEmits<{ saved: [text: string] }>();
const open = defineModel<boolean>('open', { required: true });

interface Row {
  quantity: null | number;
  stock: StockApi.Stock;
}

const warehouses = ref<Api.Warehouse[]>([]);
const warehouseId = ref<string>();
const deliveredDate = ref<Dayjs>(factoryToday());
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

let loadVersion = 0;
async function loadStock(preset?: typeof props.preset) {
  if (!props.item?.deliveryStage) return;
  const version = ++loadVersion;
  loading.value = true;
  try {
    const page = await getStockPage({
      keyword: keyword.value.trim() || undefined,
      pageNo: 1,
      pageSize: 50,
      showZero: false,
      stage: props.item.deliveryStage,
      stockId: preset?.stockId,
    });
    if (version !== loadVersion || !open.value) return;
    const kept = filled.value;
    if (preset && page.list.length === 0) error.value = '所选库存当前不可用，请核对库存后再办理。';
    rows.value = [
      ...kept,
      ...page.list
        .filter((s) => !kept.some((k) => k.stock.id === s.id))
        .map((stock) => ({
          quantity: stock.id === preset?.stockId ? Math.min(preset.quantity, num(stock.quantity), remaining.value) : null,
          stock,
        })),
    ];
  } catch {
    if (version === loadVersion) rows.value = filled.value;
  } finally {
    if (version === loadVersion) loading.value = false;
  }
}

let timer: ReturnType<typeof setTimeout> | undefined;
watch(keyword, () => {
  clearTimeout(timer);
  if (open.value && !props.preset) timer = setTimeout(() => { void loadStock(); }, 300);
});
onBeforeUnmount(() => clearTimeout(timer));

watch(open, async (value) => {
  ++loadVersion;
  clearTimeout(timer);
  if (!value) return;
  keyword.value = '';
  rows.value = [];
  remark.value = '';
  error.value = '';
  deliveredDate.value = factoryToday();
  await Promise.all([
    loadStock(props.preset),
    getDeliveryWarehouses()
      .then((list) => {
        warehouses.value = list;
        // 本厂仓库优先，其次默认仓
        warehouseId.value = (
          list.find((w) => props.factoryId !== undefined && w.factoryId === props.factoryId) ??
          list.find((w) => w.isDefault) ??
          list[0]
        )?.id;
      })
      .catch(() => (warehouses.value = [])),
  ]);
});

async function submit() {
  error.value = '';
  if (!props.item) return;
  if (!warehouseId.value) {
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
      warehouseId: warehouseId.value,
    });
    open.value = false;
    const warehouse = warehouses.value.find((w) => w.id === warehouseId.value)?.name ?? '';
    emit(
      'saved',
      props.purchase
        ? `已生产入库 ${total.value}${props.item.unit ?? ''}，入${warehouse}，采购单到货已更新`
        : `已交货 ${total.value}${props.item.unit ?? ''}，入${warehouse}`,
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
    :width="780"
    :ok-text="purchase ? '确认入库' : '确认交货'"
    :title="`${purchase ? '生产入库' : '交货'} · ${item?.productName ?? ''}`"
    @ok="submit"
  >
    <div v-if="item" class="flex flex-col gap-3 text-sm">
      <p v-if="purchase" class="m-0 text-xs text-muted-foreground">
        从「{{ item.deliveryStageLabel }}」库存开生产入库单，货进所选仓库（一般是本厂仓库），采购单到货同一步更新；之后由仓库出库。
        这个产品还差 <b class="text-foreground">{{ remaining }}</b> {{ item.unit }}。
      </p>
      <p v-else class="m-0 text-xs text-muted-foreground">
        从「{{ item.deliveryStageLabel }}」库存交到仓库，仓库同一步登记生产入库，订单完成数量随之累加。
        这个产品还差 <b class="text-foreground">{{ remaining }}</b> {{ item.unit }}。
      </p>
      <p v-if="unitDiffers" class="m-0 rounded bg-warning/10 px-2 py-1 text-xs text-warning">
        库存单位是「{{ item.deliveryUnit }}」，订单单位是「{{ item.unit }}」，交货按 1 {{ item.deliveryUnit }} = 1 {{ item.unit }} 计。
      </p>
      <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label for="delivery-warehouse" class="flex flex-col gap-1 text-xs text-muted-foreground">
          {{ purchase ? '入哪个仓库' : '交到哪个仓库' }}
          <Select
            id="delivery-warehouse"
            v-model:value="warehouseId"
            :options="
              warehouses.map((w) => ({
                label: w.factoryId !== undefined && w.factoryId !== null && w.factoryId === factoryId ? `${w.name}（本厂）` : w.isDefault ? `${w.name}（默认）` : w.name,
                value: w.id,
              }))
            "
            :placeholder="warehouses.length > 0 ? '选仓库' : '还没有启用的仓库'"
          />
        </label>
        <label for="delivery-date" class="flex flex-col gap-1 text-xs text-muted-foreground">
          {{ purchase ? '入库日期' : '交货日期' }}
          <DatePicker id="delivery-date" v-model:value="deliveredDate" :allow-clear="false" class="w-full" />
        </label>
      </div>
      <div class="flex items-center justify-between gap-2">
        <span class="text-xs text-muted-foreground">{{ preset ? '核对拆分预览选中的库存和本次办理数量' : '在要交的库存行上填数量' }}</span>
        <Input v-if="!preset" id="delivery-keyword" v-model:value="keyword" allow-clear class="max-w-60" placeholder="搜编码或批次" size="small" />
      </div>
      <Spin :spinning="loading">
        <Empty v-if="rows.length === 0 && !loading" :description="`${item.deliveryStageLabel ?? ''}没有库存`" />
        <div v-else class="max-h-72 overflow-auto rounded-md border border-border" role="region" aria-label="库存批次" tabindex="0">
          <table class="delivery-stock-table w-full min-w-[560px] text-xs" aria-label="本次办理库存明细">
            <thead class="sticky top-0 z-10 bg-muted">
              <tr>
                <th scope="col">物料编码</th>
                <th scope="col">批次</th>
                <th scope="col">库位</th>
                <th scope="col" class="text-right">库存数量</th>
                <th scope="col">{{ purchase ? '入库数量' : '交货数量' }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="r in rows" :key="r.stock.id" :class="{ 'bg-primary/5': (r.quantity ?? 0) > 0 }">
                <td class="font-mono">{{ r.stock.itemCode }}</td>
                <th scope="row">{{ r.stock.batchNo }}</th>
                <td>{{ r.stock.location || '—' }}</td>
                <td class="whitespace-nowrap text-right tabular-nums">{{ num(r.stock.quantity) }} {{ item.deliveryUnit }}</td>
                <td>
                  <InputNumber
                    :id="`delivery-qty-${r.stock.id}`"
                    :aria-label="`${r.stock.batchNo} ${purchase ? '入库数量' : '交货数量'}`"
                    :max="Number(r.stock.quantity)"
                    :min="0"
                    :value="r.quantity ?? undefined"
                    :style="{ width: '7rem' }"
                    size="small"
                    @change="(v) => (r.quantity = (v as null | number | undefined) ?? null)"
                  />
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </Spin>
      <label for="delivery-remark" class="flex flex-col gap-1 text-xs text-muted-foreground">
        备注
        <Input id="delivery-remark" v-model:value="remark" :maxlength="255" placeholder="选填，例如 送货车牌、签收人" />
      </label>
      <p class="m-0 text-sm">本次{{ purchase ? '入库' : '交货' }} <b class="tabular-nums">{{ total }}</b> {{ item.unit }}</p>
      <p v-if="error" class="m-0 text-sm text-destructive">{{ error }}</p>
    </div>
  </Modal>
</template>

<style scoped>
.delivery-stock-table th,
.delivery-stock-table td {
  padding: 6px 10px;
  border: 1px solid hsl(var(--border));
}

.delivery-stock-table th:not(.text-right) {
  text-align: left;
}
</style>
