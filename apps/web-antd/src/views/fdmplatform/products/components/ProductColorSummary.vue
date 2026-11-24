<script setup lang="ts">
import type { ProductAttributes } from '#/api/fdmplatform/products';

import { computed } from 'vue';

import FdmColorPreview from '#/components/fdm-color-preview/fdm-color-preview.vue';

import { productColorPreview } from '../color-preview';
import {
  colorModeText,
  constructionText,
  productSliceThicknessText,
} from '../manufacturing';

const props = defineProps<{
  construction?: boolean;
  showPreviews?: boolean;
  value: ProductAttributes;
}>();

const colors = computed(() => {
  const value = props.value;
  const fields: Array<['backColor' | 'colorCode' | 'frontColor', string]> =
    value.colorMode === 'SINGLE'
      ? [['colorCode', '颜色']]
      : [
          ['frontColor', '正面颜色'],
          ['backColor', '反面颜色'],
        ];
  if (
    value.colorMode !== 'SINGLE' &&
    value.colorMode !== 'DUAL' &&
    (value.colorCodeLabel || value.colorCode)
  ) {
    fields.push(['colorCode', '原单色']);
  }
  return fields.map(([field, title]) => {
    const code = value[field];
    const label = value[`${field}Label`];
    const preview = value[`${field}Preview`];
    return {
      label: label || preview?.code || code || '未维护',
      sample: props.showPreviews
        ? productColorPreview(code, label, preview)
        : undefined,
      title,
    };
  });
});
</script>

<template>
  <div class="color-summary">
    <div><span class="muted">颜色方式：</span>{{ colorModeText(value) }}</div>
    <div
      v-for="color in colors"
      :key="color.title"
      class="color-summary-row"
      :class="{ muted: color.title === '原单色' }"
    >
      <FdmColorPreview v-if="color.sample" :color="color.sample" size="small" />
      <span>{{ color.title }}：{{ color.label }}</span>
    </div>
    <template v-if="construction">
      <div>
        <span class="muted">制造结构：</span>{{ constructionText(value) }}
      </div>
      <div v-if="value.finishedThicknessMm != null">
        成品厚度：{{ value.finishedThicknessMm }} mm
      </div>
      <div v-if="value.constructionType === 'DOUBLE_LAYER'">
        正面层 {{ value.frontThicknessMm ?? '未维护' }} mm + 反面层
        {{ value.backThicknessMm ?? '未维护' }} mm
      </div>
      <div v-if="productSliceThicknessText(value)">
        开片厚度：{{ productSliceThicknessText(value) }}
      </div>
    </template>
  </div>
</template>

<style scoped>
.color-summary {
  line-height: 1.65;
  overflow-wrap: anywhere;
  white-space: normal;
}

.color-summary-row {
  display: flex;
  gap: 6px;
  align-items: center;
}

.muted {
  color: hsl(var(--muted-foreground));
}
</style>
