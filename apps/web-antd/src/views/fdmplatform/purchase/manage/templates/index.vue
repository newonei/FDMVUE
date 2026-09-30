<script setup lang="ts">
import MergedWorkspace from '../../../components/MergedWorkspace.vue';
import Workspace from '../../../index.vue';
import TemplateWorkspace from './TemplateWorkspace.vue';

defineOptions({ name: 'FdmPlatformPurchaseTemplates' });
/** Menu consolidation: former standalone menus redirect here with `?view=`. */
const views = [
  { key: 'templates', title: '合同模板与主体', component: TemplateWorkspace },
  {
    key: 'routing',
    title: '采购分派规则',
    component: Workspace,
    props: { workspace: 'purchase-routing' },
  },
];
</script>
<template><MergedWorkspace :views="views" /></template>
