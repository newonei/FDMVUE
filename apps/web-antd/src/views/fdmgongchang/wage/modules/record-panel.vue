<script setup lang="ts">
import type { TablePaginationConfig } from 'ant-design-vue';
import type { TableRowSelection } from 'ant-design-vue/es/table/interface';

import type { FdmgongchangFactoryApi } from '#/api/fdmgongchang/factory';
import type { FdmgongchangWageApi as Api } from '#/api/fdmgongchang/wage';

import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';

import { useAccess } from '@vben/access';

import { Button, Input, message, Select, Table, Tag } from 'ant-design-vue';

import { getWorkerList } from '#/api/fdmgongchang/factory';
import {
  confirmWorkRecords,
  deleteWorkRecords,
  getWorkRecordItems,
  getWorkRecordPage,
  unconfirmWorkRecords,
} from '#/api/fdmgongchang/wage';

import {
  CATEGORY_COLORS,
  CATEGORY_LABELS,
  formatDateValue,
  formatMoney,
  RECORD_STATUS,
  SHIFT_LABELS,
} from '../../shared/wage';
import RecordModal from './record-modal.vue';

/** 报工登记：手动登记计时、杂活、补助；工序单带出的计件也在这里确认。 */
const props = defineProps<{ month: string; refreshKey: number }>();
const emit = defineEmits<{ changed: [] }>();

const { hasAccessByCodes } = useAccess();
const canCreate = computed(() => hasAccessByCodes(['fdmgongchang:work-record:create']));
const canConfirm = computed(() => hasAccessByCodes(['fdmgongchang:work-record:confirm']));

const rows = ref<Api.WorkRecord[]>([]);
const total = ref(0);
const loading = ref(false);
const pageNo = ref(1);
const pageSize = ref(50);
const selectedKeys = ref<number[]>([]);
const filters = reactive({
  category: undefined as Api.Category | undefined,
  keyword: '',
  status: undefined as Api.RecordStatus | undefined,
});
const items = ref<Api.Item[]>([]);
const people = ref<FdmgongchangFactoryApi.Worker[]>([]);
const modalOpen = ref(false);

async function load() {
  loading.value = true;
  try {
    const page = await getWorkRecordPage({
      category: filters.category,
      keyword: filters.keyword.trim() || undefined,
      month: props.month,
      pageNo: pageNo.value,
      pageSize: pageSize.value,
      status: filters.status,
    });
    rows.value = page.list;
    total.value = page.total;
    selectedKeys.value = selectedKeys.value.filter((id) => page.list.some((r) => r.id === id));
  } finally {
    loading.value = false;
  }
}

async function openModal() {
  if (items.value.length === 0 || people.value.length === 0) {
    const [list, workers] = await Promise.all([getWorkRecordItems(), getWorkerList({})]);
    items.value = list;
    people.value = workers.filter((w) => w.status !== 1);
  }
  modalOpen.value = true;
}

onMounted(load);
watch(
  () => [props.month, props.refreshKey],
  () => {
    pageNo.value = 1;
    load();
  },
);
let timer: ReturnType<typeof setTimeout> | undefined;
watch(
  () => [filters.category, filters.status, filters.keyword],
  () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      pageNo.value = 1;
      load();
    }, 300);
  },
);
onBeforeUnmount(() => clearTimeout(timer));

const selectedRows = computed(() => rows.value.filter((r) => selectedKeys.value.includes(r.id)));
const rowSelection = computed<TableRowSelection<Api.WorkRecord>>(() => ({
  getCheckboxProps: (r) => ({ disabled: r.status === 'SETTLED' }),
  onChange: (keys) => (selectedKeys.value = keys as number[]),
  selectedRowKeys: selectedKeys.value,
}));

async function run(action: 'confirm' | 'delete' | 'unconfirm') {
  const ids = selectedKeys.value;
  if (ids.length === 0) return;
  if (action === 'confirm') message.success(`已确认 ${await confirmWorkRecords(ids)} 条`);
  else if (action === 'unconfirm') message.success(`已取消确认 ${await unconfirmWorkRecords(ids)} 条`);
  else {
    await deleteWorkRecords(ids);
    message.success(`已删除 ${ids.length} 条`);
  }
  selectedKeys.value = [];
  await load();
  emit('changed');
}

async function onSaved(text: string) {
  message.success(text);
  await load();
  emit('changed');
}

function onTableChange(p: TablePaginationConfig) {
  pageNo.value = p.current ?? 1;
  pageSize.value = p.pageSize ?? 50;
  load();
}

