<script setup lang="ts">
import ReimbursementWorkspace from '../../finance/procurement/reimbursements/ReimbursementWorkspace.vue';

/** 采购部门「费用报销」：与财务的费用报销同一个列表。 */
defineOptions({ name: 'FdmPlatformPurchaseReimbursements' });
</script>
<template><ReimbursementWorkspace department="采购部门" /></template>
