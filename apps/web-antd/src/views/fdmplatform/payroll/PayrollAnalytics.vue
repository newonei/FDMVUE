<script setup lang="ts">
import type { AnalyticsView, CostMetric } from './analytics-model';

import type {
  PayrollEmployeeMatch,
  PayrollRow,
} from '#/api/fdmplatform/payroll';

import { computed, ref, shallowRef, watch } from 'vue';

import { RefreshCw, Search } from '@vben/icons';

import {
  getPayrollAnalyticsOptions,
  getPayrollDepartmentMonths,
  getPayrollEmployeeMonths,
  getPayrollMonthlyAnalytics,
  searchPayrollEmployees,
} from '#/api/fdmplatform/payroll';

import { errorText } from '../data';
import {
  amount,
  annualAnalytics,
  average,
  calendarMonths,
  costMetrics,
  departmentTotals,
  employeeAnalytics,
  employerContribution,
  monthChange,
  yearList,
  yearsWithMonths,
} from './analytics-model';
import { currency, monthLabel, monthOffset, payrollRegions } from './model';
import PayrollAnalysisCharts from './PayrollAnalysisCharts.vue';
import PayrollChartCard from './PayrollChartCard.vue';
import PayrollReportTable from './PayrollReportTable.vue';

const props = defineProps<{ reportMonth: string; view: AnalyticsView }>();
const emit = defineEmits<{ detail: [row: PayrollRow, month: string] }>();

const initialYear = Number(props.reportMonth.slice(0, 4));
const startYear = ref(initialYear);
const endYear = ref(initialYear);
const region = ref<null | string>(null);
const company = ref('');
const department = ref('');
const focusMonth = ref(props.reportMonth.slice(5));
const grouping = ref<'annual' | 'monthly'>('monthly');
const costMetric = ref<CostMetric>('cashGross');
const costPane = ref<'composition' | 'records' | 'trends'>('trends');
const employeePane = ref<'composition' | 'records' | 'trends'>('records');
const employee = shallowRef<PayrollEmployeeMatch>();
const employeeStart = ref(initialYear);
const employeeEnd = ref(initialYear);
const name = ref('');
const keyword = ref('');
const searchPage = ref(1);
const refresh = ref(0);

function useReportQuery<T>(source: () => (() => Promise<T>) | undefined) {
  const data = shallowRef<T>();
  const queryError = ref('');
  const loading = ref(false);
  const retryCount = ref(0);
  watch(
    [source, retryCount, refresh],
    async ([request], _, onCleanup) => {
      let current = true;
      onCleanup(() => {
        current = false;
      });
      queryError.value = '';
      data.value = undefined;
      loading.value = Boolean(request);
      if (!request) return;
      try {
        const result = await request();
        if (current) data.value = result;
      } catch (error) {
        if (current) queryError.value = errorText(error);
      } finally {
        if (current) loading.value = false;
      }
    },
    { immediate: true },
  );
  return { data, error: queryError, loading, retry: () => retryCount.value++ };
}

const {
  data: options,
  error: optionsError,
  loading: optionsLoading,
  retry: retryOptions,
} = useReportQuery(() => getPayrollAnalyticsOptions);
const availableYears = computed(() =>
  yearsWithMonths(options.value?.months ?? []),
);
const firstYear = computed(() => availableYears.value.at(-1) ?? initialYear);
const lastYear = computed(() => availableYears.value[0] ?? initialYear);
const endYears = computed(() =>
  yearList(firstYear.value, lastYear.value).toReversed(),
);
const startYears = computed(() =>
  yearList(
    Math.max(firstYear.value, endYear.value - 9),
    endYear.value,
  ).toReversed(),
);
const organizations = computed(() => options.value?.organizations ?? []);
const regions = computed(() => [
  ...new Set([
    ...payrollRegions,
    ...organizations.value.flatMap(({ region }) => (region ? [region] : [])),
  ]),
]);
const hasUnassignedOrganization = computed(() =>
  organizations.value.some((item) => !item.region),
);
const regionalOrganizations = computed(() =>
  organizations.value.filter(
    (item) => region.value === null || (item.region ?? '') === region.value,
  ),
);
const companies = computed(() => [
  ...new Set(regionalOrganizations.value.map((item) => item.company)),
]);
const departments = computed(() => [
  ...new Set(
    regionalOrganizations.value
      .filter((item) => !company.value || item.company === company.value)
      .map((item) => item.department),
  ),
]);
const scope = computed(() => ({
  company: company.value || undefined,
  department: department.value || undefined,
  region: region.value ?? undefined,
}));
const selectedMonth = computed(() => `${endYear.value}-${focusMonth.value}`);
let yearsInitialized = false;

