<script setup lang="ts">
import type { CostMetric } from './analytics-model';

import type { PayrollMonthlyAnalytics } from '#/api/fdmplatform/payroll';

import { computed } from 'vue';

import {
  amount,
  annualAnalytics,
  average,
  costMetrics,
  reportPeriod,
  summarize,
} from './analytics-model';
import { incomeGroups } from './model';
import PayrollChartCard from './PayrollChartCard.vue';

const props = defineProps<{
  endMonth: string;
  individual: boolean;
  metric: CostMetric;
  mode: 'composition' | 'trends';
  rows: PayrollMonthlyAnalytics[];
  startMonth: string;
}>();

const range = computed(() => reportPeriod(props.startMonth, props.endMonth));
const annual = computed(
  () => new Map(annualAnalytics(props.rows).map((row) => [row.year, row])),
);
const monthly = computed(
  () => new Map(props.rows.map((row) => [row.month, row])),
);
const monthsOfYear = computed(() =>
  range.value.comparisonMonths.map(({ label }) => label),
);
const yearLabels = computed(() => range.value.years.map((year) => `${year}年`));
const trendFields = computed<Array<{ key: CostMetric; name: string }>>(() =>
  props.individual
    ? [
        { key: 'gross', name: '应发' },
        { key: 'net', name: '实发' },
      ]
    : [{ key: props.metric, name: costMetrics[props.metric] }],
);
const yearAverageSeries = computed(() =>
  trendFields.value.map(({ key, name }) => ({
    name,
    values: range.value.years.map((year) => {
      const row = annual.value.get(year);
      return row
        ? average(amount(row, key), props.individual ? row.months : row.people)
        : null;
    }),
  })),
);
const yearTotalSeries = computed(() =>
  trendFields.value.map(({ key, name }) => ({
    name,
    values: range.value.years.map((year) => {
      const row = annual.value.get(year);
      return row ? amount(row, key) : null;
    }),
  })),
);
const timeSeries = computed(() =>
  trendFields.value.map(({ key, name }) => ({
    name,
    values: range.value.months.map((month) => {
      const row = monthly.value.get(month);
      return row ? amount(row, key) : null;
    }),
  })),
);
const monthCompare = computed(() =>
  range.value.years.map((year) => ({
    name: `${year}年`,
    values: range.value.comparisonMonths.map(({ key }) => {
      const row = monthly.value.get(`${year}-${key}`);
      return row
        ? amount(row, props.individual ? 'gross' : props.metric)
        : null;
    }),
  })),
);
const compositionAverage = computed(() => {
  const buckets = props.individual
    ? range.value.comparisonMonths.map(({ key }) =>
        summarize(props.rows.filter(({ month }) => month.endsWith(`-${key}`))),
      )
    : range.value.years.map((year) => annual.value.get(year));
  return incomeGroups.map(({ title, color, keys }) => ({
    color,
    name: title,
    values: buckets.map((row) =>
      row
        ? average(
            keys.reduce((sum, key) => sum + (row.income[key] ?? 0), 0),
            props.individual ? row.months : row.people,
          )
        : null,
    ),
  }));
});
const compositionTotal = computed(() =>
  incomeGroups.map(({ title, color, keys }) => ({
    color,
    name: title,
    values: range.value.years.map((year) => {
      const row = annual.value.get(year);
      return row
        ? keys.reduce((sum, key) => sum + (row.income[key] ?? 0), 0)
        : null;
    }),
  })),
);
</script>

<template>
  <div v-if="mode === 'trends'" class="analysis-charts analysis-trends">
    <PayrollChartCard
      :columns="yearLabels"
      :description="
        individual
          ? '范围内各年合计 ÷ 实际有工资记录的月数'
          : '范围内各年金额 ÷ 核算人月数'
      "
      :series="yearAverageSeries"
      :title="individual ? '年度月均薪资趋势' : '年度人均月薪趋势'"
    />
    <PayrollChartCard
      :columns="monthsOfYear"
      :description="
        individual ? '按年对比同一月份的应发薪资' : '按年对比同一月份的金额'
      "
      :large-amounts="!individual"
      :series="monthCompare"
      :title="individual ? '年度各月薪资对比' : '年度各月工资对比'"
    />
    <PayrollChartCard
      :columns="range.months"
      description="按年月连续排列，缺少工资记录的月份留空"
      :large-amounts="!individual"
      :series="timeSeries"
      :title="individual ? '月度薪资趋势' : '月度工资趋势'"
    />
    <PayrollChartCard
      :columns="yearLabels"
      description="只汇总所选范围内有工资记录的月份"
      :large-amounts="!individual"
      :series="yearTotalSeries"
      :title="individual ? '年总薪资趋势' : '年总工资趋势'"
      type="bar"
    />
  </div>
  <div v-else class="analysis-charts">
    <PayrollChartCard
      :columns="individual ? monthsOfYear : yearLabels"
      :description="
        individual
          ? '对所选范围内的同一月份取平均'
          : '按年度核算人月计算人均月度构成'
      "
      :series="compositionAverage"
      :title="individual ? '月度平均薪资构成' : '年度平均薪资构成'"
      stacked
      type="bar"
    />
    <PayrollChartCard
      :columns="yearLabels"
      description="汇总所选范围内的已记录项目，单位缴费单列"
      :large-amounts="!individual"
      :series="compositionTotal"
      title="年度薪资构成"
      stacked
      type="bar"
    />
  </div>
</template>

<style scoped>
.analysis-charts {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 390px), 1fr));
  gap: 14px;
}

.analysis-trends {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

@media (width <= 1100px) {
  .analysis-trends {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
