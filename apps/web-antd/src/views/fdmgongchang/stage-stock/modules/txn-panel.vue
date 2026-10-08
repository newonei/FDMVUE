<script setup lang="ts">
import type { TablePaginationConfig } from 'ant-design-vue';

import type { FdmgongchangStageStockApi as Api } from '#/api/fdmgongchang/stage-stock';

import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue';

import { formatDateTime } from '@vben/utils';

import { Button, Input, Select, Table, Tag } from 'ant-design-vue';

import { getTxnPage } from '#/api/fdmgongchang/stage-stock';

import { formatQty, toNumber, TXN_TYPE_LABELS } from '../model';

/** 库存流水：每一笔变动都能追溯到工序单、入库单或盘点单。 */
const props = defineProps<{ options: Api.Options; refreshKey: number }>();
const itemCode = defineModel<string>('itemCode', { default: '' });

const filters = reactive({
  keyword: '',
  stage: undefined as string | undefined,
  txnType: undefined as string | undefined,
});
const pageNo = ref(1);
const pageSize = ref(20);
const rows = ref<Api.Txn[]>([]);
const total = ref(0);
const loading = ref(false);

const stageOf = (code?: string) =>
  props.options.stages.find((s) => s.code === code);
const stageOptions = computed(() =>
  props.options.stages.map((s) => ({ label: s.label, value: s.code })),
);
const typeOptions = Object.entries(TXN_TYPE_LABELS).map(([value, label]) => ({
  label,
  value,
}));
const typeColor: Record<string, string> = {
  COMPLETE: 'green',
  ISSUE: 'red',
  OPENING: 'blue',
  SHIP: 'purple',
  RAW_RECEIPT: 'green',
  STOCKTAKE: 'default',
};

async function load() {
  loading.value = true;
  try {
    const page = await getTxnPage({
      itemCode: itemCode.value || undefined,
      keyword: filters.keyword.trim() || undefined,
      pageNo: pageNo.value,
      pageSize: pageSize.value,
      stage: filters.stage,
      txnType: filters.txnType,
    });
    rows.value = page.list;
    total.value = page.total;
  } finally {
    loading.value = false;
  }
}

let timer: ReturnType<typeof setTimeout> | undefined;
watch(
  () => [
    props.refreshKey,
    itemCode.value,
    filters.keyword,
    filters.stage,
    filters.txnType,
  ],
  () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      pageNo.value = 1;
      load();
    }, 200);
  },
  { immediate: true },
);
onBeforeUnmount(() => clearTimeout(timer));

function onTableChange(pagination: TablePaginationConfig) {
  pageNo.value = pagination.current ?? 1;
  pageSize.value = pagination.pageSize ?? 20;
  load();
}

const columns = [
  { key: 'occurredAt', title: '时间' },
  { key: 'doc', title: '单据' },
  { key: 'item', title: '物料 / 批次' },
  { align: 'right' as const, key: 'quantity', title: '变动' },
  { align: 'right' as const, key: 'balance', title: '结存' },
  { key: 'operator', title: '操作人' },
];
</script>

<template>
  <div class="flex flex-col gap-3">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <div class="flex flex-wrap items-center gap-2">
        <h2 class="m-0 text-base font-semibold">库存流水</h2>
        <template v-if="itemCode">
          <Tag color="blue" class="font-mono">{{ itemCode }}</Tag>
          <Button size="small" type="link" @click="itemCode = ''">
            清除编码筛选
          </Button>
        </template>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <Select
          id="txn-filter-stage"
          v-model:value="filters.stage"
          :options="stageOptions"
          allow-clear
          class="w-32"
          placeholder="全部阶段"
          size="small"
        />
        <Select
          id="txn-filter-type"
          v-model:value="filters.txnType"
          :options="typeOptions"
          allow-clear
          class="w-28"
          placeholder="全部类型"
          size="small"
        />
        <Input
          id="txn-filter-keyword"
          v-model:value="filters.keyword"
          allow-clear
          class="w-48"
          placeholder="单号或批次"
          size="small"
        />
      </div>
    </div>
    <Table
      :columns="columns"
      :data-source="rows"
      :loading="loading"
      :pagination="{
        current: pageNo,
        pageSize,
        total,
        showSizeChanger: true,
        showTotal: (t: number) => `共 ${t} 笔`,
      }"
      :scroll="{ x: 'max-content' }"
      row-key="id"
      size="small"
      @change="onTableChange"
    >
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'occurredAt'">
          <span class="whitespace-nowrap text-xs text-muted-foreground">
            {{ formatDateTime(record.occurredAt) }}
          </span>
        </template>
        <template v-else-if="column.key === 'doc'">
          <div class="flex flex-col items-start gap-0.5">
            <Tag :color="typeColor[record.txnType]" class="m-0">
              {{ TXN_TYPE_LABELS[record.txnType] ?? record.txnType }}
            </Tag>
            <span class="font-mono text-xs">{{ record.docNo }}</span>
          </div>
        </template>
        <template v-else-if="column.key === 'item'">
          <div class="flex min-w-[180px] flex-col">
            <span class="text-xs">
              <span class="text-muted-foreground">{{ stageOf(record.stage)?.label }}</span>
              <span class="ml-1 font-mono">{{ record.itemCode }}</span>
            </span>
            <span class="text-xs text-muted-foreground">
              批次 <span class="font-mono">{{ record.batchNo }}</span> · {{ record.location }}
            </span>
          </div>
        </template>
        <template v-else-if="column.key === 'quantity'">
          <b
            class="whitespace-nowrap tabular-nums"
            :class="(toNumber(record.quantity) ?? 0) < 0 ? 'text-destructive' : 'text-success'"
          >
            {{ (toNumber(record.quantity) ?? 0) > 0 ? '+' : '' }}{{ formatQty(record.quantity) }}
          </b>
        </template>
        <template v-else-if="column.key === 'balance'">
          <span class="whitespace-nowrap tabular-nums">
            {{ formatQty(record.balanceAfter) }}
            <small class="text-xs text-muted-foreground">
              {{ stageOf(record.stage)?.unit }}
            </small>
          </span>
        </template>
        <template v-else-if="column.key === 'operator'">
          <span class="whitespace-nowrap text-xs">{{ record.operatorName || '—' }}</span>
        </template>
      </template>
    </Table>
  </div>
</template>