watch(options, (result) => {
  if (!result || yearsInitialized) return;
  endYear.value = lastYear.value;
  startYear.value = Math.max(firstYear.value, endYear.value - 2);
  yearsInitialized = true;
});

watch([endYear, options], () => {
  if (!options.value) return;
  startYear.value = Math.max(
    firstYear.value,
    endYear.value - 9,
    Math.min(startYear.value, endYear.value),
  );
  const lastMonth = options.value?.months.findLast((month) =>
    month.startsWith(String(endYear.value)),
  );
  focusMonth.value =
    lastMonth?.slice(5) ??
    (endYear.value === initialYear ? props.reportMonth.slice(5) : '12');
});

watch([region, company, department], () => {
  employee.value = undefined;
  searchPage.value = 1;
});

const {
  data: monthlyResult,
  error: monthlyError,
  loading: monthlyLoading,
  retry: retryMonthly,
} = useReportQuery(() => {
  if (!options.value || !['cost', 'overall'].includes(props.view)) return;
  const params = {
    ...scope.value,
    endYear: endYear.value,
    startYear: startYear.value,
  };
  return () => getPayrollMonthlyAnalytics(params);
});
const {
  data: departmentResult,
  error: departmentError,
  loading: departmentLoading,
  retry: retryDepartments,
} = useReportQuery(() => {
  if (!options.value || props.view !== 'departments') return;
  const params = { ...scope.value, year: endYear.value };
  return () => getPayrollDepartmentMonths(params);
});
const {
  data: matches,
  error: searchError,
  loading: searching,
  retry: retrySearch,
} = useReportQuery(() => {
  if (!options.value || props.view !== 'employee' || !keyword.value) return;
  const params = {
    ...scope.value,
    keyword: keyword.value,
    page: searchPage.value,
  };
  return () => searchPayrollEmployees(params);
});
const {
  data: employeeResults,
  error: employeeError,
  loading: employeeLoading,
  retry: retryEmployee,
} = useReportQuery(() => {
  if (!options.value || props.view !== 'employee' || !employee.value) return;
  const params = {
    employeeKey: employee.value.employeeKey,
    endYear: employeeEnd.value,
    region: employee.value.region,
    startYear: employeeStart.value,
  };
  return () => getPayrollEmployeeMonths(params);
});

const employeeFirstYear = computed(() =>
  Number(employee.value?.firstMonth.slice(0, 4) ?? initialYear),
);
const employeeLastYear = computed(() =>
  Number(employee.value?.lastMonth.slice(0, 4) ?? initialYear),
);
const employeeEndYears = computed(() =>
  yearList(employeeFirstYear.value, employeeLastYear.value).toReversed(),
);
const employeeStartYears = computed(() =>
  yearList(
    Math.max(employeeFirstYear.value, employeeEnd.value - 9),
    employeeEnd.value,
  ).toReversed(),
);
const employeeRows = computed(() =>
  employeeAnalytics(employeeResults.value ?? []),
);
const employeeTable = computed(() =>
  (employeeResults.value ?? []).map(({ month, row }) => ({
    base: row.base + row.grade + row.tenurePay,
    gross: row.gross,
    key: month,
    month,
    net: row.net,
    performance:
      row.performance +
      row.beeAward +
      row.bonus +
      row.commission +
      row.priorBonus,
    tax: row.tax,
  })),
);
watch(employeeEnd, () => {
  employeeStart.value = Math.max(
    employeeFirstYear.value,
    employeeEnd.value - 9,
    Math.min(employeeStart.value, employeeEnd.value),
  );
});

