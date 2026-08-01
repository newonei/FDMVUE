<script lang="ts" setup>
import { Page } from '@vben/common-ui';

defineProps<{ description: string; title: string }>();
</script>

<template>
  <Page auto-content-height>
    <div class="ai-center-shell">
      <header>
        <div>
          <span class="eyebrow">FDM AI CONTROL PLANE</span>
          <h1>{{ title }}</h1>
          <p>{{ description }}</p>
        </div>
        <slot name="actions" />
      </header>
      <slot />
    </div>
  </Page>
</template>

<style scoped>
.ai-center-shell {
  display: flex;
  flex-direction: column;
  gap: 14px;
  height: 100%;
}

header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 18px;
  background: linear-gradient(120deg, #0f172a 0%, #172554 100%);
  border-radius: 13px;
  box-shadow: 0 10px 28px rgb(15 23 42 / 12%);
}

.eyebrow {
  font-size: 9px;
  letter-spacing: 0.16em;
  color: #93c5fd;
}

h1 {
  margin: 2px 0 0;
  font-size: 20px;
  color: white;
}

p {
  margin: 4px 0 0;
  font-size: 12px;
  color: #bac7dd;
}
</style>
