<script lang="ts" setup>
import PerformanceShell from '../shared/PerformanceShell.vue';
import TemplateManager from './components/TemplateManager.vue';

defineOptions({ name: 'FdmPerformanceTemplates' });
</script>

<template>
  <PerformanceShell title="考评表">
    <TemplateManager />
  </PerformanceShell>
</template>
