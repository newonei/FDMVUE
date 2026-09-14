<script setup lang="ts">
import type { MasterRecord } from '#/api/fdmplatform';
import type { MasterType } from '#/api/fdmplatform/masters';

import { computed, onBeforeUnmount, ref, watch } from 'vue';

import { Alert, Select } from 'ant-design-vue';

import { getMasterPage, getMasterRecord } from '#/api/fdmplatform/masters';

import { errorText } from '../data';

const props = defineProps<{
  disabled?: boolean;
  placeholder?: string;
  type: MasterType;
  value?: string;
}>();
const emit = defineEmits<{
  selected: [MasterRecord | undefined];
  'update:value': [string | undefined];
}>();
const records = ref<MasterRecord[]>([]);
const loading = ref(false);
const page = ref(1);
const total = ref(0);
const keyword = ref('');
const pageError = ref('');
let sequence = 0;
let timer: ReturnType<typeof setTimeout> | undefined;
const options = computed(() =>
  records.value.map((row) => ({
    value: row.id,
    label: `${row.code || ''} · ${row.name}${row.active ? '' : '（已停用）'}`,
    disabled: !row.active,
  })),
);
async function load(reset = false) {
  const run = ++sequence;
  if (reset) page.value = 1;
  loading.value = true;
  pageError.value = '';
  try {
    const value = await getMasterPage({
      type: props.type,
      keyword: keyword.value.trim() || undefined,
      active: true,
      pageNo: page.value,
      pageSize: 30,
    });
    if (run !== sequence) return;
    const previous = reset
      ? records.value.filter((row) => row.id === props.value)
      : records.value;
    records.value = [
      ...new Map(
        [...previous, ...value.list].map((row) => [row.id, row]),
      ).values(),
    ];
    total.value = value.total;
    if (props.value && !records.value.some((row) => row.id === props.value)) {
      const id = props.value;
      const row = await getMasterRecord(props.type, id);
      if (run === sequence && id === props.value) records.value.unshift(row);
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
    page.value * 30 >= total.value ||
    element.scrollHeight - element.scrollTop - element.clientHeight > 24
  )
    return;
  page.value++;
  void load();
}
function select(input: unknown) {
  const value = typeof input === 'string' ? input : undefined;
  emit('update:value', value);
  emit(
    'selected',
    records.value.find((row) => row.id === value),
  );
}
watch(
  () => props.type,
  () => {
    clearTimeout(timer);
    records.value = [];
    keyword.value = '';
    void load(true);
  },
  { immediate: true },
);
watch(
  () => props.value,
  (value) => {
    if (value && !records.value.some((row) => row.id === value))
      void load(true);
  },
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
    :disabled="disabled"
    :placeholder="placeholder || '输入名称或编码搜索'"
    :filter-option="false"
    show-search
    allow-clear
    style="width: 100%"
    @search="search"
    @popup-scroll="scroll"
    @update:value="select"
  /><Alert v-if="pageError" type="error" :message="pageError" show-icon />
</template>
