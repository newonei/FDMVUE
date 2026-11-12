<script setup lang="ts">
import type { ProductAttributes } from '#/api/fdmplatform/products';

import { colorModeText, constructionText } from '../manufacturing';

defineProps<{ construction?: boolean; value: ProductAttributes }>();
</script>

<template>
  <div class="color-summary">
    <div><span class="muted">颜色方式：</span>{{ colorModeText(value) }}</div>
    <div v-if="value.colorMode === 'SINGLE'">
      颜色：{{ value.colorCodeLabel || value.colorCode || '未维护' }}
    </div>
    <template v-else>
      <div>
        正面颜色：{{ value.frontColorLabel || value.frontColor || '未维护' }}
      </div>
      <div>
        反面颜色：{{ value.backColorLabel || value.backColor || '未维护' }}
      </div>
      <div
        v-if="
          value.colorMode !== 'DUAL' &&
          (value.colorCodeLabel || value.colorCode)
        "
        class="muted"
      >
        原单色：{{ value.colorCodeLabel || value.colorCode }}
      </div>
    </template>
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
    </template>
  </div>
</template>

<style scoped>
.color-summary {
  line-height: 1.65;
  overflow-wrap: anywhere;
  white-space: normal;
}

.muted {
  color: hsl(var(--muted-foreground));
}
</style>
