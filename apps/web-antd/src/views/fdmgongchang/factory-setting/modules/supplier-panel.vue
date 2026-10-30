<script setup lang="ts">
import type { FdmgongchangFactorySettingApi as Api } from '#/api/fdmgongchang/factory';

import { computed, onBeforeUnmount, ref, watch } from 'vue';

import { Button, message, Select } from 'ant-design-vue';

import { saveFactorySuppliers, searchFactorySuppliers } from '#/api/fdmgongchang/factory';

/**
 * 对应供应商：采购部门开采购单时，供应商选的是这里列出的公司，就是发给本厂生产的单，
 * 系统自动在「工厂排单 → 本厂收到的单」生成一张工厂订单。一个供应商只能对应一个工厂；工厂停用时照普通外采办理。
 */
const props = defineProps<{ canEdit: boolean; suppliers?: Api.SupplierOption[] }>();
const emit = defineEmits<{ saved: [] }>();

const picked = ref<string[]>([]);
const options = ref<Api.SupplierOption[]>([]);
const searching = ref(false);
const saving = ref(false);

watch(
  () => props.suppliers,
  (list) => {
    picked.value = (list ?? []).map((s) => s.id);
    options.value = [...(list ?? [])];
  },
  { immediate: true },
);

const dirty = computed(() => {
  const saved = (props.suppliers ?? []).map((s) => s.id);
  return saved.length !== picked.value.length || saved.some((id) => !picked.value.includes(id));
});

let timer: ReturnType<typeof setTimeout> | undefined;
function search(keyword: string) {
  clearTimeout(timer);
  if (!keyword.trim()) return;
  timer = setTimeout(async () => {
    searching.value = true;
    try {
      const found = await searchFactorySuppliers(keyword.trim());
      const keep = options.value.filter((o) => picked.value.includes(o.id));
      options.value = [...keep, ...found.filter((f) => !keep.some((k) => k.id === f.id))];
    } finally {
      searching.value = false;
    }
  }, 300);
}
onBeforeUnmount(() => clearTimeout(timer));

async function save() {
  saving.value = true;
  try {
    await saveFactorySuppliers(picked.value);
    message.success('已保存，之后新开或修改的采购单按这里识别');
    emit('saved');
  } catch {
    // 后端错误已由全局提示展示
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <section class="flex flex-col gap-3">
    <h2 class="m-0 text-sm font-semibold">
      对应供应商<span class="ml-2 text-xs font-normal text-muted-foreground">采购单的供应商是这些公司时，自动生成工厂订单给本厂排单</span>
    </h2>
    <Select
      id="factory-suppliers"
      v-model:value="picked"
      :disabled="!canEdit"
      :filter-option="false"
      :loading="searching"
      :options="options.map((o) => ({ label: o.name, value: o.id }))"
      class="max-w-xl"
      mode="multiple"
      not-found-content="输入供应商名称搜索"
      placeholder="搜采购模块的供应商，例如 湖北飞德慕"
      @search="search"
    />
    <p class="m-0 text-xs text-muted-foreground">
      已经开了的采购单下次修改时才会同步过来；金智导入的历史采购单不生成。一个供应商只能对应一个工厂。
    </p>
    <div v-if="canEdit">
      <Button :disabled="!dirty" :loading="saving" type="primary" @click="save">保存</Button>
    </div>
  </section>
</template>
