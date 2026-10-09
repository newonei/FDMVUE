<script setup lang="ts">
import MergedWorkspace from '../../../components/MergedWorkspace.vue';
import Workspace from '../../../index.vue';
import TemplateWorkspace from './TemplateWorkspace.vue';

defineOptions({ name: 'FdmPlatformPurchaseTemplates' });
/** Menu consolidation: former standalone menus redirect here with `?view=`. */
const views = [
  {
    key: 'templates',
    title: '签约主体与合同模板',
    component: TemplateWorkspace,
  },
  {
    key: 'routing',
    title: '自动分派规则',
    component: Workspace,
    props: { workspace: 'purchase-routing' },
  },
];
</script>
<template><MergedWorkspace :views="views" /></template>
