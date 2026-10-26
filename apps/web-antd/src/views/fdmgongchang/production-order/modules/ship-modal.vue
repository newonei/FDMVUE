<script setup lang="ts">
import type { Dayjs } from 'dayjs';

import type { FdmgongchangProductionOrderApi as Api } from '#/api/fdmgongchang/production-order';
import type { FdmgongchangStageStockApi as StockApi } from '#/api/fdmgongchang/stage-stock';

import { computed, ref, watch } from 'vue';

import { DatePicker, Empty, Input, InputNumber, Modal, Spin } from 'ant-design-vue';
import dayjs from 'dayjs';

import { shipFactoryOrder } from '#/api/fdmgongchang/production-order';
import { getStockPage } from '#/api/fdmgongchang/stage-stock';

import { num } from '../shared';

/**
 * 采购单生成的单从工厂出货：只能出这张单完工登记过的货（订单号批次），累计不超过已完工未出货的数量。
 * 采购单关联了合同的，登记为合同出货；没有合同（例如电商备货）要填出货去向。
 */
const props = defineProps<{ contractCode?: null | string; item?: Api.Item; orderNo?: string }>();
const emit = defineEmits<{ saved: [text: string] }>();
const open = defineModel<boolean>('open', { required: true });

interface Row {
  quantity: null | number;
  stock: StockApi.Stock;
}

const rows = ref<Row[]>([]);
const loading = ref(false);
const saving = ref(false);
const shippedDate = ref<Dayjs>(dayjs());
const destination = ref('');
const remark = ref('');
const error = ref('');

const toContract = computed(() => !!props.contractCode && !!props.item?.sourceContractItemId);
const left = computed(() =>
  props.item ? Math.max(0, num(props.item.completedQuantity) - num(props.item.shippedQuantity)) : 0,
);
const filled = computed(() => rows.value.filter((r) => (r.quantity ?? 0) > 0));
const total = computed(() => filled.value.reduce((t, r) => t + (r.quantity ?? 0), 0));

watch(open, async (value) => {
  if (!value || !props.item?.deliveryStage) return;
  rows.value = [];
  destination.value = '';
  remark.value = '';
  error.value = '';
  shippedDate.value = dayjs();
  loading.value = true;
  try {
    const page = await getStockPage({
      keyword: props.orderNo,
      pageNo: 1,
      pageSize: 50,
      showZero: false,
      stage: props.item.deliveryStage,
    });
    rows.value = page.list.filter((s) => s.batchNo === props.orderNo).map((stock) => ({ quantity: null, stock }));
  } catch {
    rows.value = [];
  } finally {
    loading.value = false;
  }
});

async function submit() {
  error.value = '';
  if (!props.item) return;
  if (!toContract.value && !destination.value.trim()) {
    error.value = '采购单没有关联合同，请填写出货去向，例如 电商仓';
    return;
  }
  if (filled.value.length === 0) {
    error.value = '请填写出货数量';
    return;
  }
  if (total.value > left.value) {
    error.value = `已完工未出货的只有 ${left.value}${props.item.unit ?? ''}`;
    return;
  }
  saving.value = true;
  try {
    await shipFactoryOrder({
      destination: toContract.value ? undefined : destination.value.trim(),
      itemId: props.item.id,
      lines: filled.value.map((r) => ({ quantity: r.quantity as number, stockId: r.stock.id })),
      remark: remark.value.trim() || undefined,
      shippedDate: shippedDate.value?.format('YYYY-MM-DD'),
    });
    open.value = false;
    emit(
      'saved',
      toContract.value
        ? `已出货 ${total.value}${props.item.unit ?? ''}，登记到合同 ${props.contractCode}`
        : `已出货 ${total.value}${props.item.unit ?? ''} 到 ${destination.value.trim()}`,
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
    :width="680"
    ok-text="确认出货"
    :title="`出货 · ${item?.productName ?? ''}`"
    @ok="submit"
  >
    <div v-if="item" class="flex flex-col gap-3 text-sm">
      <p class="m-0 text-xs text-muted-foreground">
        从这张单完工登记的货（批次 {{ orderNo }}）出，已完工未出货
        <b class="text-foreground">{{ left }}</b> {{ item.unit }}。
        <template v-if="toContract">出货登记到合同 {{ contractCode }}。</template>
        <template v-else>采购单没有关联合同，出货记去向。</template>
      </p>
      <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label for="ship-date" class="flex flex-col gap-1 text-xs text-muted-foreground">
          出货日期
          <DatePicker id="ship-date" v-model:value="shippedDate" :allow-clear="false" class="w-full" />
        </label>
        <label v-if="!toContract" for="ship-destination" class="flex flex-col gap-1 text-xs text-muted-foreground">
          出货去向
          <Input id="ship-destination" v-model:value="destination" :maxlength="255" placeholder="例如 电商武汉仓、亚马逊 FBA" />
        </label>
      </div>
      <Spin :spinning="loading">
        <Empty v-if="rows.length === 0 && !loading" description="这张单还没有完工登记的货" />
        <ul v-else class="m-0 flex max-h-60 list-none flex-col overflow-auto rounded-md border border-border p-0">
          <li
            v-for="r in rows"
            :key="r.stock.id"
            class="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2 last:border-b-0"
          >
            <span class="flex min-w-0 flex-col">
              <span class="truncate font-mono text-xs">{{ r.stock.itemCode }}</span>
              <span class="text-xs text-muted-foreground">{{ r.stock.location }} · 库存 {{ num(r.stock.quantity) }}</span>
            </span>
            <label :for="`ship-qty-${r.stock.id}`" class="flex items-center gap-1 text-xs text-muted-foreground">
              出
              <InputNumber
                :id="`ship-qty-${r.stock.id}`"
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
      <label for="ship-remark" class="flex flex-col gap-1 text-xs text-muted-foreground">
        备注
        <Input id="ship-remark" v-model:value="remark" :maxlength="255" placeholder="选填，例如 物流单号" />
      </label>
      <p class="m-0 text-sm">本次出货 <b class="tabular-nums">{{ total }}</b> {{ item.unit }}</p>
      <p v-if="error" class="m-0 text-sm text-destructive">{{ error }}</p>
    </div>
  </Modal>
</template>
