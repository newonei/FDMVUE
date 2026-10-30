<script setup lang="ts">
import type { TableColumnsType } from 'ant-design-vue';

import type { FdmcaiwuJournalApi as Api } from '#/api/fdmcaiwu/journal';
import type { MonthPreset } from '../model';

import { computed, onMounted, reactive, ref, watch } from 'vue';

import { useAccess } from '@vben/access';
import { IconifyIcon } from '@vben/icons';
import { downloadFileFromBlobPart } from '@vben/utils';

import {
  Button,
  DatePicker,
  Input,
  message,
  Modal,
  Popconfirm,
  Segmented,
  Select,
  Space,
  Table,
  Tag,
  Tooltip,
} from 'ant-design-vue';
import dayjs from 'dayjs';

import {
  deleteJournals,
  exportJournalExcel,
  getJournal,
  getJournalPage,
  getJournalTotals,
} from '#/api/fdmcaiwu/journal';

import {
  copyForm,
  DIRECTION_LABELS,
  formatMoney,
  INVOICE_STATUS_OPTIONS,
  invoiceStatusOption,
  labels,
  monthRange,
  sumBy,
  toSaveReq,
} from '../model';

/** 收入或支出的流水列表：上方筛选和合计，表格列与原 Excel 一致，双击一行编辑。 */
const props = defineProps<{
  companyNames: string[];
  direction: Api.Direction;
  options?: Api.Options;
}>();
const emit = defineEmits<{
  changed: [];
  edit: [data: Api.Direction | Api.SaveReq];
  import: [];
}>();

const { hasAccessByCodes } = useAccess();
const canUpdate = computed(() => hasAccessByCodes(['fdmcaiwu:journal:update']));
const canDelete = computed(() => hasAccessByCodes(['fdmcaiwu:journal:delete']));
/** 勾选列占一列，合计行要让出来 */
const lead = computed(() => (canDelete.value ? 1 : 0));

const text = computed(() => labels(props.direction));
const isExpense = computed(() => props.direction === 'EXPENSE');

const preset = ref<'custom' | MonthPreset>('thisMonth');
const customRange = ref<[string, string]>();
const filter = reactive({
  bankAccount: undefined as string | undefined,
  category: undefined as string | undefined,
  companyName: undefined as string | undefined,
  deptName: undefined as string | undefined,
  handlerName: undefined as string | undefined,
  invoiceStatus: undefined as Api.InvoiceStatus | undefined,
  keyword: '',
});
const page = reactive({ pageNo: 1, pageSize: 50 });
const loading = ref(false);
const exporting = ref(false);
const rows = ref<Api.Entry[]>([]);
const total = ref(0);
const totals = ref<Api.Totals>();
const pendingInvoice = ref<Api.Totals>();
const selectedIds = ref<number[]>([]);

const PRESETS = [
  { label: '本月', value: 'thisMonth' },
  { label: '上月', value: 'lastMonth' },
  { label: '今年', value: 'thisYear' },
  { label: '全部', value: 'all' },
  { label: '自定义', value: 'custom' },
];

function currentFilter(): Api.Filter {
  const range =
    preset.value === 'custom' ? customRange.value : monthRange(preset.value);
  return {
    bankAccount: filter.bankAccount || undefined,
    category: filter.category || undefined,
    companyName: filter.companyName || undefined,
    deptName: filter.deptName || undefined,
    direction: props.direction,
    handlerName: filter.handlerName || undefined,
    invoiceStatus: isExpense.value ? filter.invoiceStatus : undefined,
    keyword: filter.keyword.trim() || undefined,
    monthFrom: range?.[0],
    monthTo: range?.[1],
  };
}