function submitSearch() {
  const value = name.value.trim();
  employee.value = undefined;
  if (value && value === keyword.value && searchPage.value === 1) retrySearch();
  searchPage.value = 1;
  keyword.value = value;
}

function clearCompanyAndDepartment() {
  company.value = '';
  department.value = '';
}

function chooseEmployee(item: PayrollEmployeeMatch) {
  if (
    employee.value &&
    employeeMatchKey(employee.value) === employeeMatchKey(item)
  )
    return;
  employee.value = item;
  employeeEnd.value = employeeLastYear.value;
  employeeStart.value = Math.max(
    employeeFirstYear.value,
    employeeEnd.value - 2,
  );
  employeePane.value = 'records';
}

function employeeMatchKey(item: PayrollEmployeeMatch) {
  return JSON.stringify([item.employeeKey, item.region]);
}

function openEmployeeMonth(month: string) {
  const record = employeeResults.value?.find((item) => item.month === month);
  if (record) emit('detail', record.row, record.month);
}

const monthly = computed(() => monthlyResult.value ?? []);
const annual = computed(() => annualAnalytics(monthly.value));
const byMonth = computed(
  () => new Map(monthly.value.map((row) => [row.month, row])),
);
const current = computed(() => byMonth.value.get(selectedMonth.value));
const currentYear = computed(() =>
  annual.value.find(({ year }) => year === endYear.value),
);
const summary = computed(() => [
  {
    title: '月度总薪资（应发）',
    value: current.value?.gross,
    date: selectedMonth.value,
  },
  {
    title: '月度实发合计',
    value: current.value?.net,
    date: selectedMonth.value,
  },
  {
    title: '年度总薪资（应发）',
    value: currentYear.value?.gross,
    date: `${endYear.value} 年 · ${currentYear.value?.months ?? 0} / 12 个月有记录`,
  },
  {
    title: '年度实发合计',
    value: currentYear.value?.net,
    date: `${endYear.value} 年 · ${currentYear.value?.months ?? 0} / 12 个月有记录`,
  },
]);
const yearlyLabels = computed(() => yearList(startYear.value, endYear.value));
const monthComparison = computed(() =>
  yearlyLabels.value.map((year) => ({
    name: `${year} 年`,
    values: calendarMonths.map(
      ({ key }) => byMonth.value.get(`${year}-${key}`)?.gross ?? null,
    ),
  })),
);
const annualComparison = computed(() =>
  (['gross', 'net'] as const).map((key) => ({
    name: key === 'gross' ? '应发' : '实发',
    values: yearlyLabels.value.map(
      (year) => annual.value.find((row) => row.year === year)?.[key] ?? null,
    ),
  })),
);

