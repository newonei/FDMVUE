<script setup lang="ts">
import MergedWorkspace from '../../../components/MergedWorkspace.vue';
import TemplateWorkspace from './TemplateWorkspace.vue';

defineOptions({ name: 'FdmPlatformPurchaseTemplates' });
/**
 * Menu consolidation: former standalone menus redirect here with `?view=`.
 * 自动分派规则已隐藏（没有在用的规则，采购员在工作台「我来接单」）；旧链接落到本页。
 */
const views = [
  {
    key: 'templates',
    title: '签约主体与合同模板',
    component: TemplateWorkspace,
    aliases: ['routing'],
  },
];
</script>
<template><MergedWorkspace :views="views" /></template>
