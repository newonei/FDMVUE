<script lang="ts" setup>
import { ref } from 'vue';

import { useVbenModal } from '@vben/common-ui';

import { Alert, Input, message } from 'ant-design-vue';

import { reverseAllocatedV2Payment } from '#/api/erp/finance/payment';

import { validateAllocatedV2ReverseReason } from '../allocated-v2-policy';

defineOptions({ name: 'ErpFinanceAllocatedV2ReverseModal' });

const emit = defineEmits<{
  success: [];
}>();

interface ReverseModalData {
  expectedVersion: number;
  id: number | string;
  no?: string;
}

const payment = ref<ReverseModalData>();
const reason = ref('');

const [Modal, modalApi] = useVbenModal({
  async onConfirm() {
    if (!payment.value) return;
    const validation = validateAllocatedV2ReverseReason(reason.value);
    if (!validation.valid) {
      message.warning(validation.error);
      return;
    }
    modalApi.lock();
    try {
      await reverseAllocatedV2Payment({
        expectedVersion: payment.value.expectedVersion,
        id: String(payment.value.id),
        reason: validation.reason,
      });
      await modalApi.close();
      emit('success');
      message.success('结算已冲销，供应商义务余额已由后端恢复');
    } finally {
      modalApi.unlock();
    }
  },
  onOpenChange(isOpen) {
    if (!isOpen) {
      payment.value = undefined;
      reason.value = '';
      return;
    }
    payment.value = modalApi.getData<ReverseModalData>();
    reason.value = '';
  },
});
</script>

<template>
  <Modal
    :close-on-click-modal="false"
    confirm-text="确认冲销"
    :description="payment?.no ? `付款单 ${payment.no}` : '已过账的供应商结算'"
    title="冲销供应商结算 V2"
  >
    <div class="allocated-v2-reverse">
      <Alert
        description="冲销会恢复对应供应商义务行的可结算余额，并产生不可变审计事实。该动作不会删除原过账记录。"
        message="请填写可审计的冲销原因"
        show-icon
        type="warning"
      />
      <Input.TextArea
        v-model:value="reason"
        :maxlength="500"
        placeholder="例如：银行退票，需恢复义务余额后重新付款"
        :rows="4"
        show-count
      />
    </div>
  </Modal>
</template>

<style scoped>
.allocated-v2-reverse {
  display: grid;
  gap: 14px;
}
</style>
