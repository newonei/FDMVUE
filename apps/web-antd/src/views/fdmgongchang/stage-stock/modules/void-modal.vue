<script setup lang="ts">
import type { FdmgongchangStageStockApi as Api } from '#/api/fdmgongchang/stage-stock';

import { ref, watch } from 'vue';

import { Alert, Input, Modal } from 'ant-design-vue';

import { voidOrder } from '#/api/fdmgongchang/stage-stock';

/** 作废工序单：领料退回原库存，产出从库存扣回；产出已被下道领走、出货或已回写合同时不能作废。 */
const props = defineProps<{ order?: Api.Order }>();
const emit = defineEmits<{ saved: [message: string] }>();
const open = defineModel<boolean>('open', { required: true });

const reason = ref('');
const error = ref('');
const submitting = ref(false);

watch(open, (value) => {
  if (value) {
    reason.value = '';
    error.value = '';
  }
});

async function submit() {
  if (!props.order) return;
  if (!reason.value.trim()) {
    error.value = '请填写作废原因。';
    return;
  }
  submitting.value = true;
  try {
    await voidOrder({ id: props.order.id, reason: reason.value.trim() });
    emit('saved', `${props.order.orderNo} 已作废，库存已退回`);
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
    :ok-button-props="{ danger: true }"
    :title="`作废工序单 · ${order?.orderNo ?? ''}`"
    ok-text="确认作废"
    @ok="submit"
  >
    <div class="flex flex-col gap-3 text-sm">
      <p class="m-0">
        作废后，领的料退回原库存，良品从产出库存扣回，单子不能再恢复。
        产出已经被下道工序领走或出货时不能作废，请先作废下道工序单。
      </p>
      <label for="void-reason" class="flex flex-col gap-1 text-xs text-muted-foreground">
        作废原因
        <Input
          id="void-reason"
          v-model:value="reason"
          :maxlength="200"
          placeholder="例如 开错颜色、领错批次"
        />
      </label>
      <Alert v-if="error" :message="error" type="error" show-icon />
    </div>
  </Modal>
</template>
