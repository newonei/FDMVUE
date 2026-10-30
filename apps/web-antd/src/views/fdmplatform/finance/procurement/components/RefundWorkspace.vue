<script setup lang="ts">
import { ref } from 'vue';

import FinanceDocument from './FinanceDocument.vue';
import RefundTable from './RefundTable.vue';

defineOptions({ name: 'FdmPlatformProcurementRefundWorkspace' });

/** 采购退款记录总列表；点付款单号打开原付款单，在那里继续登记或查看退款。 */
const table = ref<InstanceType<typeof RefundTable>>();
const paymentId = ref<string>();
</script>

<template>
  <RefundTable ref="table" @open-payment="(id) => (paymentId = id)" />
  <FinanceDocument
    :open="Boolean(paymentId)"
    type="PAYMENT"
    :record-id="paymentId"
    :context="{}"
    @close="paymentId = undefined"
    @updated="table?.load()"
  />
</template>
