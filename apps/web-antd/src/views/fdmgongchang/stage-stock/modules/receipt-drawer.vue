<script setup lang="ts">
import type { FdmgongchangStageStockApi as Api } from '#/api/fdmgongchang/stage-stock';

import { computed, ref, watch } from 'vue';

import { Alert, Button, Drawer, Input, InputNumber, Select } from 'ant-design-vue';

import { receivePurchase } from '#/api/fdmgongchang/stage-stock';

import {
  formatDate,
  formatQty,
  MATERIAL_KIND_LABELS,
  RAW_CATEGORY_LABELS,
  toNumber,
} from '../model';

/**
 * 采购收货：采购单送到本厂的原料进「原材料」、辅料进「辅料」库存，实收与合格数回写采购单。
 * 原料第一次收时选它对应的原材料（配方、成本按原材料算），以后自动带出；采购单关联合同的辅料记为该合同的定制辅料。
 */
const props = defineProps<{
  line?: Api.PurchaseLine;
  options: Api.Options;
}>();
const emit = defineEmits<{ saved: [message: string, stage: string] }>();
const open = defineModel<boolean>('open', { required: true });

const quantity = ref<number>();
const accepted = ref<number>();
const acceptedTouched = ref(false);
const reason = ref('');
const rawMaterialCode = ref<string>();
const batchNo = ref('');
const location = ref('');
const remark = ref('');
const errors = ref<string[]>([]);
const saving = ref(false);

const isRaw = computed(() => props.line?.kind === 'RAW');
const stage = computed(() => (isRaw.value ? 'RAW' : 'AUX'));
const stageOption = computed(() =>
  props.options.stages.find((s) => s.code === stage.value),
);
const remaining = computed(() => toNumber(props.line?.remainingQuantity) ?? 0);
const unit = computed(() => props.line?.unit ?? '');
const rawOptions = computed(() =>
  props.options.rawMaterials
    .filter((m) => m.enabled || m.code === rawMaterialCode.value)
    .map((m) => ({
      label: `${m.name}（${m.code}）· ${RAW_CATEGORY_LABELS[m.category] ?? m.category}`,
      value: m.code,
    })),
);

watch(open, (value) => {
  if (!value) return;
  quantity.value = remaining.value || undefined;
  accepted.value = quantity.value;
  acceptedTouched.value = false;
  reason.value = '';
  rawMaterialCode.value = props.line?.rawMaterialCode ?? undefined;
  batchNo.value = '';
  location.value = '';
  remark.value = '';
  errors.value = [];
});

/** 合格数默认跟着实收走，手动改过之后不再跟随。 */
watch(quantity, (value) => {
  if (!acceptedTouched.value) accepted.value = value;
});

function onAccepted(value: null | number | string | undefined) {
  acceptedTouched.value = true;
  accepted.value =
    value === null || value === undefined ? undefined : Number(value);
}

const shortfall = computed(() => (accepted.value ?? 0) < (quantity.value ?? 0));

async function submit() {
  const line = props.line;
  if (!line) return;
  const problems: string[] = [];
  if (!quantity.value || quantity.value <= 0) {
    problems.push('请填写大于 0 的实收数量。');
  } else if (quantity.value > remaining.value) {
    problems.push(
      `实收超过这行采购待收的 ${formatQty(remaining.value)} ${unit.value}。`,
    );
  }
  if (accepted.value === undefined || accepted.value < 0) {
    problems.push('请填写合格数量。');
  } else if (accepted.value > (quantity.value ?? 0)) {
    problems.push('合格数量不能超过实收数量。');
  }
  if (shortfall.value && !reason.value.trim())
    problems.push('有不合格时请填写原因。');
  if (isRaw.value && !rawMaterialCode.value)
    problems.push('请选这种原料对应的原材料。');
  errors.value = problems;
  if (problems.length > 0) return;
  saving.value = true;
  try {
    await receivePurchase({
      acceptedQuantity: accepted.value,
      batchNo: batchNo.value.trim() || undefined,
      contractId: line.contractId ?? undefined,
      exceptionReason: shortfall.value ? reason.value.trim() : undefined,
      location: location.value.trim() || undefined,
      orderId: line.orderId,
      orderLineId: line.orderLineId,
      quantity: quantity.value!,
      rawMaterialCode: isRaw.value ? rawMaterialCode.value : undefined,
      remark: remark.value.trim() || undefined,
    });
    emit(
      'saved',
      `${line.productName} 已收货 ${formatQty(quantity.value)} ${unit.value}，${formatQty(accepted.value)} 进${stageOption.value?.label ?? ''}，采购单 ${line.orderCode} 已更新到货`,
      stage.value,
    );
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
    :title="`${line ? MATERIAL_KIND_LABELS[line.kind] : ''}到货入库`"
    :width="640"
    class="max-w-full"
    destroy-on-close
  >
    <div v-if="line" class="flex flex-col gap-5">
      <section
        class="grid grid-cols-2 gap-3 rounded-md border border-border bg-muted/30 p-3 text-xs sm:grid-cols-4"
      >
        <div class="col-span-2 flex flex-col">
          <span class="text-muted-foreground">{{ MATERIAL_KIND_LABELS[line.kind] }}</span>
          <span class="text-sm">{{ line.productName }}</span>
          <span class="text-muted-foreground">
            {{ [line.productCode, line.specification].filter(Boolean).join(' · ') }}
          </span>
          <span v-if="line.contractCode" class="text-muted-foreground">
            合同 {{ line.contractCode }}<template v-if="!isRaw">（定制辅料，只给这个合同的生产领用）</template>
          </span>
        </div>
        <div class="flex flex-col">
          <span class="text-muted-foreground">采购单 / 供应商</span>
          <span class="font-mono">{{ line.orderCode }}</span>
          <span>{{ line.supplierName || '—' }}</span>
          <span v-if="line.orderDate" class="text-muted-foreground">下单 {{ formatDate(line.orderDate) }}</span>
        </div>
        <div class="flex flex-col">
          <span class="text-muted-foreground">采购 / 已收 / 待收</span>
          <span class="tabular-nums">
            {{ formatQty(line.quantity) }} / {{ formatQty(line.receivedQuantity) }} /
            <b>{{ formatQty(line.remainingQuantity) }}</b> {{ unit }}
          </span>
        </div>
      </section>

      <label v-if="isRaw" for="receipt-raw" class="flex flex-col gap-1 text-xs text-muted-foreground">
        对应的原材料（配方、成本按它算）
        <Select
          id="receipt-raw"
          v-model:value="rawMaterialCode"
          :options="rawOptions"
          option-filter-prop="label"
          placeholder="选这种原料对应的原材料，下次自动带出"
          show-search
        />
      </label>

      <section class="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label for="receipt-qty" class="flex flex-col gap-1 text-xs text-muted-foreground">
          实收数量（{{ unit }}）
          <InputNumber id="receipt-qty" v-model:value="quantity" :min="0" :precision="3" class="w-full" />
        </label>
        <label for="receipt-accepted" class="flex flex-col gap-1 text-xs text-muted-foreground">
          合格数量（进库存，{{ unit }}）
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
          不合格原因
          <Input id="receipt-reason" v-model:value="reason" :maxlength="500" placeholder="例如 2 包受潮、印刷错误" />
        </label>
      </section>

      <section class="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <label for="receipt-batch" class="flex flex-col gap-1 text-xs text-muted-foreground">
          批次
          <Input id="receipt-batch" v-model:value="batchNo" :maxlength="128" placeholder="不填用到货单号" />
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
            合格数进「{{ stageOption?.label }}」，实收与合格数回写采购单
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
