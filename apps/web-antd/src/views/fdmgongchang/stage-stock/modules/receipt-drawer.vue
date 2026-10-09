<script setup lang="ts">
import type { FdmgongchangStageStockApi as Api } from '#/api/fdmgongchang/stage-stock';

import { computed, ref, watch } from 'vue';

import { Alert, Button, Drawer, Input, InputNumber } from 'ant-design-vue';
import dayjs from 'dayjs';

import {
  receiveRawPurchase,
  receiveTradePurchase,
} from '#/api/fdmgongchang/stage-stock';

import {
  contractProductText,
  formatDate,
  formatQty,
  guessPackedAttrs,
  normalizeForStage,
  RAW_CATEGORY_LABELS,
  stageFields,
  toNumber,
  validateTradeReceipt,
} from '../model';
import AttrFields from './attr-fields.vue';

/**
 * 到货入库：原材料采购到货进「原材料」；外贸合同的外采到货进「已包装成品」，
 * 同时登记为合同的到货记录（实收、可入库、异常原因沿用采购部门原来的到货规则）。
 */
const props = defineProps<{
  options: Api.Options;
  rawLine?: Api.RawOpenLine;
  tradeLine?: Api.TradePurchaseLine;
}>();
const emit = defineEmits<{ saved: [message: string, stage: string] }>();
const open = defineModel<boolean>('open', { required: true });

const quantity = ref<number>();
const accepted = ref<number>();
const acceptedTouched = ref(false);
const reason = ref('');
const attrs = ref<Api.ItemAttrs>({});
const batchNo = ref('');
const location = ref('');
const remark = ref('');
const errors = ref<string[]>([]);
const saving = ref(false);

const isTrade = computed(() => !!props.tradeLine);
const stage = computed(() => (isTrade.value ? 'PACKED' : 'RAW'));
const stageOption = computed(() =>
  props.options.stages.find((s) => s.code === stage.value),
);
const remaining = computed(() =>
  toNumber(
    props.tradeLine?.remainingQuantity ?? props.rawLine?.remainingQuantity,
  ) ?? 0,
);
const unit = computed(() =>
  isTrade.value ? (props.tradeLine?.unit ?? '') : 'kg',
);

watch(open, (value) => {
  if (!value) return;
  quantity.value = remaining.value || undefined;
  accepted.value = quantity.value;
  acceptedTouched.value = false;
  reason.value = '';
  attrs.value = props.tradeLine
    ? guessPackedAttrs(props.tradeLine, props.options)
    : {};
  batchNo.value = `${isTrade.value ? 'WC' : 'RM'}${dayjs().format('MMDD')}`;
  location.value = '';
  remark.value = '';
  errors.value = [];
});

/** 可入库默认跟着实收走，手动改过之后不再跟随。 */
watch(quantity, (value) => {
  if (!acceptedTouched.value) accepted.value = value;
});

function onAccepted(value: null | number | string | undefined) {
  acceptedTouched.value = true;
  accepted.value = value === null || value === undefined ? undefined : Number(value);
}

const shortfall = computed(
  () => isTrade.value && (accepted.value ?? 0) < (quantity.value ?? 0),
);

