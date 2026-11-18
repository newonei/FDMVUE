<script setup lang="ts">
import type { ProductStructure } from '#/api/fdmplatform/products';

import {
  colorModeText,
  constructionText,
  productDimensionsText,
  productNominalLayersText,
  productPatternText,
  productSliceThicknessText,
  productThicknessProcessText,
} from '../manufacturing';
import { structureDetails, structureValue } from '../structure';

withDefaults(defineProps<{ expanded?: boolean; value: ProductStructure }>(), {
  expanded: false,
});
</script>

<template>
  <details class="product-structure" :open="expanded">
    <summary>
      <span>颜色方式：{{ colorModeText(value) }}</span>
      <span v-if="value.colorMode === 'SINGLE'">颜色：{{ structureValue(value, 'colorCode', 'colorCodeLabel') }}</span>
      <template v-else>
        <span>正面颜色：{{
            structureValue(value, 'frontColor', 'frontColorLabel')
          }}</span>
        <span>反面颜色：{{
            structureValue(value, 'backColor', 'backColorLabel')
          }}</span>
      </template>
      <span>制造结构：{{ constructionText(value) }}</span>
      <span v-if="productDimensionsText(value)">成品长宽厚：{{ productDimensionsText(value) }}</span>
      <span>{{ productPatternText(value) }}</span>
      <span class="structure-hint">产品详细资料</span>
    </summary>
    <dl>
      <div
        v-if="
          value.constructionType === 'DOUBLE_LAYER' ||
          value.constructionType === 'SINGLE_LAYER'
        "
      >
        <dt>成品名义层厚：</dt>
        <dd>{{ productNominalLayersText(value) }}</dd>
      </div>
      <div v-if="productSliceThicknessText(value)">
        <dt>开片厚度：</dt>
        <dd>{{ productSliceThicknessText(value) }}</dd>
      </div>
      <div v-if="productThicknessProcessText(value)">
        <dt>缩水工序：</dt>
        <dd>{{ productThicknessProcessText(value) }}</dd>
      </div>
      <div v-for="item in structureDetails(value)" :key="item.label">
        <dt>{{ item.label }}：</dt>
        <dd>{{ item.value }}</dd>
      </div>
    </dl>
  </details>
</template>

<style scoped>
.product-structure {
  font-size: 12px;
  overflow-wrap: anywhere;
  white-space: normal;
}

summary {
  cursor: pointer;
}

summary > span {
  margin-right: 8px;
}

.structure-hint,
dt {
  color: hsl(var(--muted-foreground));
}

dl {
  display: flex;
  flex-wrap: wrap;
  gap: 3px 12px;
  margin: 6px 0 0;
}

dl > div {
  display: flex;
}

dt {
  flex-shrink: 0;
}

dd {
  margin: 0;
  white-space: pre-wrap;
}
</style>
