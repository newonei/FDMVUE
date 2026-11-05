<script setup lang="ts">
import type { FdmgongchangStageStockApi as Api } from '#/api/fdmgongchang/stage-stock';

import { computed, ref, watch } from 'vue';

import { Alert, Input, InputNumber, message, Modal } from 'ant-design-vue';

import { createHold } from '#/api/fdmgongchang/quality';

import { formatQty } from '../model';

/**
 * 质量冻结：这行产出有问题时冻结一部分数量。冻结中的不参与库存匹配（AI 排单、订单库存匹配都看不到），
 * 并在异常台账登记一条高风险异常、钉钉通知本厂接单的人；之后在「质量冻结」里解冻或报废。
 */
const props = defineProps<{
  /** 这行已经冻结中的数量。 */
  held?: number;
  line?: Api.OrderLine;
  orderNo?: string;
  unit?: string;
}>();
const emit = defineEmits<{ saved: [text: string] }>();
const open = defineModel<boolean>('open', { default: false });
const quantity = ref<number>();
const reason = ref('');
const saving = ref(false);

const left = computed(() => Math.max(0, Number(props.line?.goodQuantity ?? 0) - (props.held ?? 0)));

watch(open, (v) => {
  if (v) {
    quantity.value = left.value || undefined;
    reason.value = '';
  }
});

async function submit() {
  if (!props.line) return;
  if (!quantity.value || quantity.value <= 0 || quantity.value > left.value) {
    message.warning(`冻结数量要大于 0，且不超过 ${formatQty(left.value)}`);
    return;
  }
  if (!reason.value.trim()) {
    message.warning('请写明冻结原因');
    return;
  }
  saving.value = true;
  try {
    await createHold({ outputId: props.line.id, quantity: quantity.value, reason: reason.value.trim() });
    open.value = false;
    emit('saved', `已冻结 ${formatQty(quantity.value)} ${props.unit ?? ''}，已登记到异常台账`);
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <Modal v-model:open="open" :confirm-loading="saving" ok-text="冻结" :title="`质量冻结 · ${orderNo ?? ''}`" @ok="submit">
    <div v-if="line" class="flex flex-col gap-3">
      <p class="m-0 text-sm">
        <span class="font-mono">{{ line.itemCode }}</span>
        良品 {{ formatQty(line.goodQuantity) }} {{ unit }}<template v-if="held"> · 已冻结 {{ formatQty(held) }}</template>
      </p>
      <Alert show-icon type="info" message="冻结的数量不会被排单和订单匹配用到；库存不分批次，冻结只记数量，现场请把这批货隔开放。" />
      <label class="flex items-center gap-2 text-sm" for="hold-quantity">
        冻结数量
        <InputNumber id="hold-quantity" v-model:value="quantity" :max="left" :min="0" :precision="3" class="w-40" />
        <span class="text-muted-foreground">最多 {{ formatQty(left) }} {{ unit }}</span>
      </label>
      <Input.TextArea id="hold-reason" v-model:value="reason" :maxlength="400" :rows="3" placeholder="冻结原因，例如：雕刻偏位、颜色不对、尺寸超差" />
    </div>
  </Modal>
</template>
