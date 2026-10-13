<script setup lang="ts">
import { computed } from 'vue';

import { Button, Dropdown, Menu } from 'ant-design-vue';

/**
 * 采购单「下属单据新建」（金智同款）：付款记录、付款发票、入库单、退货单、费用报销等
 * 按部门分组，从采购单直接新建，自动关联当前采购单。
 */
export interface SubDocItem {
  key: string;
  label: string;
  group: string;
  disabled?: boolean;
  title?: string;
}
const props = defineProps<{ disabled?: boolean; items: SubDocItem[] }>();
const emit = defineEmits<{ pick: [key: string] }>();

const menuItems = computed(() => {
  const groups = new Map<string, SubDocItem[]>();
  for (const item of props.items) {
    groups.set(item.group, [...(groups.get(item.group) ?? []), item]);
  }
  return [...groups.entries()].map(([group, entries]) => ({
    type: 'group' as const,
    key: group,
    label: group,
    children: entries.map((entry) => ({
      key: entry.key,
      label: entry.label,
      disabled: entry.disabled,
      title: entry.title,
    })),
  }));
});
</script>

<template>
  <Dropdown :disabled="disabled" :trigger="['click']">
    <Button type="primary">下属单据新建</Button>
    <template #overlay>
      <Menu
        :items="menuItems"
        @click="
          (info: { key: string | number }) => emit('pick', String(info.key))
        "
      />
    </template>
  </Dropdown>
</template>
