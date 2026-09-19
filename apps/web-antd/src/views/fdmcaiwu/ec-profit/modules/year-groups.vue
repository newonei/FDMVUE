<script setup lang="ts">
import type { TableColumnsType } from 'ant-design-vue';
import type { FdmcaiwuEcProfitApi as Api } from '#/api/fdmcaiwu/ec-profit';
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import {
  Alert,
  Button,
  DatePicker,
  Empty,
  Select,
  Table,
  Tag,
  Tooltip,
} from 'ant-design-vue';
import { getEcProfitYearGroups } from '#/api/fdmcaiwu/ec-profit';
import { formatMetric } from '../model';
import {
  ALL_METRICS,
  isRateMetric,
  nodeMetric,
  nodeState,
  yearCell,
} from '../tree-model';

const props = defineProps<{ defaultYear: number }>();
const emit = defineEmits<{ locate: [value: { month: string; key: string }] }>();
const year = ref(String(props.defaultYear));
const metric = ref<keyof Api.Metric>('grossProfit');
const department = ref<string>();
const result = ref<Api.YearGroups>();
const loading = ref(false);
const error = ref('');
let sequence = 0;
const metricOptions = ALL_METRICS.map((item) => ({
  label: item.label,
  value: item.key,
}));
const months = computed(
  () =>
    result.value?.months ??
    Array.from(
      { length: 12 },
      (_, i) => `${year.value}-${String(i + 1).padStart(2, '0')}`,
    ),
);
const departmentOptions = computed(() =>
  [
    ...new Set(
      (result.value?.groups ?? []).map(
        (row) => row.departmentName || '未分配部门',
      ),
    ),
  ].map((name) => ({ label: name, value: name })),
);
const rows = computed(() =>
  (result.value?.groups ?? []).filter(
    (row) =>
      !department.value ||
      (row.departmentName || '未分配部门') === department.value,
  ),
);
const columns = computed<TableColumnsType<Api.YearGroup>>(() => [
  { key: 'name', title: '部门 / 财务小组', fixed: 'left', width: 245 },
  ...months.value.map((month) => ({
    key: month,
    title: `${Number(month.slice(5))}月`,
    width: 140,
    align: 'right' as const,
  })),
  {
    key: 'total',
    title: '已就绪月份合计',
    width: 180,
    align: 'right',
    fixed: 'right',
  },
]);
async function load() {
  const current = ++sequence;
  loading.value = true;
  error.value = '';
  result.value = undefined;
  try {
    const data = await getEcProfitYearGroups(Number(year.value));
    if (current === sequence) result.value = data;
  } catch {
    if (current === sequence) error.value = '年度小组数据加载失败，请重试。';
  } finally {
    if (current === sequence) loading.value = false;
  }
}
watch(
  year,
  () => {
    department.value = undefined;
    void load();
  },
  { immediate: true },
);
onBeforeUnmount(() => sequence++);
function cell(row: Api.YearGroup, month: string) {
  return yearCell(row, month);
}
function cellLabel(row: Api.YearGroup, month: string) {
  const data = cell(row, month);
  if (!data || data.reportStatus === 'NOT_CREATED') return '未建单';
  if (!data.node) return '本月无此组';
  return nodeState(data.node);
}
</script>

<template>
  <div class="space-y-4 rounded-xl border border-border bg-card p-5">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div class="flex flex-wrap gap-2">
        <DatePicker
          v-model:value="year"
          picker="year"
          format="YYYY 年"
          value-format="YYYY"
          :allow-clear="false"
          aria-label="对比年度"
        /><Select
          v-model:value="metric"
          :options="metricOptions"
          class="w-52"
          aria-label="对比指标"
        /><Select
          v-model:value="department"
          :options="departmentOptions"
          placeholder="全部部门"
          allow-clear
          class="w-40"
        />
      </div>
      <Button :loading="loading" @click="load">刷新</Button>
    </div>
    <Alert v-if="error" type="error" :message="error" show-icon />
    <p class="mb-0 text-xs text-muted-foreground">
      按当月归属快照对比；点击月份进入对应小组。右侧仅汇总月报已就绪且该组完整的月份，比例按金额重新计算。
    </p>
    <Table
      :columns="columns"
      :data-source="rows"
      :loading="loading"
      :pagination="false"
      :scroll="{ x: 2105, y: 660 }"
      row-key="key"
      size="small"
      bordered
    >
      <template #bodyCell="{ column, record }">
        <div v-if="column.key === 'name'">
          <div class="text-xs text-muted-foreground">
            {{ record.departmentName || '未分配部门' }}
          </div>
          <strong>{{ record.name }}</strong
          ><Tag v-if="record.legacyGroup" class="ml-2">历史归属</Tag>
        </div>
        <div v-else-if="column.key === 'total'">
          <strong class="tabular-nums">{{
            formatMetric(record.summary?.[metric], isRateMetric(metric))
          }}</strong
          ><Tooltip
            :title="
              record.includedMonths.join('、') || '尚无满足汇总条件的月份'
            "
            ><div class="mt-1 text-xs text-muted-foreground">
              纳入 {{ record.includedMonths.length }} 个月
            </div></Tooltip
          >
        </div>
        <div v-else>
          <Button
            v-if="
              cell(record as Api.YearGroup, String(column.key))?.reportId &&
              cell(record as Api.YearGroup, String(column.key))?.node
            "
            size="small"
            type="link"
            class="!px-0 tabular-nums"
            @click="
              emit('locate', { month: String(column.key), key: record.key })
            "
            >{{
              nodeMetric(
                cell(record as Api.YearGroup, String(column.key))!.node!,
                metric,
              )
            }}</Button
          >
          <span v-else>—</span>
          <div class="mt-1 text-xs text-muted-foreground">
            {{ cellLabel(record as Api.YearGroup, String(column.key)) }}
          </div>
        </div>
      </template>
      <template #emptyText
        ><Empty
          :image="Empty.PRESENTED_IMAGE_SIMPLE"
          :description="error ? '数据暂不可用' : '本年度暂无小组月报数据'"
      /></template>
    </Table>
  </div>
</template>
