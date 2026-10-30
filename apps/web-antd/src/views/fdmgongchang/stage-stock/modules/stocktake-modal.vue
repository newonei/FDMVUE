<script setup lang="ts">
import type { FdmgongchangStageStockApi as Api } from '#/api/fdmgongchang/stage-stock';

import { computed, ref, watch } from 'vue';

import { Input, InputNumber, message, Modal } from 'ant-design-vue';

import { stocktake } from '#/api/fdmgongchang/stage-stock';

import { formatQty, roundQty, toNumber } from '../model';

/** 盘点：填实盘数，账面数被别人改过时后端会拒绝，需要刷新后重盘。 */
const props = defineProps<{ stock?: Api.Stock; unit?: string }>();
const emit = defineEmits<{ saved: [] }>();
const open = defineModel<boolean>('open', { required: true });
const actual = ref<number>();
const remark = ref('');
const saving = ref(false);

watch(open, (value) => {
  if (!value) return;
  actual.value = toNumber(props.stock?.quantity) ?? 0;
  remark.value = '';
});

const delta = computed(() =>
  actual.value === undefined
    ? undefined
    : roundQty(actual.value - (toNumber(props.stock?.quantity) ?? 0)),
);

async function submit() {
  if (
    !props.stock ||
    actual.value === undefined ||
    actual.value === null ||
    actual.value < 0
  ) {
    message.warning('请填写实盘数量');
    return;
  }
  saving.value = true;
  try {
    const changed = await stocktake({
      actualQuantity: actual.value,
      expectedQuantity: props.stock.quantity,
      remark: remark.value.trim() || undefined,
      stockId: props.stock.id,
    });
    message.success(
      changed
        ? `已调整 ${delta.value! > 0 ? '+' : ''}${formatQty(delta.value)} ${props.unit ?? ''}`
        : '数量一致，无需调整',
    );
    open.value = false;
    emit('saved');
  } catch {
    // 全局提示已展示原因
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <Modal
    v-model:open="open"
    title="盘点调整"
    :confirm-loading="saving"
    ok-text="确认调整"
    @ok="submit"
  >
    <div v-if="stock" class="flex flex-col gap-3 py-2">
      <div class="text-sm">
        <span class="font-mono text-xs">{{ stock.itemCode }}</span>
        <span class="mx-2 text-muted-foreground">批次 {{ stock.batchNo }}</span>
        <span class="text-muted-foreground">账面 <b class="text-foreground">{{ formatQty(stock.quantity) }}</b>
          {{ unit }}</span>
      </div>
      <label
        for="stocktake-qty"
        class="flex flex-col gap-1 text-xs text-muted-foreground"
      >
        实盘数量（{{ unit }}）
        <InputNumber
          id="stocktake-qty"
          v-model:value="actual"
          :min="0"
          :precision="3"
          class="w-full"
        />
      </label>
      <div
        v-if="delta"
        class="text-xs"
        :class="delta < 0 ? 'text-destructive' : 'text-success'"
      >
        将{{ delta < 0 ? '减少' : '增加' }} {{ formatQty(Math.abs(delta)) }}
        {{ unit }}，记一笔盘点流水
      </div>
      <label
        for="stocktake-remark"
        class="flex flex-col gap-1 text-xs text-muted-foreground"
      >
        备注
        <Input
          id="stocktake-remark"
          v-model:value="remark"
          :maxlength="500"
          placeholder="例如：月底盘点"
        />
      </label>
    </div>
  </Modal>
</template>
