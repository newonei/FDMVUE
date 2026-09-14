<script setup lang="ts">
import type { BusinessRecord } from '#/api/fdmplatform';

import { computed, onBeforeUnmount, ref, watch } from 'vue';

import { Alert, Select } from 'ant-design-vue';

import { getStockPage, getStockPool } from '#/api/fdmplatform/stock';

import { errorText } from '../data';
const props = defineProps<{
  disabled?: boolean;
  skuId?: string;
  specVersion?: string;
  value?: string;
  warehouseId?: string;
}>();
const emit = defineEmits<{ 'update:value': [string | undefined] }>();
const list = ref<BusinessRecord[]>([]);
const total = ref(0);
const page = ref(1);
const keyword = ref('');
const loading = ref(false);
const pageError = ref('');
let sequence = 0;
let timer: ReturnType<typeof setTimeout> | undefined;
const ready = computed(() =>
  Boolean(props.skuId && props.warehouseId && props.specVersion),
);
const options = computed(() =>
  list.value.map((row) => ({
    value: row.id,
    label: `${row.warehouseName ?? '仓库未维护'} · ${row.skuName ?? '产品'} · ${row.stockOwnerName ?? '货权待核实'} · 可用 ${row.available ?? '待核实'}`,
    disabled: row.authority !== 'PLATFORM',
  })),
);
async function load(reset = false) {
  const run = ++sequence;
  if (reset) page.value = 1;
  if (!ready.value) {
    list.value = [];
    return;
  }
  loading.value = true;
  pageError.value = '';
  try {
    const result = await getStockPage({
      skuId: props.skuId,
      warehouseId: props.warehouseId,
      specVersion: props.specVersion,
      keyword: keyword.value.trim() || undefined,
      pageNo: page.value,
      pageSize: 20,
    });
    if (run !== sequence) return;
    list.value = reset ? result.list : [...list.value, ...result.list];
    total.value = result.total;
    if (props.value && !list.value.some((row) => row.id === props.value)) {
      const id = props.value;
      const row = await getStockPool(id);
      if (
        run === sequence &&
        props.value === id &&
        row.skuId === props.skuId &&
        row.warehouseId === props.warehouseId &&
        row.specVersion === props.specVersion
      )
        list.value.unshift(row);
    }
  } catch (error) {
    if (run === sequence) pageError.value = errorText(error);
  } finally {
    if (run === sequence) loading.value = false;
  }
}
function search(value: string) {
  clearTimeout(timer);
  ++sequence;
  keyword.value = value;
  timer = setTimeout(() => {
    void load(true);
  }, 200);
}
function scroll(event: Event) {
  const element = event.target as HTMLElement;
  if (
    loading.value ||
    page.value * 20 >= total.value ||
    element.scrollHeight - element.scrollTop - element.clientHeight > 24
  )
    return;
  page.value++;
  void load();
}
watch(
  () => [props.skuId, props.warehouseId, props.specVersion],
  (_, previous) => {
    clearTimeout(timer);
    if (previous) emit('update:value', undefined);
    keyword.value = '';
    void load(true);
  },
  { immediate: true },
);
onBeforeUnmount(() => {
  ++sequence;
  clearTimeout(timer);
});
</script>
<template>
  <Select
    :value="value"
    :options="options"
    :loading="loading"
    :disabled="disabled || !ready"
    :placeholder="
      ready ? '选择已接管的匹配库存池' : '先选择产品、仓库并补齐规格'
    "
    show-search
    :filter-option="false"
    allow-clear
    style="width: 100%"
    @search="search"
    @popup-scroll="scroll"
    @update:value="
      (value) =>
        emit('update:value', typeof value === 'string' ? value : undefined)
    "
  /><Alert v-if="pageError" type="error" :message="pageError" />
</template>
