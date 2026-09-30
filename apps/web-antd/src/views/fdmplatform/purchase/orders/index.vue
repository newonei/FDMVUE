<script setup lang="ts">
import MergedWorkspace from '../../components/MergedWorkspace.vue';
import DocumentWorkspace from '../../documents/DocumentWorkspace.vue';
import ProcurementWorkspace from '../manage/index.vue';

defineOptions({ name: 'FdmPlatformPurchaseOrders' });
/** Menu consolidation: former standalone menus redirect here with `?view=`. */
const views = [
  { key: 'orders', title: '采购单', component: ProcurementWorkspace },
  {
    key: 'arrivals',
    title: '到货单',
    component: DocumentWorkspace,
    props: { kind: 'arrivals' },
  },
  {
    key: 'purchaseReturns',
    title: '采购退货单',
    component: DocumentWorkspace,
    props: { kind: 'purchaseReturns' },
  },
  {
    key: 'production',
    title: '自产进度',
    component: DocumentWorkspace,
    props: { kind: 'production' },
  },
];
</script>
<template><MergedWorkspace :views="views" /></template>
