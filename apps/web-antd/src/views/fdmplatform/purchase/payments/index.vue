<script setup lang="ts">
import FinanceWorkspace from '../../finance/procurement/index.vue';

/** 采购部门「付款记录」（金智菜单位置）：与财务的采购付款记录同一个列表。 */
defineOptions({ name: 'FdmPlatformPurchasePayments' });
</script>
<template><FinanceWorkspace type="PAYMENT" /></template>
