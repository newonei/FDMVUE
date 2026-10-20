<script setup lang="ts">
import MergedWorkspace from '../../components/MergedWorkspace.vue';
import DocumentWorkspace from '../../documents/DocumentWorkspace.vue';

defineOptions({ name: 'FdmPlatformDomesticShipments' });
const views = [
  {
    key: 'shipments',
    title: '发货单',
    component: DocumentWorkspace,
    props: { kind: 'shipments', salesChannel: 'DOMESTIC' },
  },
  {
    key: 'salesReturns',
    title: '销售退货单',
    component: DocumentWorkspace,
    props: { kind: 'salesReturns', salesChannel: 'DOMESTIC' },
  },
];
</script>
<template><MergedWorkspace :views="views" /></template>
