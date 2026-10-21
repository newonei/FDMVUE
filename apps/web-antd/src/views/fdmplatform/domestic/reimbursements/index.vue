<script setup lang="ts">
import ReimbursementWorkspace from '../../finance/procurement/reimbursements/ReimbursementWorkspace.vue';

/** 内销部门「费用报销」：与财务的费用报销同一个列表，付款由财务办理。 */
defineOptions({ name: 'FdmPlatformDomesticReimbursements' });
</script>
<template>
  <ReimbursementWorkspace department="内销部门" :payable="false" />
</template>
