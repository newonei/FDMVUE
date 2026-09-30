<script setup lang="ts">
import MergedWorkspace from '../../components/MergedWorkspace.vue';
import DocumentWorkspace from '../../documents/DocumentWorkspace.vue';

defineOptions({ name: 'FdmPlatformTradeShipments' });
/** Menu consolidation: former standalone menus redirect here with `?view=`. */
const views = [
  {
    key: 'shipments',
    title: '发货单',
    component: DocumentWorkspace,
    props: { kind: 'shipments' },
  },
  {
    key: 'salesReturns',
    title: '销售退货单',
    component: DocumentWorkspace,
    props: { kind: 'salesReturns' },
  },
];
</script>
<template><MergedWorkspace :views="views" /></template>