async function load() {
  loading.value = true;
  const params = currentFilter();
  try {
    const [result, sum, pending] = await Promise.all([
      getJournalPage({ ...params, ...page }),
      getJournalTotals(params),
      isExpense.value && !params.invoiceStatus
        ? getJournalTotals({ ...params, invoiceStatus: 'PENDING' })
        : Promise.resolve(undefined),
    ]);
    rows.value = result.list ?? [];
    total.value = result.total ?? 0;
    totals.value = sum;
    pendingInvoice.value = pending;
    selectedIds.value = selectedIds.value.filter((id) =>
      rows.value.some((row) => row.id === id),
    );
  } finally {
    loading.value = false;
  }
}

function search() {
  page.pageNo = 1;
  load();
}
function resetFilter() {
  Object.assign(filter, {
    bankAccount: undefined,
    category: undefined,
    companyName: undefined,
    deptName: undefined,
    handlerName: undefined,
    invoiceStatus: undefined,
    keyword: '',
  });
  preset.value = 'thisMonth';
  search();
}
watch(preset, (value) => {
  if (value === 'custom' && !customRange.value) {
    const month = dayjs().format('YYYY-MM');
    customRange.value = [month, month];
  }
  search();
});
function onRangeChange() {
  if (preset.value === 'custom') search();
}
function showPendingInvoice() {
  filter.invoiceStatus = 'PENDING';
  search();
}

defineExpose({ reload: load });

async function edit(record: Api.Entry) {
  if (!canUpdate.value) return;
  emit('edit', toSaveReq(await getJournal(record.id)));
}
function copy(record: Api.Entry) {
  emit('edit', copyForm(record));
}
async function remove(ids: number[]) {
  await deleteJournals(ids);
  message.success(`已删除 ${ids.length} 笔`);
  selectedIds.value = [];
  emit('changed');
  await load();
}
function removeSelected() {
  const count = selectedIds.value.length;
  const amount = sumBy(
    rows.value.filter((row) => selectedIds.value.includes(row.id)),
    (row) => row.rmbAmount,
  );
  Modal.confirm({
    content: `共 ${count} 笔，折人民币 ¥${formatMoney(amount)}。删除后不能恢复。`,
    okText: '删除',
    okType: 'danger',
    onOk: () => remove([...selectedIds.value]),
    title: `删除选中的${DIRECTION_LABELS[props.direction]}记录？`,
  });
}

async function exportExcel() {
  exporting.value = true;
  try {
    const data = await exportJournalExcel(currentFilter());
    downloadFileFromBlobPart({
      fileName: `${DIRECTION_LABELS[props.direction]}日记账-${dayjs().format('YYYYMMDD')}.xlsx`,
      source: data,
    });
  } finally {
    exporting.value = false;
  }
}

function toOptions(values?: string[]) {
  return (values ?? []).map((value) => ({ label: value, value }));
}

const columns = computed<TableColumnsType<Api.Entry>>(() => {
  const base: TableColumnsType<Api.Entry> = [
    { dataIndex: 'entryDate', fixed: 'left', key: 'entryDate', title: '日期', width: 110 },
    { dataIndex: 'summary', ellipsis: true, key: 'summary', title: '摘要', width: 220 },
    { align: 'right', dataIndex: 'amount', key: 'amount', title: text.value.amount, width: 130 },
    { align: 'right', dataIndex: 'rmbAmount', key: 'rmbAmount', title: '折人民币', width: 130 },
    { dataIndex: 'companyName', ellipsis: true, key: 'companyName', title: '所属公司', width: 150 },
    { dataIndex: 'bankAccount', ellipsis: true, key: 'bankAccount', title: text.value.bank, width: 130 },
    { dataIndex: 'category', ellipsis: true, key: 'category', title: '类别', width: 100 },
    { dataIndex: 'deptName', ellipsis: true, key: 'deptName', title: '部门', width: 90 },
    { dataIndex: 'handlerName', ellipsis: true, key: 'handlerName', title: '经手人', width: 90 },
    { dataIndex: 'counterparty', ellipsis: true, key: 'counterparty', title: text.value.counterparty, width: 170 },
    { dataIndex: 'remark', ellipsis: true, key: 'remark', title: text.value.remark, width: 170 },
  ];
  if (isExpense.value) {
    base.push(
      { dataIndex: 'billType', key: 'billType', title: '票据类型', width: 90 },
      { align: 'center', dataIndex: 'invoiceStatus', key: 'invoiceStatus', title: '收到发票', width: 90 },
      { dataIndex: 'invoiceNo', ellipsis: true, key: 'invoiceNo', title: '发票号', width: 140 },
      { align: 'right', dataIndex: 'invoiceAmount', key: 'invoiceAmount', title: '发票金额', width: 120 },
      { dataIndex: 'paymentMethod', key: 'paymentMethod', title: '付款方式', width: 90 },
      { dataIndex: 'deliverer', key: 'deliverer', title: '送达人', width: 90 },
      { dataIndex: 'deliveredDate', key: 'deliveredDate', title: '送达日期', width: 110 },
    );
  }
  base.push({ fixed: 'right', key: 'action', title: '操作', width: 130 });
  return base;
});
const scrollX = computed(() =>
  columns.value.reduce((sum, column) => sum + Number(column.width ?? 100), 48),
);

