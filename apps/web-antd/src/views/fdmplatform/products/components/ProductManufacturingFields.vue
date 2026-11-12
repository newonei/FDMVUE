<script setup lang="ts">
import type {
  ProductAttributeOption,
  ProductAttributes,
} from '#/api/fdmplatform/products';

import { Form, InputNumber, Select } from 'ant-design-vue';

import { colorModeOptions, constructionOptions } from '../manufacturing';
import ProductColorSummary from './ProductColorSummary.vue';

const props = defineProps<{
  colors: ProductAttributeOption[];
  value: ProductAttributes;
}>();
const emit = defineEmits<{ 'update:value': [value: ProductAttributes] }>();
function update(field: keyof ProductAttributes, value: unknown) {
  emit('update:value', { ...props.value, [field]: value });
}
function colorOptionsFor(field: 'backColor' | 'colorCode' | 'frontColor') {
  const value = props.value[field];
  return !value || props.colors.some((item) => item.value === value)
    ? props.colors
    : [
        ...props.colors,
        { value, label: props.value[`${field}Label`] || value },
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
    <h3>颜色与制造结构</h3>
    <p class="hint">
      颜色与层数分别确认。单色只选一次颜色；双层同色仍选择“双层贴合”。待核实可保存档案，核实后再用于生产。
    </p>
    <div class="fields">
      <Form.Item label="颜色方式">
        <Select
          :value="value.colorMode ?? 'UNKNOWN'"
          :options="colorModeOptions"
          aria-label="颜色方式"
          @update:value="changeMode"
        />
      </Form.Item>
      <Form.Item v-if="value.colorMode === 'SINGLE'" label="颜色" required>
        <Select
          :value="value.colorCode || undefined"
          :options="colorOptionsFor('colorCode')"
          show-search
          option-filter-prop="label"
          allow-clear
          aria-label="单色颜色"
          @update:value="(v) => update('colorCode', v ?? '')"
        />
      </Form.Item>
      <template v-if="value.colorMode === 'DUAL'">
        <Form.Item
          v-for="[field, label] in [
            ['frontColor', '正面颜色'],
            ['backColor', '反面颜色'],
          ] as const"
          :key="field"
          :label="label"
          required
        >
          <Select
            :value="value[field] || undefined"
            :options="colorOptionsFor(field)"
            show-search
            option-filter-prop="label"
            allow-clear
            :aria-label="label"
            @update:value="(v) => update(field, v ?? '')"
          />
        </Form.Item>
      </template>
      <ProductColorSummary
        v-if="!value.colorMode || value.colorMode === 'UNKNOWN'"
        :value="value"
      />
      <Form.Item label="制造结构">
        <Select
          :value="value.constructionType ?? 'UNKNOWN'"
          :options="constructionOptions"
          aria-label="制造结构"
          @update:value="(v) => update('constructionType', v)"
        />
      </Form.Item>
      <Form.Item
        label="成品厚度（mm）"
        :required="
          value.constructionType !== 'UNKNOWN' && !!value.constructionType
        "
      >
        <InputNumber
          :value="value.finishedThicknessMm ?? undefined"
          :precision="2"
          :min="0"
          :step="0.1"
          aria-label="成品厚度（mm）"
          @update:value="(v) => update('finishedThicknessMm', v)"
        />
      </Form.Item>
      <template v-if="value.constructionType === 'DOUBLE_LAYER'">
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
            :precision="2"
            :min="0"
            :step="0.1"
            :aria-label="label"
            @update:value="(v) => update(field, v)"
          />
        </Form.Item>
        <p class="hint">
          正面层厚度 + 反面层厚度 = 成品厚度。按实际工艺填写，不按颜色自动均分。
        </p>
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
