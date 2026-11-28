<script setup lang="ts">
import type { CostMetric } from './analytics-model';

import type {
  PayrollAmountField,
  PayrollMonthlyAnalytics,
} from '#/api/fdmplatform/payroll';

import { computed } from 'vue';

import {
  amount,
  annualAnalytics,
  average,
  costMetrics,
  reportPeriod,
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

const employeeIncomeGroups = [
  { title: '底薪', color: '#91a8cc', keys: ['base'] },
  { title: '提成', color: '#ddca70', keys: ['commission'] },
  { title: '奖金', color: '#a0c383', keys: ['bonus'] },
  { title: '公司社保', color: '#dfc4a8', keys: ['employerSocial'] },
  { title: '公司公积金', color: '#b8ada3', keys: ['employerFund'] },
] as const satisfies ReadonlyArray<{
  color: string;
  keys: readonly PayrollAmountField[];
  title: string;
}>;

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
const compositionYears = computed(() =>
  range.value.years.map((year) => annual.value.get(year)),
);

function compositionSeries(monthlyAverage: boolean) {
  const groups = props.individual ? employeeIncomeGroups : incomeGroups;
  return groups.map(({ title, color, keys }) => ({
    color,
    name: title,
    values: compositionYears.value.map((row) => {
      if (!row) return null;
      const total = keys.reduce((sum, key) => sum + (row.income[key] ?? 0), 0);
      return monthlyAverage
        ? average(total, props.individual ? row.months : row.people)
        : total;
    }),
  }));
}

function preTaxTooltipTotal(monthlyAverage: boolean) {
  if (!props.individual) return undefined;
  return {
    name: '税前应发（扣除公司缴费）',
    values: compositionYears.value.map((row) => {
      if (!row) return null;
      const total = amount(row, 'cashGross');
      return monthlyAverage ? average(total, row.months) : total;
    }),
  };
}

const compositionAverage = computed(() => compositionSeries(true));
const compositionTotal = computed(() => compositionSeries(false));
const preTaxAverage = computed(() => preTaxTooltipTotal(true));
const preTaxAnnual = computed(() => preTaxTooltipTotal(false));
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
      :columns="yearLabels"
      :description="
        individual
          ? '各年合计 ÷ 所选范围内实际有工资记录的月数'
          : '按年度核算人月计算人均月度构成'
      "
      :series="compositionAverage"
      :stacked="!individual"
      :title="individual ? '月度平均薪资构成（税前）' : '年度平均薪资构成'"
      :tooltip-total="preTaxAverage"
      :type="individual ? 'grouped-bar' : 'bar'"
    />
    <PayrollChartCard
      :columns="yearLabels"
      :description="
        individual
          ? '按年汇总所选范围内的工资记录'
          : '汇总所选范围内的已记录项目，单位缴费单列'
      "
      :large-amounts="!individual"
      :series="compositionTotal"
      :stacked="!individual"
      :title="individual ? '年度薪资构成（税前）' : '年度薪资构成'"
      :tooltip-total="preTaxAnnual"
      :type="individual ? 'grouped-bar' : 'bar'"
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