const money = (key: string, label: string) => ({
  format: 'currency' as const,
  key,
  label,
});
const number = (key: string, label: string) => ({
  format: 'number' as const,
  key,
  label,
});
const amountColumns = [money('gross', '应发合计'), money('net', '实发合计')];
const periodColumn = computed(() => ({
  key: 'period',
  label: grouping.value === 'annual' ? '年度' : '月份',
}));
const overviewColumns = computed(() => [
  periodColumn.value,
  grouping.value === 'annual'
    ? number('months', '有记录月数')
    : { format: 'percent' as const, key: 'change', label: '应发环比' },
  ...amountColumns,
  number('people', grouping.value === 'annual' ? '核算人月' : '核算人数'),
]);
const costColumns = computed(() => [
  periodColumn.value,
  ...(grouping.value === 'annual' ? [number('months', '有记录月数')] : []),
  number('people', grouping.value === 'annual' ? '核算人月' : '核算人数'),
  money('cashGross', '应发工资（扣除单位缴费）'),
  money('employer', '单位缴费'),
  money('gross', '工资表人力成本'),
  money('net', '实发工资'),
  money('perPerson', '人均月工资（所选口径）'),
]);
const employeeColumns = [
  { key: 'month', label: '工资月份' },
  money('base', '固定薪酬'),
  money('performance', '绩效与奖金'),
  ...amountColumns,
  money('tax', '个人所得税'),
];
const reportRows = computed(() =>
  grouping.value === 'annual'
    ? annual.value.map((row) => ({
        cashGross: amount(row, 'cashGross'),
        employer: employerContribution(row.income),
        gross: row.gross,
        key: row.month,
        months: row.months,
        net: row.net,
        people: row.people,
        period: `${row.year} 年`,
        perPerson: average(amount(row, costMetric.value), row.people),
      }))
    : monthly.value.toReversed().map((row) => ({
        cashGross: amount(row, 'cashGross'),
        change: monthChange(row, byMonth.value.get(monthOffset(row.month, -1))),
        employer: employerContribution(row.income),
        gross: row.gross,
        key: row.month,
        net: row.net,
        people: row.people,
        period: row.month,
        perPerson: average(amount(row, costMetric.value), row.people),
      })),
);

const departmentRows = computed(() =>
  departmentTotals(
    departmentResult.value ?? [],
    grouping.value === 'monthly' ? selectedMonth.value : '',
  ),
);
const departmentColumns = computed(() => [
  { key: 'region', label: '所属区域' },
  { key: 'company', label: '所属公司' },
  { key: 'department', label: '部门' },
  ...(grouping.value === 'annual' ? [number('months', '有记录月数')] : []),
  ...amountColumns,
  number('people', grouping.value === 'annual' ? '核算人月' : '核算人数'),
]);
const ranked = computed(() => departmentRows.value.slice(0, 10));
const departmentSeries = computed(() =>
  (['gross', 'net'] as const).map((key) => ({
    name: key === 'gross' ? '应发' : '实发',
    values: ranked.value.map((row) => row[key]),
  })),
);
const departmentHeading = computed(() =>
  grouping.value === 'annual' ? '各部门年度总薪资' : '各部门月度薪资统计',
);

function chooseDepartment(key: string) {
  const match = departmentRows.value.find((row) => row.key === key);
  if (!match) return;
  region.value = match.region ?? '';
  company.value = match.company;
  department.value = match.department;
  grouping.value = 'monthly';
}
</script>

