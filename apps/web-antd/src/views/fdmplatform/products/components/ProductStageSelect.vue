<script setup lang="ts">
import type { ProductAttributeOptions } from '#/api/fdmplatform/products';

import { computed } from 'vue';

import { Cascader } from 'ant-design-vue';

const props = withDefaults(
  defineProps<{
    allowClear?: boolean;
    /** 筛选可选大类；产品档案编辑仍需保存具体阶段。 */
    allowGroups?: boolean;
    options: ProductAttributeOptions['stages'];
    placeholder?: string;
    value?: null | string;
  }>(),
  {
    allowClear: true,
    allowGroups: false,
    placeholder: '全部生产分类',
    value: undefined,
  },
);
const emit = defineEmits<{ 'update:value': [value: string | undefined] }>();

const stageGroups: Record<string, string> = {
  RAW: '原材料',
  BOARD: '半成品',
  SHEET: '半成品',
  CUT: '半成品',
  LAMINATED: '半成品',
  EMBOSSED: '半成品',
  PUNCHED: '半成品',
  ENGRAVED: '半成品',
  FINISHED: '成品',
  FOLDED: '成品',
  PACKED: '成品',
  AUX: '辅料与包材',
  PACKAGING: '辅料与包材',
  EQUIPMENT: '设备与耗材',
  CONSUMABLE: '设备与耗材',
  OTHER: '其他',
};
const groups = ['原材料', '半成品', '成品', '辅料与包材', '设备与耗材', '其他'];
const choices = computed(() => {
  const list = [...props.options];
  if (
    props.value &&
    !props.value.startsWith('group:') &&
    !list.some((item) => item.value === props.value)
  ) {
    list.push({ value: props.value, label: props.value, group: '其他' });
  }
  const result = new Map<string, Array<{ label: string; value: string }>>();
  for (const item of list) {
    const group = stageGroups[item.value] ?? item.group ?? '其他';
    const children = result.get(group) ?? [];
    children.push({ value: item.value, label: item.label });
    result.set(group, children);
  }
  return [...result]
    .toSorted(([a], [b]) => {
      const left = groups.indexOf(a);
      const right = groups.indexOf(b);
      return (
        (left === -1 ? groups.length : left) -
        (right === -1 ? groups.length : right)
      );
    })
    .map(([group, children]) => ({
      value: `group:${group}`,
      label: group,
      children,
    }));
});
const path = computed(() => {
  if (!props.value) return undefined;
  if (
    props.allowGroups &&
    choices.value.some((item) => item.value === props.value)
  )
    return [props.value];
  const group = choices.value.find((item) =>
    item.children.some((child) => child.value === props.value),
  );
  return group ? [group.value, props.value] : undefined;
});
function change(value: unknown) {
  if (!Array.isArray(value) || value.length === 0) {
    emit('update:value', undefined);
    return;
  }
  const leaf = value[1];
  if (typeof leaf === 'string') emit('update:value', leaf);
  else if (
    props.allowGroups &&
    choices.value.some((item) => item.value === value[0])
  )
    emit('update:value', value[0]);
}
</script>

<template>
  <Cascader
    :value="path"
    :options="choices"
    :allow-clear="allowClear"
    :placeholder="placeholder"
    :change-on-select="allowGroups"
    :expand-trigger="allowGroups ? 'hover' : 'click'"
    show-search
    @change="change"
  />
</template>
