<script setup lang="ts">
import ReimbursementWorkspace from '../../finance/procurement/reimbursements/ReimbursementWorkspace.vue';

/** 外贸部门「费用报销」：与财务的费用报销同一个列表，付款由财务办理。 */
defineOptions({ name: 'FdmPlatformTradeReimbursements' });
</script>
<template>
  <ReimbursementWorkspace department="外贸部门" :payable="false" />
</template>