async function submit() {
  const problems: string[] = [];
  if (!batchNo.value.trim()) problems.push('请填写批次。');
  if (props.tradeLine) {
    problems.push(
      ...validateTradeReceipt({
        accepted: accepted.value,
        quantity: quantity.value,
        reason: reason.value,
        remaining: props.tradeLine.remainingQuantity,
      }),
    );
  } else if (!quantity.value || quantity.value <= 0) {
    problems.push('请填写大于 0 的到货数量。');
  } else if (quantity.value > remaining.value) {
    problems.push(`到货数量超过这行采购待到货的 ${formatQty(remaining.value)} kg。`);
  }
  errors.value = problems;
  if (problems.length > 0) return;
  saving.value = true;
  try {
    const common = {
      batchNo: batchNo.value.trim(),
      location: location.value.trim() || undefined,
      remark: remark.value.trim() || undefined,
    };
    if (props.tradeLine) {
      await receiveTradePurchase({
        ...common,
        acceptedQuantity: accepted.value ?? 0,
        attrs: normalizeForStage('PACKED', attrs.value),
        contractId: props.tradeLine.contractId,
        exceptionReason: shortfall.value ? reason.value.trim() : undefined,
        orderId: props.tradeLine.orderId,
        orderLineId: props.tradeLine.orderLineId,
        quantity: quantity.value!,
      });
      emit(
        'saved',
        `已收货 ${formatQty(quantity.value)} ${unit.value}，${formatQty(accepted.value)} 进已包装成品，并登记到合同 ${props.tradeLine.contractCode}`,
        'PACKED',
      );
    } else if (props.rawLine) {
      await receiveRawPurchase({
        ...common,
        purchaseLineId: props.rawLine.lineId,
        quantity: quantity.value!,
      });
      emit(
        'saved',
        `${props.rawLine.rawMaterialName} 已到货入库 ${formatQty(quantity.value)} kg`,
        'RAW',
      );
    }
    open.value = false;
  } catch {
    // 后端错误已由全局提示展示，保留内容方便修改
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <Drawer
    v-model:open="open"
    :title="isTrade ? '外采成品到货入库' : '原材料到货入库'"
    :width="640"
    class="max-w-full"
    destroy-on-close
  >
    <div class="flex flex-col gap-5">
      <section
        v-if="rawLine"
        class="grid grid-cols-2 gap-3 rounded-md border border-border bg-muted/30 p-3 text-xs sm:grid-cols-4"
      >
        <div class="col-span-2 flex flex-col">
          <span class="text-muted-foreground">原材料</span>
          <span class="text-sm">{{ rawLine.rawMaterialName }}</span>
          <span class="text-muted-foreground">
            {{ rawLine.rawMaterialCode }}
            <template v-if="rawLine.rawCategory"> · {{ RAW_CATEGORY_LABELS[rawLine.rawCategory] ?? rawLine.rawCategory }}</template>
          </span>
        </div>
        <div class="flex flex-col">
          <span class="text-muted-foreground">采购单 / 供应商</span>
          <span class="font-mono">{{ rawLine.purchaseNo }}</span>
          <span>{{ rawLine.supplierName || '—' }}</span>
        </div>
        <div class="flex flex-col">
          <span class="text-muted-foreground">采购 / 已到 / 待到</span>
          <span class="tabular-nums">
            {{ formatQty(rawLine.quantity) }} / {{ formatQty(rawLine.receivedQuantity) }} /
            <b>{{ formatQty(rawLine.remainingQuantity) }}</b> kg
          </span>
          <span v-if="rawLine.expectedDate" class="text-muted-foreground">预计 {{ formatDate(rawLine.expectedDate) }}</span>
        </div>
      </section>

      <section
        v-if="tradeLine"
        class="grid grid-cols-2 gap-3 rounded-md border border-border bg-muted/30 p-3 text-xs sm:grid-cols-4"
      >
        <div class="col-span-2 flex flex-col">
          <span class="text-muted-foreground">合同产品</span>
          <span class="text-sm">{{ contractProductText(tradeLine) }}</span>
          <span class="text-muted-foreground">{{ tradeLine.contractCode }} · {{ tradeLine.customerName || '—' }}</span>
        </div>
        <div class="flex flex-col">
          <span class="text-muted-foreground">采购单 / 供应商</span>
          <span class="font-mono">{{ tradeLine.orderCode || '—' }}</span>
          <span>{{ tradeLine.supplierName || '—' }}</span>
        </div>
        <div class="flex flex-col">
          <span class="text-muted-foreground">采购 / 已到 / 待到</span>
          <span class="tabular-nums">
            {{ formatQty(tradeLine.quantity) }} / {{ formatQty(tradeLine.arrivedQuantity) }} /
            <b>{{ formatQty(tradeLine.remainingQuantity) }}</b> {{ tradeLine.unit }}
          </span>
        </div>
      </section>

      <section class="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label for="receipt-qty" class="flex flex-col gap-1 text-xs text-muted-foreground">
          {{ isTrade ? '实收数量' : '到货数量' }}（{{ unit }}）
          <InputNumber id="receipt-qty" v-model:value="quantity" :min="0" :precision="3" class="w-full" />
        </label>
        <label v-if="isTrade" for="receipt-accepted" class="flex flex-col gap-1 text-xs text-muted-foreground">
          可入库数量（良品，{{ stageOption?.unit }}）
          <InputNumber
            id="receipt-accepted"
            :value="accepted"
            :min="0"
            :precision="3"
            class="w-full"
            @change="onAccepted"
          />
        </label>
        <label v-if="shortfall" for="receipt-reason" class="flex flex-col gap-1 text-xs text-muted-foreground sm:col-span-2">
          异常原因
          <Input id="receipt-reason" v-model:value="reason" :maxlength="500" placeholder="例如 5 张破损、颜色不符" />
        </label>
      </section>

      <section v-if="isTrade" class="flex flex-col gap-2">
        <h3 class="m-0 text-sm font-semibold">
          成品规格
          <span class="ml-1 text-xs font-normal text-muted-foreground">按合同产品预填，请核对实物后修改</span>
        </h3>
        <AttrFields v-model="attrs" :fields="stageFields('PACKED')" :options="options" id-prefix="receipt" />
      </section>

      <section class="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <label for="receipt-batch" class="flex flex-col gap-1 text-xs text-muted-foreground">
          批次
          <Input id="receipt-batch" v-model:value="batchNo" :maxlength="128" />
        </label>
        <label for="receipt-location" class="flex flex-col gap-1 text-xs text-muted-foreground">
          库位
          <Input
            id="receipt-location"
            v-model:value="location"
            :maxlength="64"
            :placeholder="`默认 ${stageOption?.defaultLocation ?? ''}`"
          />
        </label>
        <label for="receipt-remark" class="flex flex-col gap-1 text-xs text-muted-foreground">
          备注
          <Input id="receipt-remark" v-model:value="remark" :maxlength="500" placeholder="例如 送货单号" />
        </label>
      </section>
    </div>
    <template #footer>
      <div class="flex flex-col gap-2">
        <Alert v-if="errors.length > 0" type="error" show-icon>
          <template #message>
            <ul class="m-0 list-disc pl-4">
              <li v-for="e in errors" :key="e">{{ e }}</li>
            </ul>
          </template>
        </Alert>
        <div class="flex flex-wrap items-center justify-between gap-3">
          <span class="text-sm text-muted-foreground">
            入库到「{{ stageOption?.label }}」
          </span>
          <div class="flex gap-2">
            <Button @click="open = false">取消</Button>
            <Button :loading="saving" type="primary" @click="submit">确认收货</Button>
          </div>
        </div>
      </div>
    </template>
  </Drawer>
</template>
