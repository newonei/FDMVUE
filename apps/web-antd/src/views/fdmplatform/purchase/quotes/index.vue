<script setup lang="ts">
import MergedWorkspace from '../../components/MergedWorkspace.vue';
import DocumentWorkspace from '../../documents/DocumentWorkspace.vue';
import QuoteWorkspace from './QuoteWorkspace.vue';

defineOptions({ name: 'FdmPlatformPurchaseQuotes' });
/** Menu consolidation: former standalone menus redirect here with `?view=`. */
const views = [
  { key: 'quotes', title: '供应商报价', component: QuoteWorkspace },
  {
    key: 'plans',
    title: '采购方案',
    component: DocumentWorkspace,
    props: { kind: 'plans' },
  },
];
</script>
<template><MergedWorkspace :views="views" /></template>
