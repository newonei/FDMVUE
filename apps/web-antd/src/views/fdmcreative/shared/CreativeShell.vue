<script lang="ts" setup>
import { Page } from '@vben/common-ui';

defineProps<{ description?: string; title: string }>();
</script>

<template>
  <Page auto-content-height>
    <div class="creative-shell">
      <header class="creative-shell__header">
        <div>
          <h1>{{ title }}</h1>
          <p v-if="description">{{ description }}</p>
        </div>
        <div><slot name="actions" /></div>
      </header>
      <main><slot /></main>
    </div>
  </Page>
</template>

<style scoped>
.creative-shell {
  display: flex;
  flex-direction: column;
  gap: 14px;
  height: 100%;
}

.creative-shell__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 68px;
  padding: 14px 18px;
  background: linear-gradient(135deg, #fff 0%, #f8fbff 100%);
  border: 1px solid #e7edf5;
  border-radius: 12px;
}

h1 {
  margin: 0;
  font-size: 20px;
  font-weight: 650;
  color: #172033;
}

p {
  margin: 4px 0 0;
  font-size: 12px;
  color: #7c899d;
}

main {
  min-height: 0;
}
</style>
