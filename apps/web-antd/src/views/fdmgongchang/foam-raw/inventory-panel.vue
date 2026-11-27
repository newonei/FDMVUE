<script setup lang="ts">
import type { FoamRawInventory, FoamRawInventoryLine, FoamRawMaterial } from '#/api/fdmgongchang/foam-raw';

import { computed, ref, watch } from 'vue';

import { Alert, Button, DatePicker, message, Modal, Select, Table, Tag } from 'ant-design-vue';
import dayjs from 'dayjs';

import { confirmFoamRawInventory, getFoamRawInventory } from '#/api/fdmgongchang/foam-raw';

import { formatKilograms } from './format';
import QuantityInput from './quantity-input.vue';

const props = defineProps<{
  canManage: boolean;
  factoryId: number;
  materials: FoamRawMaterial[];
  refreshKey: number;
}>();
const emit = defineEmits<{ changed: [] }>();

const month = ref(dayjs().format('YYYY-MM'));
const result = ref<FoamRawInventory>();
const loading = ref(false);
const loadError = ref(false);
const saving = ref(false);
const showAddLine = ref(false);
let loadVersion = 0;
type CountLine = FoamRawInventoryLine & { counted: null | number; opening: null | number };
const rows = ref<CountLine[]>([]);
const stillInMonth = computed(() => dayjs().isBefore(dayjs(`${month.value}-01`).endOf('month'), 'day'));
const editable = computed(() => props.canManage && !!result.value && !result.value.confirmed);
const columns = [
  { dataIndex: 'materialName', key: 'materialName', title: '原料', width: 145 },
  { key: 'opening', title: '月初车间结存', width: 175 },
  { key: 'issued', title: '本月实领', width: 155 },
  { key: 'returned', title: '本月退回', width: 155 },
  { key: 'counted', title: '月末实盘', width: 175 },
  { key: 'used', title: '本月实耗', width: 155 },
];
const addOptions = computed(() => props.materials
  .filter((material) => !rows.value.some((line) => line.itemId === material.itemId))
  .map((material) => ({ label: `${material.materialName} · ${material.materialCode}`, value: material.itemId })));

async function reload() {
  const version = ++loadVersion;
  const targetMonth = month.value;
  loading.value = true;
  loadError.value = false;
  showAddLine.value = false;
  try {
    const inventory = await getFoamRawInventory(props.factoryId, targetMonth);
    if (version !== loadVersion) return;
    const previous = result.value?.month === targetMonth ? new Map(rows.value.map((row) => [row.itemId, row])) : new Map<number, CountLine>();
    const fresh = inventory.lines.map((line) => ({
      ...line,
      counted: line.countedQuantity ?? previous.get(line.itemId)?.counted ?? null,
      opening: line.previousQuantity ?? previous.get(line.itemId)?.opening ?? null,
    }));
    if (!inventory.confirmed) {
      for (const row of previous.values()) {
        if (!fresh.some((line) => line.itemId === row.itemId)) fresh.push(row);
      }
    }
    result.value = inventory;
    rows.value = fresh;
  } catch {
    if (version === loadVersion) {
      loadError.value = true;
      if (result.value?.month !== targetMonth) {
        result.value = undefined;
        rows.value = [];
      }
    }
  } finally {
    if (version === loadVersion) loading.value = false;
  }
}

watch([month, () => props.refreshKey], reload, { immediate: true });

function appendLine(itemId: number) {
  const material = props.materials.find((row) => row.itemId === itemId);
  if (!material || rows.value.some((row) => row.itemId === itemId)) return;
  rows.value.push({ counted: null, issuedQuantity: 0, itemId, materialName: material.materialName, opening: null, returnedQuantity: 0 });
  showAddLine.value = false;
}

const packageWeight = (itemId: number) => props.materials.find((material) => material.itemId === itemId)?.packageWeight;

function draftUsed(row: CountLine) {
  if (row.usedQuantity !== null && row.usedQuantity !== undefined) return row.usedQuantity;
  if (row.opening === null || row.opening === undefined || row.counted === null || row.counted === undefined) return null;
  return Math.round((Number(row.opening) + Number(row.issuedQuantity) - Number(row.returnedQuantity) - Number(row.counted)) * 1000) / 1000;
}