<template>
  <div class="analytics">
    <div v-if="optionsError" class="analysis-panel state" role="alert">
      <p>{{ optionsError }}</p>
      <button type="button" class="control" @click="retryOptions">重试</button>
    </div>
    <p v-else-if="optionsLoading" class="analysis-panel state" role="status">
      正在读取薪酬数据范围…
    </p>
    <div v-else-if="!options?.months.length" class="analysis-panel state">
      <strong>暂无已导入的工资数据</strong>
      <p>工资表导入后，可按历史月份查看员工薪资、部门统计和人力成本。</p>
    </div>
    <template v-else>
      <div class="analysis-toolbar">
        <template v-if="view !== 'employee'">
          <label v-if="view !== 'departments'">起始年度
            <select v-model.number="startYear">
              <option v-for="year in startYears" :key="year" :value="year">
                {{ year }} 年
              </option>
            </select>
          </label>
          <label>{{ view === 'departments' ? '统计年度' : '截至年度' }}
            <select v-model.number="endYear">
              <option v-for="year in endYears" :key="year" :value="year">
                {{ year }} 年
              </option>
            </select>
          </label>
          <label
            v-if="
              view === 'overall' ||
              (view === 'departments' && grouping === 'monthly')
            "
            >工资月份
            <select v-model="focusMonth">
              <option
                v-for="item in calendarMonths"
                :key="item.key"
                :value="item.key"
              >
                {{ item.label }}
              </option>
            </select>
          </label>
        </template>
        <label>所属区域
          <select
            v-model="region"
            aria-label="所属区域"
            @change="clearCompanyAndDepartment"
          >
            <option :value="null">全部区域</option>
            <option v-for="item in regions" :key="item" :value="item">
              {{ item }}
            </option>
            <option v-if="hasUnassignedOrganization" value="">未填写</option>
          </select>
        </label>
        <label>所属公司
          <select
            v-model="company"
            aria-label="所属公司"
            @change="department = ''"
          >
            <option value="">全部公司</option>
            <option v-for="item in companies" :key="item" :value="item">
              {{ item }}
            </option>
          </select>
        </label>
        <label>部门
          <select v-model="department" aria-label="部门">
            <option value="">全部部门</option>
            <option v-for="item in departments" :key="item" :value="item">
              {{ item }}
            </option>
          </select>
        </label>
        <label v-if="view === 'cost'">统计口径
          <select v-model="costMetric">
            <option v-for="(label, key) in costMetrics" :key="key" :value="key">
              {{ label }}
            </option>
          </select>
        </label>
        <form
          v-if="view === 'employee'"
          class="employee-search"
          @submit.prevent="submitSearch"
        >
          <label>员工姓名
            <input
              v-model="name"
              placeholder="输入姓名或部分姓名"
              maxlength="128"
            />
          </label>
          <button
            type="submit"
            class="control primary"
            :disabled="!name.trim()"
          >
            <Search :size="15" /> 查询
          </button>
        </form>
        <button
          v-else
          type="button"
          class="control refresh"
          aria-label="刷新分析数据"
          @click="refresh++"
        >
          <RefreshCw :size="15" /> 刷新
        </button>
      </div>

      <template v-if="view === 'employee'">
        <div v-if="!keyword" class="analysis-panel state">
          <strong>按姓名查询员工薪资</strong>
          <p>
            支持搜索已导入的所有年份。出现同名记录时，可按区域、公司和部门确认。
          </p>
        </div>
        <div v-else-if="searchError" class="analysis-panel state" role="alert">
          <p>{{ searchError }}</p>
          <button type="button" class="control" @click="retrySearch">
            重试
          </button>
        </div>
        <p v-else-if="searching" class="analysis-panel state" role="status">
          正在查询员工…
        </p>
        <p v-else-if="!matches?.items.length" class="analysis-panel state">
          当前条件下没有匹配的员工。
        </p>
        <details v-else class="analysis-panel search-results" open>
          <summary>员工搜索结果 · 本页 {{ matches.items.length }} 位</summary>
          <div class="matches">
            <button
              v-for="item in matches.items"
              :key="employeeMatchKey(item)"
              type="button"
              :aria-pressed="
                employee &&
                employeeMatchKey(employee) === employeeMatchKey(item)
              "
              @click="chooseEmployee(item)"
            >
              <strong>{{ item.name }}</strong>
              <span>{{ item.region || '区域未填写' }} / {{ item.company }} /
                {{ item.department }}</span>
              <small>{{ item.firstMonth }} 至 {{ item.lastMonth }}</small>
            </button>
          </div>
          <div v-if="searchPage > 1 || matches.hasMore" class="switch">
            <button
              type="button"
              class="control"
              :disabled="searchPage === 1"
              @click="searchPage--"
            >
              上一页
            </button>
            <span>第 {{ searchPage }} 页</span>
            <button
              type="button"
              class="control"
              :disabled="!matches.hasMore"
              @click="searchPage++"
            >
              下一页
            </button>
          </div>
        </details>

        <template v-if="employee">
          <div class="analysis-panel section-head">
            <div>
              <h2>{{ employee.name }}的薪酬记录</h2>
              <p>
                {{ employee.region || '区域未填写' }} / {{ employee.company }} /
                {{ employee.department }}
              </p>
            </div>
            <div class="analysis-toolbar">
              <label>起始年度
                <select v-model.number="employeeStart">
                  <option
                    v-for="year in employeeStartYears"
                    :key="year"
                    :value="year"
                  >
                    {{ year }} 年
                  </option>
                </select>
              </label>
              <label>截至年度
                <select v-model.number="employeeEnd">
                  <option
                    v-for="year in employeeEndYears"
                    :key="year"
                    :value="year"
                  >
                    {{ year }} 年
                  </option>
                </select>
              </label>
            </div>
          </div>
          <div class="switch" aria-label="员工薪资视图">
            <button
              type="button"
              :aria-pressed="employeePane === 'records'"
              @click="employeePane = 'records'"
            >
              薪资明细
            </button>
            <button
              type="button"
              :aria-pressed="employeePane === 'trends'"
              @click="employeePane = 'trends'"
            >
              趋势分析
            </button>
            <button
              type="button"
              :aria-pressed="employeePane === 'composition'"
              @click="employeePane = 'composition'"
            >
              薪资构成
            </button>
          </div>
          <div v-if="employeeError" class="analysis-panel state" role="alert">
            <p>{{ employeeError }}</p>
            <button type="button" class="control" @click="retryEmployee">
              重试
            </button>
          </div>
          <p
            v-else-if="employeeLoading"
            class="analysis-panel state"
            role="status"
          >
            正在读取员工薪资…
          </p>
          <section
            v-else-if="employeePane === 'records'"
            class="analysis-panel"
          >
            <h2 class="table-title">单人薪资数据查询表</h2>
            <PayrollReportTable
              :columns="employeeColumns"
              :rows="employeeTable"
              empty="所选年度内暂无薪资记录。"
              action="查看明细"
              @select="openEmployeeMonth"
            />
          </section>
          <PayrollAnalysisCharts
            v-else-if="employeeRows.length"
            :end-year="employeeEnd"
            :start-year="employeeStart"
            :mode="employeePane"
            :rows="employeeRows"
            individual
            metric="gross"
          />
          <p v-else class="analysis-panel state">所选年度内暂无薪资记录。</p>
        </template>
      </template>

      <template v-else-if="view === 'departments'">
        <div class="switch" aria-label="部门统计周期">
          <button
            type="button"
            :aria-pressed="grouping === 'monthly'"
            @click="grouping = 'monthly'"
          >
            月度统计
          </button>
          <button
            type="button"
            :aria-pressed="grouping === 'annual'"
            @click="grouping = 'annual'"
          >
            年度统计
          </button>
        </div>
        <div v-if="departmentError" class="analysis-panel state" role="alert">
          <p>{{ departmentError }}</p>
          <button type="button" class="control" @click="retryDepartments">
            重试
          </button>
        </div>
        <p
          v-else-if="departmentLoading"
          class="analysis-panel state"
          role="status"
        >
          正在汇总部门薪资…
        </p>
        <template v-else>
          <section class="analysis-panel">
            <div class="section-head">
              <div>
                <h2>{{ departmentHeading }}</h2>
                <p>
                  {{
                    grouping === 'annual'
                      ? `${endYear} 年 · 按工资表所属公司与部门归集`
                      : monthLabel(selectedMonth)
                  }}
                </p>
              </div>
            </div>
            <PayrollReportTable
              :columns="departmentColumns"
              :rows="departmentRows"
              empty="当前统计范围内暂无部门工资记录。"
              :action="grouping === 'annual' ? '查看月度' : undefined"
              @select="chooseDepartment"
            />
          </section>
          <PayrollChartCard
            v-if="ranked.length"
            :title="`${departmentHeading}对比`"
            :description="
              departmentRows.length > 10
                ? '按应发金额取前 10 个部门'
                : '按应发金额降序排列'
            "
            :columns="
              ranked.map(
                (row) =>
                  `${row.region || '区域未填写'} / ${row.company} / ${row.department}`,
              )
            "
            :series="departmentSeries"
            large-amounts
            type="bar"
          />
        </template>
      </template>

      <template v-else>
        <p v-if="view === 'cost'" class="analysis-note">
          工资表人力成本包含单位社保、公积金，范围以已导入工资表为准。人均月工资按核算人月计算。
        </p>
        <div v-if="monthlyError" class="analysis-panel state" role="alert">
          <p>{{ monthlyError }}</p>
          <button type="button" class="control" @click="retryMonthly">
            重试
          </button>
        </div>
        <p
          v-else-if="monthlyLoading"
          class="analysis-panel state"
          role="status"
        >
          正在汇总薪酬数据…
        </p>
        <p v-else-if="!monthly.length" class="analysis-panel state">
          当前统计范围内暂无薪酬数据。
        </p>
        <template v-else>
          <template v-if="view === 'overall'">
            <div class="analytics-metrics">
              <article
                v-for="metric in summary"
                :key="metric.title"
                class="analysis-panel metric-card"
              >
                <h2>{{ metric.title }}</h2>
                <strong>{{
                  metric.value === undefined ? '—' : currency(metric.value)
                }}</strong>
                <p>{{ metric.date }}</p>
              </article>
            </div>
            <div class="overview-charts">
              <PayrollChartCard
                title="各月总薪资对比"
                description="同一月份按年度对比应发总额"
                :columns="calendarMonths.map(({ label }) => label)"
                :series="monthComparison"
                large-amounts
                type="bar"
              />
              <PayrollChartCard
                title="年度总薪资"
                description="汇总各年有工资记录的月份"
                :columns="yearlyLabels.map((year) => `${year} 年`)"
                :series="annualComparison"
                large-amounts
                type="bar"
              />
            </div>
          </template>
          <div v-else class="switch" aria-label="人力成本视图">
            <button
              type="button"
              :aria-pressed="costPane === 'trends'"
              @click="costPane = 'trends'"
            >
              工资趋势
            </button>
            <button
              type="button"
              :aria-pressed="costPane === 'composition'"
              @click="costPane = 'composition'"
            >
              薪资构成
            </button>
            <button
              type="button"
              :aria-pressed="costPane === 'records'"
              @click="costPane = 'records'"
            >
              成本数据
            </button>
          </div>
          <section
            v-if="view === 'overall' || costPane === 'records'"
            class="analysis-panel"
          >
            <div class="section-head">
              <div>
                <h2>
                  {{ view === 'overall' ? '总体数据表' : '人力成本数据查询' }}
                </h2>
                <p>汇总范围包含所选年度内有工资记录的月份</p>
              </div>
              <div class="switch" aria-label="数据表周期">
                <button
                  type="button"
                  :aria-pressed="grouping === 'monthly'"
                  @click="grouping = 'monthly'"
                >
                  月度数据
                </button>
                <button
                  type="button"
                  :aria-pressed="grouping === 'annual'"
                  @click="grouping = 'annual'"
                >
                  年度数据
                </button>
              </div>
            </div>
            <PayrollReportTable
              :columns="view === 'overall' ? overviewColumns : costColumns"
              :rows="reportRows"
              empty="当前统计范围内暂无工资记录。"
            />
          </section>
          <PayrollAnalysisCharts
            v-else
            :start-year="startYear"
            :end-year="endYear"
            :rows="monthly"
            :mode="costPane === 'composition' ? 'composition' : 'trends'"
            :metric="costMetric"
            :individual="false"
          />
        </template>
      </template>
    </template>
  </div>
</template>

<style scoped src="./analytics.css"></style>
