<script setup lang="ts">
import MergedWorkspace from '../../components/MergedWorkspace.vue';
import DocumentWorkspace from '../../documents/DocumentWorkspace.vue';
import FinanceWorkspace from '../procurement/index.vue';

defineOptions({ name: 'FdmPlatformFinanceCosts' });
/** Menu consolidation: former standalone menus redirect here with `?view=`. */
const views = [
  {
    key: 'costs',
    title: '合同成本与贡献',
    component: DocumentWorkspace,
    props: { kind: 'costs' },
  },
  {
    key: 'procurementCosts',
    title: '采购成本归属',
    component: FinanceWorkspace,
    props: { type: 'COST_ALLOCATION' },
  },
];
</script>
<template><MergedWorkspace :views="views" /></template>
