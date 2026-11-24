<script setup lang="ts">
import type {
  ProductAttributeOption,
  ProductAttributes,
} from '#/api/fdmplatform/products';

import { computed } from 'vue';

import { Form, Input, InputNumber, Select } from 'ant-design-vue';

import FdmColorPreview from '#/components/fdm-color-preview/fdm-color-preview.vue';

import { filterProductColorOption } from '../attributes';
import { productColorPreview } from '../color-preview';
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
    colors: ProductAttributeOption[];
    deriveLayers?: boolean;
    savedColors?: ProductAttributes;
    value: ProductAttributes;
  }>(),
  { deriveLayers: undefined, savedColors: undefined },
);
const emit = defineEmits<{ 'update:value': [value: ProductAttributes] }>();

const colorFields = {
  DUAL: [
    ['frontColor', '正面色号'],
    ['backColor', '反面色号'],
  ],
  SINGLE: [['colorCode', '色号']],
  UNKNOWN: [],
} as const;
type ColorField = (typeof colorFields)[keyof typeof colorFields][number][0];

const colorsByValue = computed(
  () => new Map(props.colors.map((color) => [color.value, color])),
);
const selectedColorFields = computed(() =>
  colorFields[props.value.colorMode ?? 'UNKNOWN'].map(([field, label]) => ({
    field,
    label,
    preview: selectedPreview(field),
  })),
);
const automaticLayers = computed(
  () => props.deriveLayers ?? usesColorDerivedLayers(props.value),
);
const manualDoubleLayer = computed(
  () =>
    !automaticLayers.value &&
    props.value.layerRule !== COLOR_DERIVED_LAYER_RULE &&
    props.value.constructionType === 'DOUBLE_LAYER',
);
const layers = computed(() => {
  if (automaticLayers.value) {
    return {
      ...props.value,
      ...colorDerivedLayers(props.value),
      layerRule: COLOR_DERIVED_LAYER_RULE,
    };
  }
  return {
    ...props.value,
    layerRule: undefined,
    frontThicknessMm:
      props.value.constructionType === 'SINGLE_LAYER'
        ? props.value.finishedThicknessMm
        : props.value.frontThicknessMm,
  };
});
function update(field: keyof ProductAttributes, value: unknown) {
  emit('update:value', { ...props.value, [field]: value });
}
function selectedPreview(field: ColorField) {
  const value = props.value[field];
  if (!value) return undefined;

  const option = colorsByValue.value.get(value);
  const saved =
    props.savedColors?.[field] === value ? props.savedColors : undefined;
  return productColorPreview(
    value,
    option?.label ?? saved?.[`${field}Label`],
    option ? option.preview : saved?.[`${field}Preview`],
  );
}
function colorOptionsFor(field: ColorField) {
  const value = props.value[field];
  if (!value || colorsByValue.value.has(value)) return props.colors;

  const saved =
    props.savedColors?.[field] === value ? props.savedColors : undefined;
  return [
    { value, label: saved?.[`${field}Label`] || value, disabled: true },
    ...props.colors,
  ];
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
          : '当前物料按档案制造结构维护厚度，不自动套用成品开片规则。'
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
      <template v-if="manualDoubleLayer">
        <Form.Item
          v-for="[field, label] in [
            ['frontThicknessMm', '正面层厚度（mm）'],
            ['backThicknessMm', '反面层厚度（mm）'],
          ] as const"
          :key="field"
          :label="label"
          required
        >
          <InputNumber
            :value="value[field] ?? undefined"
            :min="0"
            :step="0.1"
            :aria-label="label"
            @update:value="(v) => update(field, v)"
          />
        </Form.Item>
      </template>
      <Form.Item
        v-for="{ field, label, preview } in selectedColorFields"
        :key="field"
        :label="label"
        required
      >
        <div class="color-field">
          <Select
            :value="value[field] || undefined"
            :options="colorOptionsFor(field)"
            :filter-option="filterProductColorOption"
            :aria-label="label"
            class="color-select"
            show-search
            allow-clear
            placeholder="搜索色号，如 6225 C"
            @update:value="(v) => update(field, v ?? '')"
          />
          <FdmColorPreview v-if="preview" :color="preview" size="small" />
        </div>
      </Form.Item>
      <ProductColorSummary
        v-if="!value.colorMode || value.colorMode === 'UNKNOWN'"
        :value="value"
      />
      <div class="layer-summary" aria-label="制造结构与厚度">
        <div>制造结构：{{ constructionText(layers) }}</div>
        <div v-if="!manualDoubleLayer">
          成品名义层厚：{{ productNominalLayersText(layers) }}
        </div>
        <div v-if="productSliceThicknessText(layers)">
          开片厚度：{{ productSliceThicknessText(layers) }}
        </div>
        <div v-if="productThicknessProcessText(layers)">
          {{ productThicknessProcessText(layers) }}
        </div>
        <p v-if="manualDoubleLayer" class="hint">
          正面层与反面层厚度之和须等于成品厚度。
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
        <Form.Item label="激光图案">
          <Input
            :value="value.patternCode ?? ''"
            :maxlength="32"
            allow-clear
            aria-label="激光图案"
            placeholder="选填，图案名称或编号"
            @update:value="(v) => update('patternCode', v)"
          />
        </Form.Item>
        <Form.Item label="图案生产版本">
          <Input
            :value="value.patternVersion ?? ''"
            :maxlength="100"
            allow-clear
            aria-label="图案生产版本"
            placeholder="选填，如 V2"
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

.color-field {
  display: flex;
  gap: 8px;
  align-items: center;
}

.color-select {
  flex: 1;
  min-width: 0;
}

@media (max-width: 600px) {
  .fields {
    grid-template-columns: 1fr;
  }
}
</style>
