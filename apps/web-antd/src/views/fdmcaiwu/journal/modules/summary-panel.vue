<script setup lang="ts">
import type { FdmcaiwuJournalApi as Api } from '#/api/fdmcaiwu/journal';

import { computed, onMounted, ref, watch } from 'vue';

import { IconifyIcon } from '@vben/icons';
import { downloadFileFromBlobPart } from '@vben/utils';

import {
  Button,
  DatePicker,
  Segmented,
  Select,
  Space,
  Table,
} from 'ant-design-vue';
import dayjs from 'dayjs';

import {
  exportJournalSummaryExcel,
  getJournalSummary,
} from '#/api/fdmcaiwu/journal';

import {
  DIMENSION_OPTIONS,
  formatMoney,
  monthRowSpans,
  sumBy,
} from '../model';

/**
 * 按月份 × 收付款行 / 经手人 / 部门 / 类别 / 公司汇总收入、支出和净额，
 * 代替 Excel 里「月份+行 / 月份+业务员 / 月份+部门」辅助列加透视表的做法。
 */
defineProps<{ companyNames: string[] }>();

const dimension = ref<Api.Dimension>('BANK');
const range = ref<[string, string]>([
  `${dayjs().year()}-01`,
  dayjs().format('YYYY-MM'),
]);
const companyName = ref<string>();
const rows = ref<Api.SummaryRow[]>([]);
const loading = ref(false);
const exporting = ref(false);

function params(): Api.SummaryReq {
  return {
    companyName: companyName.value || undefined,
    dimension: dimension.value,
    monthFrom: range.value?.[0],
    monthTo: range.value?.[1],
  };
}

async function load() {
  loading.value = true;
  try {
    rows.value = await getJournalSummary(params());
  } finally {
    loading.value = false;
  }
}
defineExpose({ reload: load });
watch([dimension, range, companyName], load);
onMounted(load);

async function exportExcel() {
  exporting.value = true;
  try {
    const data = await exportJournalSummaryExcel(params());
    downloadFileFromBlobPart({
      fileName: `日记账汇总-${dayjs().format('YYYYMMDD')}.xlsx`,
      source: data,
    });
  } finally {
    exporting.value = false;
  }
}

const dimensionLabel = computed(
  () => DIMENSION_OPTIONS.find((item) => item.value === dimension.value)?.label.slice(1) ?? '',
);
const spans = computed(() => monthRowSpans(rows.value));
const columns = computed(() => [
  {
    customCell: (_: Api.SummaryRow, index?: number) => ({ rowSpan: spans.value[index ?? 0] }),
    dataIndex: 'month',
    key: 'month',
    title: '月份',
    width: 100,
  },
  { dataIndex: 'name', ellipsis: true, key: 'name', title: dimensionLabel.value },
  { align: 'right' as const, dataIndex: 'incomeRmb', key: 'incomeRmb', title: '收入（折人民币）', width: 160 },
  { align: 'right' as const, dataIndex: 'expenseRmb', key: 'expenseRmb', title: '支出（折人民币）', width: 160 },
  { align: 'right' as const, dataIndex: 'netRmb', key: 'netRmb', title: '净额', width: 160 },
  { align: 'right' as const, key: 'count', title: '笔数（收/支）', width: 120 },
]);

const totalIncome = computed(() => sumBy(rows.value, (row) => row.incomeRmb));
const totalExpense = computed(() => sumBy(rows.value, (row) => row.expenseRmb));
</script>

<template>
  <div>
    <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
      <Space wrap>
        <Segmented v-model:value="dimension" :options="DIMENSION_OPTIONS" />
        <DatePicker.RangePicker
          v-model:value="range"
          picker="month"
          value-format="YYYY-MM"
          :allow-clear="false"
          class="w-60"
        />
        <Select
          v-model:value="companyName"
          :options="companyNames.map((value) => ({ label: value, value }))"
          allow-clear
          show-search
          class="w-48"
          placeholder="全部公司"
        />
      </Space>
      <Button v-access:code="['fdmcaiwu:journal:export']" :loading="exporting" @click="exportExcel">
        <template #icon><IconifyIcon icon="lucide:file-down" /></template>
        导出汇总
      </Button>
    </div>
    <Table
      bordered
      size="small"
      :columns="columns"
      :data-source="rows"
      :loading="loading"
      :pagination="false"
      :row-key="(row: Api.SummaryRow) => `${row.month}-${row.name}`"
      :scroll="{ y: 'calc(100vh - 360px)' }"
    >
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'month'">
          <span class="font-medium">{{ record.month }}</span>
        </template>
        <template v-else-if="column.key === 'name'">
          <span :class="record.name === '未填' ? 'text-muted-foreground' : ''">{{ record.name }}</span>
        </template>
        <template v-else-if="column.key === 'incomeRmb'">
          <span class="summary-num is-income">{{ Number(record.incomeRmb) ? formatMoney(record.incomeRmb) : '' }}</span>
        </template>
        <template v-else-if="column.key === 'expenseRmb'">
          <span class="summary-num is-expense">{{ Number(record.expenseRmb) ? formatMoney(record.expenseRmb) : '' }}</span>
        </template>
        <template v-else-if="column.key === 'netRmb'">
          <span class="summary-num font-medium" :class="Number(record.netRmb) < 0 ? 'is-expense' : ''">
            {{ formatMoney(record.netRmb) }}
          </span>
        </template>
        <template v-else-if="column.key === 'count'">
          <span class="summary-num text-muted-foreground">{{ record.incomeCount }} / {{ record.expenseCount }}</span>
        </template>
      </template>
      <template #summary>
        <Table.Summary fixed>
          <Table.Summary.Row>
            <Table.Summary.Cell :index="0" :col-span="2">
              <span class="font-medium">合计</span>
            </Table.Summary.Cell>
            <Table.Summary.Cell :index="2" align="right">
              <span class="summary-num font-medium is-income">{{ formatMoney(totalIncome) }}</span>
            </Table.Summary.Cell>
            <Table.Summary.Cell :index="3" align="right">
              <span class="summary-num font-medium is-expense">{{ formatMoney(totalExpense) }}</span>
            </Table.Summary.Cell>
            <Table.Summary.Cell :index="4" align="right">
              <span class="summary-num font-medium">{{ formatMoney(totalIncome - totalExpense) }}</span>
            </Table.Summary.Cell>
            <Table.Summary.Cell :index="5" />
          </Table.Summary.Row>
        </Table.Summary>
      </template>
    </Table>
  </div>
</template>

<style scoped>
.summary-num {
  font-variant-numeric: tabular-nums;
}

.is-income {
  color: var(--ant-color-success, #389e0d);
}

.is-expense {
  color: var(--ant-color-error, #cf1322);
}
</style>
