<script setup lang="ts">
import type { ProductStructure } from '#/api/fdmplatform/products';

import { computed } from 'vue';

import {
  colorModeText,
  constructionText,
  productDimensionsText,
  productPatternText,
} from '#/views/fdmplatform/products/manufacturing';
import { structureValue } from '#/views/fdmplatform/products/structure';

const props = defineProps<{
  foldingType?: null | string;
  /** 仅在当前用户可查看产品档案时传入。 */
  productId?: string;
  purchaseState?: 'loading' | 'unavailable';
  value?: ProductStructure;
}>();

const archiveHref = computed(() => {
  if (!props.productId) return undefined;
  const hashPrefix = import.meta.env.VITE_ROUTER_HISTORY === 'hash' ? '#/' : '';
  const query = new URLSearchParams({ productId: props.productId });
  return `${import.meta.env.BASE_URL}${hashPrefix}fdmproducts/catalog?${query}`;
});

const faces = [
  { label: '正面', color: 'frontColor', colorLabel: 'frontColorLabel', texture: 'textureFront', textureLabel: 'textureFrontLabel' },
  { label: '反面', color: 'backColor', colorLabel: 'backColorLabel', texture: 'textureBack', textureLabel: 'textureBackLabel' },
] as const;

function faceColor(value: ProductStructure, face: (typeof faces)[number]) {
  if (value.colorMode === 'SINGLE') {
    return value.colorCodeLabel?.trim() || value.colorCode?.trim()
      || structureValue(value, 'frontColor', 'frontColorLabel');
  }
  return structureValue(value, face.color, face.colorLabel);
}
</script>

<template>
  <div v-if="value || purchaseState || foldingType || archiveHref" class="my-1 grid gap-1 rounded bg-muted/40 px-2 py-1.5 text-xs break-words">
    <div v-if="value || purchaseState || archiveHref" class="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
      <span v-if="value || purchaseState" class="font-medium">采购来源规格</span>
      <a v-if="archiveHref" :href="archiveHref" target="_blank" rel="noopener" class="text-primary hover:underline">查看产品档案</a>
    </div>
    <template v-if="value">
      <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span :class="{ 'font-semibold text-orange-700 dark:text-orange-300': value.patternMode === 'LASER' }">
          {{ value.patternMode === 'LASER' ? '激光雕刻' : productPatternText(value) }}
        </span>
        <template v-if="value.patternMode === 'LASER'">
          <span>图案：{{ value.patternCode?.trim() || '未填写' }}</span>
          <span>版本：{{ value.patternVersion?.trim() || '未填写' }}</span>
        </template>
      </div>
      <div class="flex flex-wrap gap-x-3 gap-y-1 text-muted-foreground">
        <span v-if="value.material">{{ value.material }}</span>
        <span>{{ colorModeText(value) }} · {{ constructionText(value) }}</span>
        <span v-if="productDimensionsText(value)">{{ productDimensionsText(value) }}</span>
        <span v-if="value.matType || value.matTypeLabel">{{ structureValue(value, 'matType', 'matTypeLabel') }}</span>
      </div>
      <div class="flex flex-wrap gap-x-3 gap-y-1">
        <span v-for="face in faces" :key="face.label">
          {{ face.label }}：{{ faceColor(value, face) }} · {{ value[face.texture] === 'NONE' ? '无纹路' : structureValue(value, face.texture, face.textureLabel) }}
        </span>
      </div>
    </template>
    <span v-else-if="purchaseState" class="text-muted-foreground">
      {{ purchaseState === 'loading' ? '正在加载采购来源规格…' : '采购来源规格暂不可用' }}
    </span>
    <span v-if="foldingType" class="text-muted-foreground">折叠建议：{{ foldingType }}</span>
  </div>
</template>