const columns = [
  { key: 'date', title: '日期 / 班次' },
  { key: 'person', title: '姓名 · 班组' },
  { key: 'item', title: '项目' },
  { align: 'right' as const, key: 'value', title: '数量 / 工时' },
  { align: 'right' as const, key: 'price', title: '单价' },
  { align: 'right' as const, key: 'amount', title: '金额（元）' },
  { key: 'source', title: '来源' },
  { key: 'status', title: '状态' },
];
const categoryOptions = (Object.keys(CATEGORY_LABELS) as Api.Category[]).map((c) => ({
  label: CATEGORY_LABELS[c],
  value: c,
}));
const statusOptions = (Object.keys(RECORD_STATUS) as Api.RecordStatus[]).map((s) => ({
  label: RECORD_STATUS[s].label,
  value: s,
}));
</script>

<template>
  <div class="flex flex-col gap-3">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <div class="flex flex-wrap items-center gap-2">
        <Select id="record-filter-category" v-model:value="filters.category" :options="categoryOptions" allow-clear class="w-28" placeholder="全部类别" size="small" />
        <Select id="record-filter-status" v-model:value="filters.status" :options="statusOptions" allow-clear class="w-28" placeholder="全部状态" size="small" />
        <Input id="record-filter-keyword" v-model:value="filters.keyword" allow-clear class="w-48" placeholder="姓名、项目或工序单号" size="small" />
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <template v-if="selectedKeys.length > 0">
          <span class="text-xs text-muted-foreground">已选 {{ selectedKeys.length }} 条</span>
          <Button v-if="canConfirm && selectedRows.some((r) => r.status === 'PENDING')" size="small" type="primary" @click="run('confirm')">确认</Button>
          <Button v-if="canConfirm && selectedRows.some((r) => r.status === 'CONFIRMED')" size="small" @click="run('unconfirm')">取消确认</Button>
          <Button v-if="canCreate && selectedRows.every((r) => r.status === 'PENDING')" danger size="small" @click="run('delete')">删除</Button>
        </template>
        <Button v-if="canCreate" size="small" type="primary" @click="openModal">＋ 登记报工</Button>
      </div>
    </div>
    <Table
      :columns="columns"
      :data-source="rows"
      :loading="loading"
      :pagination="{ current: pageNo, pageSize, total, showSizeChanger: true, showTotal: (t: number) => `共 ${t} 条` }"
      :row-selection="canConfirm || canCreate ? rowSelection : undefined"
      :scroll="{ x: 'max-content' }"
      row-key="id"
      size="small"
      @change="onTableChange"
    >
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'date'">
          <div class="flex flex-col">
            <span class="whitespace-nowrap">{{ formatDateValue(record.workDate) }}</span>
            <span class="text-xs text-muted-foreground">{{ SHIFT_LABELS[record.shift as Api.Shift] }}</span>
          </div>
        </template>
        <template v-else-if="column.key === 'person'">
          <span class="whitespace-nowrap">{{ [record.userName, record.team].filter(Boolean).join(' · ') }}</span>
        </template>
        <template v-else-if="column.key === 'item'">
          <Tag :color="CATEGORY_COLORS[record.category as Api.Category]" class="m-0 mr-1">
            {{ CATEGORY_LABELS[record.category as Api.Category] }}
          </Tag>
          <span>{{ record.itemName }}</span>
        </template>
        <template v-else-if="column.key === 'value'">
          <span class="whitespace-nowrap tabular-nums">
            {{ record.category === 'TIME' ? `${formatMoney(record.hours)} 小时` : `${formatMoney(record.quantity, 3)} ${record.unit ?? ''}` }}
          </span>
        </template>
        <template v-else-if="column.key === 'price'">
          <span class="tabular-nums">{{ formatMoney(record.unitPrice, 4) }}</span>
        </template>
        <template v-else-if="column.key === 'amount'">
          <b class="tabular-nums">{{ formatMoney(record.amount) }}</b>
        </template>
        <template v-else-if="column.key === 'source'">
          <span v-if="record.source === 'ORDER'" class="whitespace-nowrap text-xs">
            工序单 <span class="font-mono">{{ record.orderNo }}</span>
          </span>
          <span v-else class="whitespace-nowrap text-xs text-muted-foreground">
            手动 · {{ record.operatorName || '—' }}
          </span>
        </template>
        <template v-else-if="column.key === 'status'">
          <Tag :color="RECORD_STATUS[record.status as Api.RecordStatus].color" class="m-0">
            {{ RECORD_STATUS[record.status as Api.RecordStatus].label }}
          </Tag>
        </template>
      </template>
    </Table>
    <RecordModal v-model:open="modalOpen" :items="items" :people="people" @saved="onSaved" />
  </div>
</template>
