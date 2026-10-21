<script setup lang="ts">
import type { BatchOrder } from '../batch-model';

import { computed } from 'vue';

import { Alert, Modal } from 'ant-design-vue';
import BigNumber from 'bignumber.js';

import InvoiceUpload from '../../../finance/procurement/components/InvoiceUpload.vue';
import { batchInvoiceLines, batchPrepaidCodes } from '../batch-model';

/**
 * 集中收票（月结）：同一供应商的多张采购单，供应商合开一张发票，登记成一张付款发票，
 * 记下每张采购单对应的金额。收票不等于付款，付款从付款发票「增加付款」登记。
 */
const props = defineProps<{ open: boolean; orders: BatchOrder[] }>();
const emit = defineEmits<{ close: []; done: [] }>();

const lines = computed(() => batchInvoiceLines(props.orders));
const first = computed(() => props.orders.find((order) => !order.ended));
/** 已经付过款的单：从发票增加付款时按关联金额折算进这些单，超过它们没付的部分会被拦下 */
const prepaid = computed(() => batchPrepaidCodes(props.orders));
/** 默认发票金额：各单未开票合计（读不到未开票的单不计） */
const remaining = computed(() => {
  let sum = new BigNumber(0);
  for (const line of lines.value) {
    const value = new BigNumber(line.remaining ?? '');
    if (value.isFinite()) sum = sum.plus(value);
  }
  return sum.gt(0) ? sum.toFixed(2) : undefined;
});
</script>

<template>
  <Modal
    :open="open"
    :title="`集中收票 · ${first?.supplierName ?? ''}`"
    width="880px"
    :footer="null"
    :mask-closable="false"
    destroy-on-close
    @cancel="emit('close')"
  >
    <div class="batch">
      <Alert
        type="info"
        show-icon
        :message="`${lines.length} 张采购单合开一张发票，逐单填本发票对应金额（可只开一部分）。收票不等于付款，付款请在付款发票里「增加付款」。`"
      />
      <Alert
        v-if="prepaid.length > 0"
        type="warning"
        show-icon
        :message="`${prepaid.join('、')} 已经付过款。之后从这张发票增加付款时，付款按关联金额折算计入这些采购单，超过它们还没付的部分会被拦下，避免重复付款。`"
      />
      <InvoiceUpload
        v-if="open && first"
        :contract-id="first.contractId"
        :order-id="first.orderId"
        :currency="first.currency"
        :orders="lines"
        :default-amount="remaining"
        @saved="emit('done')"
      />
    </div>
  </Modal>
</template>

<style scoped>
.batch {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
</style>