const pageRmb = computed(() => sumBy(rows.value, (row) => row.rmbAmount));
const pageInvoice = computed(() => sumBy(rows.value, (row) => row.invoiceAmount));
const foreignTotals = computed(
  () => totals.value?.currencies.filter((item) => item.currency !== 'CNY') ?? [],
);
const rmbIndex = computed(() =>
  columns.value.findIndex((column) => column.key === 'rmbAmount'),
);
const invoiceIndex = computed(() =>
  columns.value.findIndex((column) => column.key === 'invoiceAmount'),
);

onMounted(load);
</script>

<template>
  <div>
    <div class="journal-filters">
      <Segmented v-model:value="preset" :options="PRESETS" />
      <DatePicker.RangePicker
        v-if="preset === 'custom'"
        v-model:value="customRange"
        picker="month"
        value-format="YYYY-MM"
        :allow-clear="false"
        class="w-60"
        @change="onRangeChange"
      />
      <Input
        v-model:value="filter.keyword"
        allow-clear
        :style="{ width: '260px' }"
        :placeholder="`摘要 / ${text.counterparty} / 备注${isExpense ? ' / 发票号' : ''}`"
        @press-enter="search"
      >
        <template #prefix><IconifyIcon icon="lucide:search" class="text-muted-foreground" /></template>
      </Input>
      <Select
        v-model:value="filter.companyName"
        :options="toOptions(companyNames)"
        allow-clear
        show-search
        class="w-44"
        placeholder="所属公司"
        @change="search"
      />
      <Select
        v-model:value="filter.bankAccount"
        :options="toOptions(options?.bankAccounts)"
        allow-clear
        show-search
        class="w-36"
        :placeholder="text.bank"
        @change="search"
      />
      <Select
        v-model:value="filter.category"
        :options="toOptions(options?.categories)"
        allow-clear
        show-search
        class="w-32"
        placeholder="类别"
        @change="search"
      />
      <Select
        v-model:value="filter.deptName"
        :options="toOptions(options?.deptNames)"
        allow-clear
        show-search
        class="w-28"
        placeholder="部门"
        @change="search"
      />
      <Select
        v-model:value="filter.handlerName"
        :options="toOptions(options?.handlerNames)"
        allow-clear
        show-search
        class="w-28"
        placeholder="经手人"
        @change="search"
      />
      <Select
        v-if="isExpense"
        v-model:value="filter.invoiceStatus"
        :options="INVOICE_STATUS_OPTIONS"
        allow-clear
        class="w-32"
        placeholder="收到发票"
        @change="search"
      />
      <Button :loading="loading" @click="search">查询</Button>
      <Button @click="resetFilter">重置</Button>
    </div>

    <div class="journal-toolbar">
      <div class="journal-stats">
        <div class="journal-stat">
          <span class="journal-stat-label">{{ DIRECTION_LABELS[direction] }}合计（折人民币）</span>
          <span class="journal-stat-value" :class="isExpense ? 'is-expense' : 'is-income'">
            ¥ {{ formatMoney(totals?.rmbAmount ?? 0) }}
          </span>
        </div>
        <div class="journal-stat">
          <span class="journal-stat-label">笔数</span>
          <span class="journal-stat-value">{{ totals?.count ?? 0 }}</span>
        </div>
        <div v-if="foreignTotals.length" class="journal-stat">
          <span class="journal-stat-label">外币原币</span>
          <span class="journal-stat-currencies">
            <Tag v-for="item in foreignTotals" :key="item.currency">
              {{ item.currency }} {{ formatMoney(item.amount) }}
            </Tag>
          </span>
        </div>
        <Tooltip v-if="pendingInvoice?.count" title="点击只看未收到发票的支出">
          <button type="button" class="journal-stat journal-stat-link" @click="showPendingInvoice">
            <span class="journal-stat-label">未收发票</span>
            <span class="journal-stat-value is-warning">
              {{ pendingInvoice.count }} 笔 · ¥ {{ formatMoney(pendingInvoice.rmbAmount) }}
            </span>
          </button>
        </Tooltip>
      </div>
      <Space wrap>
        <Button
          v-if="selectedIds.length"
          v-access:code="['fdmcaiwu:journal:delete']"
          danger
          @click="removeSelected"
        >
          删除选中（{{ selectedIds.length }}）
        </Button>
        <Button v-access:code="['fdmcaiwu:journal:import']" @click="emit('import')">
          <template #icon><IconifyIcon icon="lucide:file-up" /></template>
          导入 Excel
        </Button>
        <Button v-access:code="['fdmcaiwu:journal:export']" :loading="exporting" @click="exportExcel">
          <template #icon><IconifyIcon icon="lucide:file-down" /></template>
          导出
        </Button>
        <Button
          v-access:code="['fdmcaiwu:journal:create']"
          type="primary"
          @click="emit('edit', direction)"
        >
          <template #icon><IconifyIcon icon="lucide:plus" /></template>
          记一笔{{ DIRECTION_LABELS[direction] }}
        </Button>
      </Space>
    </div>

    <Table
      bordered
      size="small"
      row-key="id"
      :columns="columns"
      :data-source="rows"
      :loading="loading"
      :scroll="{ x: scrollX }"
      :row-selection="
        canDelete
          ? {
              selectedRowKeys: selectedIds,
              onChange: (keys: (number | string)[]) =>
                (selectedIds = keys.map(Number)),
            }
          : undefined
      "
      :custom-row="(record: Api.Entry) => ({ onDblclick: () => edit(record) })"
      :pagination="{
        current: page.pageNo,
        pageSize: page.pageSize,
        pageSizeOptions: ['20', '50', '100', '200'],
        showSizeChanger: true,
        showTotal: (count: number) => `共 ${count} 笔`,
        total,
      }"
      @change="
        (pagination: { current?: number; pageSize?: number }) => {
          page.pageNo = pagination.current ?? 1;
          page.pageSize = pagination.pageSize ?? 50;
          load();
        }
      "
    >
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'entryDate'">
          <span>{{ record.entryDate }}</span>
          <Tooltip
            v-if="record.entryMonth !== record.entryDate.slice(0, 7)"
            :title="`记入 ${record.entryMonth} 月份`"
          >
            <Tag color="purple" class="ml-1 mr-0">{{ Number(record.entryMonth.slice(5)) }}月</Tag>
          </Tooltip>
        </template>
        <template v-else-if="column.key === 'amount'">
          <span class="journal-num">{{ formatMoney(record.amount) }}</span>
          <Tag v-if="record.currency !== 'CNY'" class="ml-1 mr-0">{{ record.currency }}</Tag>
        </template>
        <template v-else-if="column.key === 'rmbAmount'">
          <Tooltip
            :title="record.currency !== 'CNY' && record.exchangeRate ? `汇率 ${record.exchangeRate}` : undefined"
          >
            <span class="journal-num" :class="isExpense ? 'is-expense' : 'is-income'">
              {{ formatMoney(record.rmbAmount) }}
            </span>
          </Tooltip>
        </template>
        <template v-else-if="column.key === 'invoiceAmount'">
          <span class="journal-num">{{ record.invoiceAmount == null ? '' : formatMoney(record.invoiceAmount) }}</span>
        </template>
        <template v-else-if="column.key === 'invoiceStatus'">
          <Tag
            v-if="invoiceStatusOption(record.invoiceStatus)"
            :color="invoiceStatusOption(record.invoiceStatus)?.color"
            class="mr-0"
          >
            {{ invoiceStatusOption(record.invoiceStatus)?.label }}
          </Tag>
        </template>
        <template v-else-if="column.key === 'action'">
          <Space :size="0">
            <Button v-access:code="['fdmcaiwu:journal:update']" size="small" type="link" @click="edit(record as Api.Entry)">
              编辑
            </Button>
            <Tooltip title="复制为今天的新记录">
              <Button v-access:code="['fdmcaiwu:journal:create']" size="small" type="link" @click="copy(record as Api.Entry)">
                复制
              </Button>
            </Tooltip>
            <Popconfirm title="删除这笔记录？" ok-text="删除" ok-type="danger" @confirm="remove([record.id])">
              <Button v-access:code="['fdmcaiwu:journal:delete']" danger size="small" type="link">删除</Button>
            </Popconfirm>
          </Space>
        </template>
      </template>
      <template #summary>
        <Table.Summary fixed>
          <Table.Summary.Row>
            <Table.Summary.Cell :index="0" :col-span="lead + rmbIndex">
              <span class="font-medium">本页合计</span>
            </Table.Summary.Cell>
            <Table.Summary.Cell :index="1" align="right">
              <span class="journal-num font-medium">{{ formatMoney(pageRmb) }}</span>
            </Table.Summary.Cell>
            <template v-if="isExpense">
              <Table.Summary.Cell :index="2" :col-span="invoiceIndex - rmbIndex - 1" />
              <Table.Summary.Cell :index="3" align="right">
                <span class="journal-num font-medium">{{ formatMoney(pageInvoice) }}</span>
              </Table.Summary.Cell>
              <Table.Summary.Cell :index="4" :col-span="columns.length - invoiceIndex - 1" />
            </template>
            <Table.Summary.Cell v-else :index="2" :col-span="columns.length - rmbIndex - 1" />
          </Table.Summary.Row>
        </Table.Summary>
      </template>
    </Table>
    <p class="mt-2 text-xs text-muted-foreground">
      双击一行可编辑。顶部合计按当前筛选的全部记录计算，不只本页。
    </p>
  </div>
</template>

<style scoped>
.journal-filters {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  margin-bottom: 12px;
}

.journal-toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.journal-stats {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.journal-stat {
  display: flex;
  flex-direction: column;
  min-width: 120px;
  padding: 6px 12px;
  text-align: left;
  background: var(--ant-color-fill-quaternary, #fafafa);
  border: 1px solid var(--ant-color-border-secondary, #f0f0f0);
  border-radius: 8px;
}

.journal-stat-link {
  cursor: pointer;
}

.journal-stat-link:hover {
  border-color: var(--ant-color-warning, #faad14);
}

.journal-stat-label {
  font-size: 12px;
  color: var(--ant-color-text-tertiary, #999);
}

.journal-stat-value {
  font-size: 16px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.journal-stat-currencies {
  padding-top: 2px;
}

.journal-num {
  font-variant-numeric: tabular-nums;
}

.is-income {
  color: var(--ant-color-success, #389e0d);
}

.is-expense {
  color: var(--ant-color-error, #cf1322);
}

.is-warning {
  color: var(--ant-color-warning, #d48806);
}
</style>
