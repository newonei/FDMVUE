<script setup lang="ts">
import type { AttrField } from '../model';

import type { FdmgongchangStageStockApi as Api } from '#/api/fdmgongchang/stage-stock';

import { computed } from 'vue';

import { InputNumber, Select } from 'ant-design-vue';

import { FIELD_LABELS } from '../model';

/**
 * 物料属性编辑框：按 fields 顺序渲染。颜色可用 colorChoices 限定在领料颜色范围内（开片、贴合）。
 */
const props = defineProps<{
  colorChoices?: string[];
  fields: AttrField[];
  idPrefix: string;
  options: Api.Options;
}>();

const emit = defineEmits<{ changed: [field: AttrField] }>();

const attrs = defineModel<Api.ItemAttrs>({ required: true });

const colorOptions = computed(() => {
  const all = props.options.colors.map((c) => ({
    label: c.label,
    value: c.value,
  }));
  if (!props.colorChoices || props.colorChoices.length === 0) return all;
  const allowed = new Set(props.colorChoices.map((c) => c.toUpperCase()));
  const limited = all.filter((c) => allowed.has(c.value.toUpperCase()));
  return limited.length > 0 ? limited : all;
});
const materialOptions = computed(() =>
  props.options.materials.map((m) => ({ label: m.label, value: m.value })),
);
const recipeOptions = computed(() =>
  props.options.recipes.map((r) => ({
    label: `${r.code} ${r.name}`,
    value: r.code,
  })),
);
const textureOptions = computed(() =>
  props.options.textures.map((t) => ({ label: t.label, value: t.value })),
);
const patternOptions = computed(() =>
  props.options.patterns.map((p) => ({ label: p.label, value: p.value })),
);

function selectOptions(field: AttrField) {
  if (field === 'material') return materialOptions.value;
  if (field === 'recipeCode') return recipeOptions.value;
  if (field === 'textureFront' || field === 'textureBack')
    return textureOptions.value;
  if (field === 'pattern') return patternOptions.value;
  return colorOptions.value;
}

function numberValue(field: AttrField) {
  const value = attrs.value[field];
  return value === null || value === undefined || value === ''
    ? undefined
    : Number(value);
}

function isNumberField(field: AttrField) {
  return field === 'length' || field === 'width' || field === 'thickness';
}

function update(field: AttrField, value: unknown) {
  attrs.value = { ...attrs.value, [field]: value ?? null };
  emit('changed', field);
}

function emptyHint(field: AttrField) {
  if (field === 'pattern') return '先在字典管理里添加雕刻图案';
  if (field === 'textureFront' || field === 'textureBack')
    return '先在字典管理里添加压花纹路';
  return '暂无选项';
}
</script>

<template>
  <div class="flex flex-wrap items-center gap-x-4 gap-y-2">
    <label
      v-for="field in fields"
      :key="field"
      :for="`${idPrefix}-${field}`"
      class="flex items-center gap-1.5 text-xs text-muted-foreground"
    >
      <span class="whitespace-nowrap">{{ FIELD_LABELS[field] }}</span>
      <InputNumber
        v-if="isNumberField(field)"
        :id="`${idPrefix}-${field}`"
        :value="numberValue(field)"
        :min="0"
        :max="9999.99"
        :precision="field === 'thickness' ? 2 : 1"
        :step="field === 'thickness' ? 0.1 : 1"
        class="w-24"
        size="small"
        addon-after="cm"
        @change="(v) => update(field, v)"
      />
      <Select
        v-else
        :id="`${idPrefix}-${field}`"
        :value="(attrs[field] as string | undefined) ?? undefined"
        :options="selectOptions(field)"
        :allow-clear="
          field === 'textureFront' ||
          field === 'textureBack' ||
          field === 'pattern'
        "
        :not-found-content="emptyHint(field)"
        :class="field === 'recipeCode' ? 'w-56' : 'w-28'"
        option-filter-prop="label"
        placeholder="请选择"
        show-search
        size="small"
        @change="(v) => update(field, v)"
      />
    </label>
  </div>
</template>
