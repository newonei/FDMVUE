<script setup lang="ts">
import type { DocumentKind } from '../../documents/model';

import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import DocumentWorkspace from '../../documents/DocumentWorkspace.vue';

defineOptions({ name: 'FdmPlatformProcurementHistory' });
const kinds: { key: DocumentKind; title: string }[] = [
  { key: 'arrivals', title: '到货单' },
  { key: 'purchaseReturns', title: '采购退货单' },
  { key: 'production', title: '自产进度单' },
];
const route = useRoute();
const router = useRouter();
const current = computed<DocumentKind>(
  () => kinds.find((kind) => kind.key === route.query.view)?.key ?? 'arrivals',
);
function select(key: DocumentKind) {
  if (key === current.value) return;
  const contractId = route.query.contractId;
  void router.replace({
    query: { view: key, ...(contractId ? { contractId } : {}) },
  });
}
</script>

<template>
  <div class="history">
    <div class="switch" role="tablist" aria-label="历史单据类型">
      <button
        v-for="kind in kinds"
        :key="kind.key"
        type="button"
        role="tab"
        :aria-selected="current === kind.key"
        :class="{ on: current === kind.key }"
        @click="select(kind.key)"
      >
        {{ kind.title }}
      </button>
    </div>
    <DocumentWorkspace :key="current" :kind="current" />
  </div>
</template>

<style scoped>
.switch {
  display: inline-flex;
  margin: 12px 16px 0;
  overflow: hidden;
  background: hsl(var(--card));
  border: 1px solid hsl(var(--border));
  border-radius: 8px;
}

.switch button {
  padding: 4px 14px;
  font: inherit;
  font-size: 13px;
  color: hsl(var(--muted-foreground));
  cursor: pointer;
  background: transparent;
  border: 0;
}

.switch button.on {
  font-weight: 600;
  color: hsl(var(--primary));
  background: hsl(var(--primary) / 10%);
}

.switch button:focus-visible {
  outline: 2px solid hsl(var(--primary));
  outline-offset: -2px;
}
</style>
