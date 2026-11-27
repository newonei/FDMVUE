<script setup lang="ts">
import type { StockProduct } from '#/api/fdmplatform/warehouse';

import { computed } from 'vue';

import { stockSpecification } from './model';

const props = defineProps<{ column: string; product: StockProduct }>();
const parsed = computed(() => stockSpecification(props.product.specification));
</script>

<template>
  <span v-if="column === 'product'" class="product-name">
    {{ product.productName || '产品未注明' }}
  </span>
  <span v-else-if="column === 'code'" class="product-value num">
    {{ product.productCode || '—' }}
  </span>
  <span v-else-if="column === 'model'" class="product-value">
    {{ parsed.model || '—' }}
  </span>
  <span v-else-if="column === 'specification'" class="product-value">
    {{ parsed.specification || '—' }}
  </span>
  <div v-else class="cell">
    <span v-if="parsed.model" class="product-value" :title="parsed.model">
      {{ parsed.model }}
    </span>
    <span class="product-value" :class="{ muted: parsed.model }">
      {{ parsed.specification || '—' }}
    </span>
  </div>
</template>

<style scoped>
.product-name {
  font-weight: 500;
  overflow-wrap: anywhere;
}

.product-value {
  overflow-wrap: anywhere;
  white-space: pre-line;
}
</style>
