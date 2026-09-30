<script setup lang="ts">
import type { Component } from 'vue';

import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { TabPane, Tabs } from 'ant-design-vue';

import { referenceId } from '../documents/navigation';

export interface MergedView {
  key: string;
  title: string;
  component: Component;
  props?: Record<string, unknown>;
}

const props = defineProps<{ views: MergedView[] }>();
const route = useRoute();
const router = useRouter();
const current = computed(
  () =>
    props.views.find((view) => view.key === route.query.view) ??
    props.views[0]!,
);
/** A tab switch keeps only the contract filter; record, filter and sub-tab queries belong to the previous page. */
function select(key: unknown) {
  if (typeof key !== 'string' || key === current.value.key) return;
  const contractId = referenceId(route.query.contractId);
  void router.push({
    query: { view: key, ...(contractId ? { contractId } : {}) },
  });
}
</script>
<template>
  <div class="merged-workspace">
    <Tabs
      :active-key="current.key"
      class="merged-workspace-tabs"
      @change="select"
    >
      <TabPane v-for="view in views" :key="view.key" :tab="view.title" />
    </Tabs>
    <component
      :is="current.component"
      :key="current.key"
      v-bind="current.props ?? {}"
    />
  </div>
</template>
<style scoped>
.merged-workspace-tabs {
  padding: 4px 16px 0;
  background: hsl(var(--background));
}

.merged-workspace-tabs :deep(.ant-tabs-nav) {
  margin-bottom: 0;
}
</style>