function confirmCount() {
  if (saving.value || loading.value || !editable.value || rows.value.length === 0) return;
  const lines = rows.value.flatMap(({ counted, itemId, opening, previousQuantity }) => {
    if (opening === null || opening === undefined || counted === null || counted === undefined) return [];
    return [{
      countedQuantity: counted,
      itemId,
      openingQuantity: previousQuantity === null || previousQuantity === undefined ? opening : undefined,
    }];
  });
  if (lines.length !== rows.value.length) {
    message.warning('请填写每种原料的实盘重量，并补齐没有历史结存的期初数量');
    return;
  }
  if (rows.value.some((row) => (draftUsed(row) ?? 0) < 0)) {
    message.warning('部分实盘数量超过账面可用量，请先核对领退料、期初和实际余量');
    return;
  }
  const targetMonth = month.value;
  Modal.confirm({
    content: '月末实盘数量将作为下月期初结存。',
    title: `确认 ${targetMonth} 的原料盘点？`,
    onOk: async () => {
      saving.value = true;
      try {
        await confirmFoamRawInventory(props.factoryId, { lines, month: targetMonth });
        message.success('已确认月盘点');
        emit('changed');
      } finally {
        saving.value = false;
      }
    },
  });
}
</script>

<template>
  <div class="flex flex-col gap-3">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <div class="flex flex-wrap items-center gap-2">
        <label class="flex items-center gap-2">
          盘点月份
          <DatePicker
            v-model:value="month"
            :allow-clear="false"
            :disabled-date="(value) => value.isAfter(dayjs(), 'month')"
            :disabled="saving"
            picker="month"
            value-format="YYYY-MM"
          />
        </label>
        <Tag v-if="result?.confirmed" color="green">已确认</Tag>
        <Tag v-else-if="result" color="orange">待确认</Tag>
      </div>
      <div v-if="editable" class="flex flex-wrap gap-2">
        <Button :disabled="loading || !addOptions.length" @click="showAddLine = !showAddLine">添加现场原料</Button>
        <Button :disabled="loading || stillInMonth || !rows.length" :loading="saving" type="primary" @click="confirmCount">确认月盘点</Button>
      </div>
    </div>
    <div class="text-sm text-muted-foreground">本月实耗 = 月初车间结存 + 本月实领 − 本月退回 − 月末实盘</div>
    <Alert v-if="loadError" type="error" show-icon message="月盘点加载失败。"><template #action><Button size="small" @click="reload">重试</Button></template></Alert>
    <Alert v-if="editable && stillInMonth" type="info" show-icon message="本月领退记录持续更新，月底可确认月盘点。" />
    <Select
      v-if="showAddLine"
      :options="addOptions"
      aria-label="添加现场原料"
      class="w-full sm:w-72"
      placeholder="选择现场已有原料"
      option-filter-prop="label"
      show-search
      @change="(value) => appendLine(Number(value))"
    />
    <Table :columns="columns" :data-source="rows" :loading="loading" :pagination="false" :scroll="{ x: 970 }" row-key="itemId" size="middle">
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'opening'">
          <QuantityInput v-if="editable && record.previousQuantity == null" v-model="record.opening" :label="`${record.materialName}月初数量`" :package-weight="packageWeight(record.itemId)" />
          <span v-else>{{ formatKilograms(record.opening) }}</span>
        </template>
        <span v-else-if="column.key === 'issued'">{{ formatKilograms(record.issuedQuantity) }}</span>
        <span v-else-if="column.key === 'returned'">{{ formatKilograms(record.returnedQuantity) }}</span>
        <template v-else-if="column.key === 'counted'">
          <QuantityInput v-if="editable" v-model="record.counted" :label="`${record.materialName}月末实盘数量`" :package-weight="packageWeight(record.itemId)" />
          <span v-else>{{ formatKilograms(record.counted) }}</span>
        </template>
        <b v-else-if="column.key === 'used'" :class="(draftUsed(record as CountLine) ?? 0) < 0 ? 'text-red-600' : 'text-foreground'">{{ formatKilograms(draftUsed(record as CountLine)) }}</b>
      </template>
    </Table>
  </div>
</template>
