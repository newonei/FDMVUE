<script setup lang="ts">
import type { FdmgongchangStageStockApi as Api } from '#/api/fdmgongchang/stage-stock';

import { computed, ref, watch } from 'vue';

import { Alert, Input, InputNumber, Modal, Spin } from 'ant-design-vue';

import { getOrder, returnOrderMaterial } from '#/api/fdmgongchang/stage-stock';

import { attrSummary, formatQty, makeLabels, sumQty, toNumber } from '../model';

/** 在制工序单退回余料：退回到原来那一行库存（同批次、同库位）。 */
const props = defineProps<{ options: Api.Options; orderId?: number }>();
const emit = defineEmits<{ saved: [message: string] }>();
const open = defineModel<boolean>('open', { required: true });

const order = ref<Api.Order>();
const loading = ref(false);
const submitting = ref(false);
const quantities = ref<Record<number, null | number>>({});
const remark = ref('');
const errors = ref<string[]>([]);
const labels = computed(() => makeLabels(props.options));
const stageOf = (code?: string) =>
  props.options.stages.find((s) => s.code === code);

const remaining = (line: Api.OrderLine) =>
  (toNumber(line.quantity) ?? 0) - (toNumber(line.returnedQuantity) ?? 0);
const total = computed(() =>
  sumQty(Object.values(quantities.value).map((v) => v ?? 0)),
);

watch(open, async (value) => {
  if (!value || !props.orderId) return;
  quantities.value = {};
  remark.value = '';
  errors.value = [];
  loading.value = true;
  try {
    order.value = await getOrder(props.orderId);
  } finally {
    loading.value = false;
  }
});

async function submit() {
  const lines = (order.value?.inputs ?? [])
    .filter((line) => (quantities.value[line.id] ?? 0) > 0)
    .map((line) => ({ inputId: line.id, quantity: quantities.value[line.id]! }));
  errors.value = [];
  if (lines.length === 0) errors.value.push('请填写要退回的余料数量。');
  for (const line of order.value?.inputs ?? []) {
    if ((quantities.value[line.id] ?? 0) > remaining(line))
      errors.value.push(
        `${line.itemCode}（批次 ${line.batchNo}）最多还能退 ${formatQty(remaining(line))}。`,
      );
  }
  if (errors.value.length > 0 || !order.value) return;
  submitting.value = true;
  try {
    await returnOrderMaterial({
      id: order.value.id,
      lines,
      remark: remark.value.trim() || undefined,
    });
    emit(
      'saved',
      `${order.value.orderNo} 已退回余料 ${formatQty(total.value)} ${stageOf(order.value.sourceStage)?.unit ?? ''}`,
    );
    open.value = false;
  } catch {
    // 后端错误已由全局提示展示
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <Modal
    v-model:open="open"
    :confirm-loading="submitting"
    :title="`退回余料 · ${order?.orderNo ?? ''}`"
    :width="680"
    ok-text="确认退回"
    @ok="submit"
  >
    <Spin :spinning="loading">
      <div class="flex flex-col gap-3">
        <p class="m-0 text-xs text-muted-foreground">
          没用完的料退回原来的库存（同批次、同库位），单子继续在制。
        </p>
        <div
          v-for="line in order?.inputs ?? []"
          :key="line.id"
          class="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border p-2 text-xs"
        >
          <div class="flex min-w-0 flex-col">
            <span class="font-mono">{{ line.itemCode }}</span>
            <span class="text-muted-foreground">{{ attrSummary(line.stage, line.item, labels) }} · 批次
              <span class="font-mono">{{ line.batchNo }}</span></span>
            <span>领 {{ formatQty(line.quantity) }}，已退
              {{ formatQty(line.returnedQuantity ?? 0) }}，最多还能退
              <b class="tabular-nums">{{ formatQty(remaining(line)) }}</b>
              {{ stageOf(line.stage)?.unit }}</span>
          </div>
          <InputNumber
            :id="`return-${line.id}`"
            :value="quantities[line.id] ?? undefined"
            :aria-label="`${line.itemCode} 退回数量`"
            :disabled="remaining(line) <= 0"
            :max="remaining(line)"
            :min="0"
            :precision="3"
            class="w-32"
            size="small"
            @change="
              (v) =>
                (quantities[line.id] = (v as null | number | undefined) ?? null)
            "
          />
        </div>
        <label for="return-remark" class="flex flex-col gap-1 text-xs text-muted-foreground">
          备注
          <Input id="return-remark" v-model:value="remark" :maxlength="200" placeholder="选填，例如 换色剩余" />
        </label>
        <Alert v-if="errors.length > 0" type="error" show-icon>
          <template #message>
            <ul class="m-0 list-disc pl-4">
              <li v-for="e in errors" :key="e">{{ e }}</li>
            </ul>
          </template>
        </Alert>
      </div>
    </Spin>
  </Modal>
</template>
