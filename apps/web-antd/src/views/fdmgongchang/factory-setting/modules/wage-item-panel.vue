<script setup lang="ts">
import type { FdmgongchangWageApi as Api } from '#/api/fdmgongchang/wage';

import { computed, onMounted, ref } from 'vue';

import { useAccess } from '@vben/access';

import { Button, Input, message, Segmented, Select, Spin, Switch, Table, Tag } from 'ant-design-vue';

import { getWageItems, updateWageItemStatus } from '#/api/fdmgongchang/wage';

import {
  CATEGORY_COLORS,
  CATEGORY_LABELS,
  conditionText,
  formatDateValue,
  formatMoney,
  toNum,
} from '../../shared/wage';
import WageItemModal from './wage-item-modal.vue';
import WagePriceModal from './wage-price-modal.vue';

/** 工厂设置 · 计价项目：本厂的工序计件、计时、杂活、补助价格。 */
const props = defineProps<{ processes: Array<{ code: string; label: string }> }>();

const { hasAccessByCodes } = useAccess();
const canEdit = computed(() => hasAccessByCodes(['fdmgongchang:wage-item:update']));

const items = ref<Api.Item[]>([]);
const loading = ref(false);
const category = ref<'' | Api.Category>('');
const process = ref<string>();
const keyword = ref('');
const showDisabled = ref(false);

const itemOpen = ref(false);
const editing = ref<Api.Item>();
const priceOpen = ref(false);
const pricing = ref<Api.Item>();

async function load() {
  loading.value = true;
  try {
    items.value = await getWageItems();
  } finally {
    loading.value = false;
  }
}
onMounted(load);

const processLabel = (code?: null | string) =>
  props.processes.find((p) => p.code === code)?.label ?? code ?? '';

const rows = computed(() =>
  items.value.filter(
    (i) =>
      (showDisabled.value || i.status === 0) &&
      (!category.value || i.category === category.value) &&
      (!process.value || i.process === process.value) &&
      (!keyword.value.trim() || i.name.includes(keyword.value.trim())),
  ),
);
const counts = computed(() => {
  const c: Record<string, number> = {};
  for (const i of items.value) if (i.status === 0) c[i.category] = (c[i.category] ?? 0) + 1;
  return c;
});
const categoryOptions = computed(() => [
  { label: `全部（${items.value.filter((i) => i.status === 0).length}）`, value: '' },
  ...(Object.keys(CATEGORY_LABELS) as Api.Category[]).map((c) => ({
    label: `${CATEGORY_LABELS[c]}（${counts.value[c] ?? 0}）`,
    value: c,
  })),
]);
const unpriced = computed(() => items.value.filter((i) => i.status === 0 && toNum(i.currentPrice) === undefined));
const pending = computed(() => items.value.filter((i) => i.status === 0 && i.unit === '待定'));

function openItem(item?: Api.Item) {
  editing.value = item;
  itemOpen.value = true;
}

function openPrice(item: Api.Item) {
  pricing.value = item;
  priceOpen.value = true;
}

async function toggle(item: Api.Item) {
  const status = item.status === 0 ? 1 : 0;
  await updateWageItemStatus({ id: item.id, status });
  message.success(`「${item.name}」已${status === 0 ? '启用' : '停用'}`);
  await load();
}

async function onSaved(text: string) {
  message.success(text);
  await load();
}

const columns = [
  { key: 'name', title: '项目' },
  { key: 'category', title: '类别 / 工序' },
  { key: 'condition', title: '适用条件' },
  { align: 'right' as const, key: 'price', title: '当前单价（元）' },
  { key: 'unit', title: '单位' },
  { align: 'right' as const, key: 'actions', title: '', width: 150 },
];
</script>

<template>
  <div class="flex flex-col gap-3">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <Segmented v-model:value="category" :options="categoryOptions" size="small" />
      <div class="flex flex-wrap items-center gap-2">
        <Select
          id="wage-item-filter-process"
          v-model:value="process"
          :options="processes.map((p) => ({ label: p.label, value: p.code }))"
          allow-clear
          class="w-28"
          placeholder="全部工序"
          size="small"
        />
        <Input id="wage-item-filter-keyword" v-model:value="keyword" allow-clear class="w-40" placeholder="搜项目名称" size="small" />
        <label for="wage-item-show-disabled" class="flex items-center gap-1 text-xs text-muted-foreground">
          <Switch id="wage-item-show-disabled" v-model:checked="showDisabled" size="small" />
          显示停用
        </label>
        <Button v-if="canEdit" size="small" type="primary" @click="openItem()">＋ 新建项目</Button>
      </div>
    </div>
    <p v-if="pending.length > 0 || unpriced.length > 0" class="m-0 text-xs text-warning">
      <span v-if="pending.length > 0">{{ pending.length }} 个项目单位待定（{{ pending.map((i) => i.name).join('、') }}），确认后点「修改」填写。</span>
      <span v-if="unpriced.length > 0">{{ unpriced.length }} 个项目今天还没有生效的价格，登记报工时会被拒绝。</span>
    </p>
    <Spin :spinning="loading">
      <Table :columns="columns" :data-source="rows" :pagination="false" :scroll="{ x: 'max-content' }" row-key="id" size="small">
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'name'">
            <div class="flex flex-col">
              <span :class="record.status === 0 ? '' : 'text-muted-foreground line-through'">{{ record.name }}</span>
              <span v-if="record.remark" class="text-xs text-muted-foreground">{{ record.remark }}</span>
            </div>
          </template>
          <template v-else-if="column.key === 'category'">
            <Tag :color="CATEGORY_COLORS[record.category as Api.Category]" class="m-0">
              {{ CATEGORY_LABELS[record.category as Api.Category] }}
            </Tag>
            <span v-if="record.process" class="ml-1 text-xs">{{ processLabel(record.process) }}</span>
          </template>
          <template v-else-if="column.key === 'condition'">
            <span class="text-xs">{{ conditionText(record as Api.Item) || '—' }}</span>
          </template>
          <template v-else-if="column.key === 'price'">
            <div class="flex flex-col items-end">
              <b class="tabular-nums">{{ formatMoney(record.currentPrice, 4) }}</b>
              <span v-if="record.baseItemId" class="whitespace-nowrap text-xs text-muted-foreground">
                {{ record.baseItemName }} × {{ formatMoney(record.coefficient, 4) }}
              </span>
              <span v-else-if="record.currentEffectiveFrom" class="whitespace-nowrap text-xs text-muted-foreground">
                {{ formatDateValue(record.currentEffectiveFrom) }} 起
              </span>
            </div>
          </template>
          <template v-else-if="column.key === 'unit'">
            <span :class="record.unit === '待定' ? 'text-warning' : ''">{{ record.unit }}</span>
          </template>
          <template v-else-if="column.key === 'actions'">
            <span v-if="canEdit" class="flex justify-end gap-2 whitespace-nowrap text-xs">
              <button type="button" class="text-primary hover:underline" @click="openItem(record as Api.Item)">修改</button>
              <button v-if="!record.baseItemId" type="button" class="text-primary hover:underline" @click="openPrice(record as Api.Item)">调价</button>
              <button type="button" class="text-muted-foreground hover:underline" @click="toggle(record as Api.Item)">
                {{ record.status === 0 ? '停用' : '启用' }}
              </button>
            </span>
          </template>
        </template>
      </Table>
    </Spin>
    <WageItemModal v-model:open="itemOpen" :item="editing" :items="items" :processes="processes" @saved="onSaved" />
    <WagePriceModal v-model:open="priceOpen" :item="pricing" @saved="onSaved" />
  </div>
</template>
