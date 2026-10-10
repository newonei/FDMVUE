<script setup lang="ts">
import type { FdmgongchangFactoryApi } from '#/api/fdmgongchang/factory';

import { Select } from 'ant-design-vue';

/** 页面标题旁的工厂选择：只有一家工厂时直接显示厂名。 */
defineProps<{
  factories: FdmgongchangFactoryApi.Factory[];
  value: null | number;
}>();
const emit = defineEmits<{ change: [id: number] }>();
</script>

<template>
  <div class="flex items-center gap-2 text-sm">
    <span class="text-muted-foreground">工厂</span>
    <Select
      v-if="factories.length > 1"
      id="factory-switch"
      :options="factories.map((f) => ({ label: f.name, value: f.id }))"
      :value="value ?? undefined"
      aria-label="切换工厂"
      class="w-36"
      size="small"
      @change="(v) => emit('change', Number(v))"
    />
    <b v-else class="text-foreground">{{ factories[0]?.name ?? '—' }}</b>
  </div>
</template>
