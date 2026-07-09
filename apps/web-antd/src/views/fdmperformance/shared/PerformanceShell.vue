<script lang="ts" setup>
import { Page } from '@vben/common-ui';

defineProps<{
  title: string;
}>();
</script>

<template>
  <Page auto-content-height>
    <div class="performance-shell">
      <div v-if="$slots.actions" class="actions-row">
        <slot name="actions"></slot>
      </div>

      <main class="content">
        <slot></slot>
      </main>
    </div>
  </Page>
</template>

<style scoped>
.performance-shell {
  min-height: calc(100vh - 96px);
}

.actions-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: flex-end;
  padding-bottom: 12px;
}

.content {
  display: grid;
  gap: 12px;
}
</style>
