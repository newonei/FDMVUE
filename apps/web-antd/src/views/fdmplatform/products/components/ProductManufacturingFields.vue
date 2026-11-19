<script setup lang="ts">
import type { ProductAttributes } from '#/api/fdmplatform/products';

import { computed } from 'vue';

import { Form, Input, InputNumber, Select } from 'ant-design-vue';

import {
  COLOR_DERIVED_LAYER_RULE,
  colorDerivedLayers,
  colorModeOptions,
  constructionText,
  patternModeOptions,
  productNominalLayersText,
  productSliceThicknessText,
  productThicknessProcessText,
  usesColorDerivedLayers,
} from '../manufacturing';
import ProductColorSummary from './ProductColorSummary.vue';

const props = withDefaults(
  defineProps<{
    deriveLayers?: boolean;
    value: ProductAttributes;
  }>(),
  { deriveLayers: undefined },
);
const emit = defineEmits<{ 'update:value': [value: ProductAttributes] }>();
const automaticLayers = computed(
  () => props.deriveLayers ?? usesColorDerivedLayers(props.value),
);
const historicalStructure = computed(
  () =>
    !automaticLayers.value &&
    ['DOUBLE_LAYER', 'SINGLE_LAYER'].includes(
      props.value.constructionType ?? '',
    ),
);
const layers = computed(() =>
  automaticLayers.value
    ? {
        ...props.value,
        ...colorDerivedLayers(props.value),
        layerRule: COLOR_DERIVED_LAYER_RULE,
      }
    : { ...props.value, layerRule: undefined },
);
function update(field: keyof ProductAttributes, value: unknown) {
  emit('update:value', { ...props.value, [field]: value });
}
function changeMode(mode: unknown) {
  const colorCode =
    mode === 'SINGLE'
      ? props.value.colorCode ||
        (props.value.frontColor === props.value.backColor
          ? props.value.frontColor
          : '')
      : props.value.colorCode;
  emit('update:value', {
    ...props.value,
    colorMode: mode as ProductAttributes['colorMode'],
    colorCode,
  });
}
</script>

<template>
  <section class="manufacturing-fields">
    <h3>成品尺寸、颜色与雕刻</h3>
    <p class="hint">
      长宽厚统一填写毫米。{{
        automaticLayers
          ? '新成品配置单色为单层，双色为双层均分；每片开片厚度在名义层厚基础上增加 0.2 mm。'
          : '当前物料沿用档案制造结构与厚度，不自动套用成品开片规则。'
      }}雕刻须明确选择无雕刻或激光雕刻。
    </p>
    <div class="fields">
      <Form.Item
        v-for="[field, label] in [
          ['lengthMm', '成品长度（mm）'],
          ['widthMm', '成品宽度（mm）'],
          ['finishedThicknessMm', '成品厚度（mm）'],
        ] as const"
        :key="field"
        :label="label"
      >
        <InputNumber
          :value="value[field] ?? undefined"
          :precision="3"
          :min="0"
          :step="field === 'finishedThicknessMm' ? 0.1 : 1"
          :disabled="field === 'finishedThicknessMm' && historicalStructure"
          :aria-label="label"
          placeholder="待核实"
          @update:value="(v) => update(field, v)"
        />
      </Form.Item>
      <Form.Item label="颜色方式">
        <Select
          :value="value.colorMode ?? 'UNKNOWN'"
          :options="colorModeOptions"
          aria-label="颜色方式"
          @update:value="changeMode"
        />
      </Form.Item>
      <Form.Item v-if="value.colorMode === 'SINGLE'" label="色号" required>
        <Input
          :value="value.colorCode ?? ''"
          :maxlength="100"
          allow-clear
          aria-label="色号"
          placeholder="如 502C"
          @update:value="(v) => update('colorCode', v)"
        />
      </Form.Item>
      <template v-if="value.colorMode === 'DUAL'">
        <Form.Item
          v-for="[field, label] in [
            ['frontColor', '正面色号'],
            ['backColor', '反面色号'],
          ] as const"
          :key="field"
          :label="label"
          required
        >
          <Input
            :value="value[field] ?? ''"
            :maxlength="100"
            allow-clear
            :aria-label="label"
            placeholder="如 502C"
            @update:value="(v) => update(field, v)"
          />
        </Form.Item>
      </template>
      <ProductColorSummary
        v-if="!value.colorMode || value.colorMode === 'UNKNOWN'"
        :value="value"
      />
      <div class="layer-summary" aria-label="制造结构与厚度">
        <div>制造结构：{{ constructionText(layers) }}</div>
        <div>成品名义层厚：{{ productNominalLayersText(layers) }}</div>
        <div v-if="productSliceThicknessText(layers)">
          开片厚度：{{ productSliceThicknessText(layers) }}
        </div>
        <div v-if="productThicknessProcessText(layers)">
          {{ productThicknessProcessText(layers) }}
        </div>
        <p v-if="historicalStructure" class="hint">
          历史制造结构与名义层厚按原档案保留，调整厚度请通过本单配置生成新 SKU。
        </p>
        <p v-else-if="automaticLayers" class="hint">
          层厚自动计算，无需手填。开片厚度单独显示，不写入成品名义层厚。
        </p>
      </div>
      <Form.Item label="雕刻方式">
        <Select
          :value="value.patternMode ?? 'UNKNOWN'"
          :options="patternModeOptions"
          aria-label="雕刻方式"
          @update:value="(v) => update('patternMode', v)"
        />
      </Form.Item>
      <template v-if="value.patternMode === 'LASER'">
        <Form.Item label="激光图案" required>
          <Input
            :value="value.patternCode ?? ''"
            :maxlength="32"
            allow-clear
            aria-label="激光图案"
            placeholder="填写图案名称或编号"
            @update:value="(v) => update('patternCode', v)"
          />
        </Form.Item>
        <Form.Item label="图案生产版本" required>
          <Input
            :value="value.patternVersion ?? ''"
            :maxlength="100"
            aria-label="图案生产版本"
            placeholder="按确认图稿填写，如 V2"
            @update:value="(v) => update('patternVersion', v)"
          />
        </Form.Item>
      </template>
    </div>
  </section>
</template>

<style scoped>
h3 {
  margin: 0 0 12px;
  font-size: 15px;
  font-weight: 600;
}

.hint {
  font-size: 12px;
  color: hsl(var(--muted-foreground));
}

.fields {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0 18px;
}

.fields :deep(.ant-input-number) {
  width: 100%;
}

@media (max-width: 600px) {
  .fields {
    grid-template-columns: 1fr;
  }
}
</style>
