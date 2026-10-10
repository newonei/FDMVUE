<script setup lang="ts">
import MergedWorkspace from '../../components/MergedWorkspace.vue';
import ProcurementWorkspace from '../manage/index.vue';
import ProcurementHistory from './ProcurementHistory.vue';

defineOptions({ name: 'FdmPlatformPurchaseOrders' });
/** Menu consolidation: former standalone menus redirect here with `?view=`. */
const views = [
  { key: 'orders', title: '采购单', component: ProcurementWorkspace },
  {
    key: 'history',
    title: '历史到货与自产（只读）',
    component: ProcurementHistory,
    // 到货、采购退货、自产进度已改到工序库存，旧链接落到这个只读页签
    aliases: ['arrivals', 'purchaseReturns', 'production'],
  },
];
</script>
<template><MergedWorkspace :views="views" /></template>
