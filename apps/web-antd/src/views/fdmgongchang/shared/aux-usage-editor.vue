<script setup lang="ts">
import type { AuxUsageDraft } from './auxiliary-usage';

import type { FdmgongchangRouteApi as RouteApi } from '#/api/fdmgongchang/factory';

import { computed, onBeforeUnmount, ref } from 'vue';

import { InputNumber, Select } from 'ant-design-vue';

interface AuxProduct {
  code?: null | string;
  displayName?: null | string;
  id: string;
  name: string;
  unit?: null | string;
}

/**
 * 辅料用量（下单人定）：搜产品中心的辅料加进来，填每件用量和在哪道工序领；
 * 开工序单时按用量带出建议领用数。不填工序默认工艺的最后一道。
 */
const props = defineProps<{
  id: string;
  options?: RouteApi.Options;
  search: (keyword: string) => Promise<AuxProduct[]>;
  steps: string[];
}>();
const rows = defineModel<AuxUsageDraft[]>({ required: true });

const results = ref<Array<{ label: string; value: string }>>([]);
const keyword = ref('');
/** 加完一种后重新挂载搜索框，回到占位提示。 */
const pickerKey = ref(0);
const found = ref<AuxProduct[]>([]);
const searching = ref(false);
let timer: ReturnType<typeof setTimeout> | undefined;
onBeforeUnmount(() => clearTimeout(timer));

const stepOptions = computed(() =>
  props.steps.map((code) => ({
    label:
      props.options?.processes.find((p) => p.code === code)?.label ?? code,
    value: code,
  })),
);
const lastStep = computed(() => props.steps[props.steps.length - 1]);

function onSearch(value: string) {
  keyword.value = value;
  clearTimeout(timer);
  if (!value.trim()) return;
  timer = setTimeout(async () => {
    searching.value = true;
    try {
      found.value = await props.search(value.trim());
      results.value = found.value.map((p) => ({
        label: `${p.displayName || p.name}${p.code ? `（${p.code}）` : ''}${p.unit ? ` · ${p.unit}` : ''}`,
        value: p.id,
      }));
    } finally {
      searching.value = false;
    }
  }, 300);
}

function add(value: unknown) {
  // 加完清空搜索，方便接着搜下一种
  keyword.value = '';
  results.value = [];
  pickerKey.value += 1;
  const product = found.value.find((p) => p.id === value);
  if (!product || rows.value.some((r) => r.productId === product.id)) return;
  rows.value = [
    ...rows.value,
    {
      perUnit: 1,
      process: undefined,
      productCode: product.code,
      productId: product.id,
      productName: product.displayName || product.name,
      unit: product.unit,
    },
  ];
}

function remove(productId: string) {
  rows.value = rows.value.filter((r) => r.productId !== productId);
}
</script>

<template>
  <div class="flex flex-col gap-1.5">
    <div class="flex flex-wrap items-center gap-2">
      <span class="text-xs text-muted-foreground">辅料</span>
      <Select
        :id="`${id}-aux`"
        :key="pickerKey"
        :filter-option="false"
        :loading="searching"
        :options="results"
        :search-value="keyword"
        class="w-60"
        placeholder="搜彩盒、标签、纸箱等辅料加入"
        show-search
        size="small"
        @change="add"
        @search="onSearch"
      />
      <span v-if="rows.length === 0" class="text-xs text-muted-foreground">
        选填；定了用量，开工序单时会带出建议领用数
      </span>
    </div>
    <div
      v-for="row in rows"
      :key="row.productId"
      class="flex flex-wrap items-center gap-2 pl-8 text-xs"
    >
      <span class="min-w-[8rem] truncate" :title="row.productName ?? ''">
        {{ row.productName }}
        <span v-if="row.productCode" class="text-muted-foreground">{{ row.productCode }}</span>
      </span>
      <span class="flex items-center gap-1 text-muted-foreground">
        每件
        <InputNumber
          :id="`${id}-aux-${row.productId}-qty`"
          :min="0"
          :value="row.perUnit ?? undefined"
          size="small"
          :style="{ width: '6rem' }"
          @update:value="(v) => (row.perUnit = v === null || v === undefined || v === '' ? null : Number(v))"
        />
        {{ row.unit }}
      </span>
      <span class="flex items-center gap-1 text-muted-foreground">
        在
        <Select
          :id="`${id}-aux-${row.productId}-process`"
          :options="stepOptions"
          :value="row.process ?? undefined"
          allow-clear
          class="w-28"
          :placeholder="stepOptions.find((s) => s.value === lastStep)?.label ?? '最后一道'"
          size="small"
          @update:value="(v) => (row.process = typeof v === 'string' ? v : undefined)"
        />
        领
      </span>
      <button
        class="text-destructive hover:underline"
        type="button"
        @click="remove(row.productId)"
      >
        删除
      </button>
    </div>
  </div>
</template>
