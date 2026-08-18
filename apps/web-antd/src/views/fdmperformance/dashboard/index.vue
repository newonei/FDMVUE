<script lang="ts" setup>
import type { JixiaoDashboardApi } from '#/api/fdmperformance/dashboard';
import type { SystemDeptApi } from '#/api/system/dept';

import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';

import { handleTree } from '@vben/utils';

import { Empty, message } from 'ant-design-vue';

import {
  getDashboardEmployeeHistoryPage,
  getDashboardFilterOptions,
  getDashboardOverview,
} from '#/api/fdmperformance/dashboard';
import { getSimpleDeptList } from '#/api/system/dept';

import PerformanceShell from '../shared/PerformanceShell.vue';
import DepartmentComparisonTable from './components/DepartmentComparisonTable.vue';
import EmployeeHistoryTable from './components/EmployeeHistoryTable.vue';
import GradeDistributionChart from './components/GradeDistributionChart.vue';
import PerformanceDashboardFilters from './components/PerformanceDashboardFilters.vue';
import PerformanceKpiBand from './components/PerformanceKpiBand.vue';
import PerformanceTrendChart from './components/PerformanceTrendChart.vue';
import {
  createDashboardQueryState,
  toDashboardRequest,
  toDashboardRouteQuery,
  useDashboardQueryState,
} from './composables/use-dashboard-query-state';

defineOptions({ name: 'FdmPerformanceDashboard' });

const router = useRouter();
const { resetPage, state: query, syncRoute } = useDashboardQueryState(router);

const filterOptions = ref<JixiaoDashboardApi.FilterOptions | null>(null);
const departments = ref<SystemDeptApi.Dept[]>([]);
const overview = ref<JixiaoDashboardApi.Overview | null>(null);
const historyRows = ref<JixiaoDashboardApi.EmployeeHistory[]>([]);
const historyTotal = ref(0);
const filterLoading = ref(false);
const overviewLoading = ref(false);
const historyLoading = ref(false);

let filterRequestId = 0;
let overviewRequestId = 0;
let historyRequestId = 0;

const departmentTree = computed(
  () => handleTree(departments.value) as SystemDeptApi.Dept[],
);

const showDepartmentComparison = computed(
  () =>
    Boolean(
      filterOptions.value?.performanceHr || filterOptions.value?.hasRelatedUsers,
    ),
);

function sortAvailablePeriods(periods: JixiaoDashboardApi.PeriodOption[]) {
  return [...periods].toSorted((left, right) =>
    right.periodKey.localeCompare(left.periodKey),
  );
}

function isValidPeriodKey(
  periodType: JixiaoDashboardApi.PeriodType,
  periodKey: string,
) {
  const patterns: Record<JixiaoDashboardApi.PeriodType, RegExp> = {
    HALF_YEAR: /^\d{4}-H[12]$/,
    MONTH: /^\d{4}-(0[1-9]|1[0-2])$/,
    PROBATION: /^\d{4}-(0[1-9]|1[0-2])-PROBATION$/,
    QUARTER: /^\d{4}-Q[1-4]$/,
    YEAR: /^\d{4}$/,
  };
  return patterns[periodType].test(periodKey);
}

function currentPeriodKey(periodType: JixiaoDashboardApi.PeriodType) {
  const now = new Date();
  const year = String(now.getFullYear());
  const month = String(now.getMonth() + 1).padStart(2, '0');
  switch (periodType) {
    case 'HALF_YEAR': {
      return `${year}-H${now.getMonth() < 6 ? '1' : '2'}`;
    }
    case 'MONTH': {
      return `${year}-${month}`;
    }
    case 'PROBATION': {
      return `${year}-${month}-PROBATION`;
    }
    case 'QUARTER': {
      return `${year}-Q${Math.floor(now.getMonth() / 3) + 1}`;
    }
    case 'YEAR': {
      return year;
    }
  }
}

function applyDefaultPeriodRange() {
  const periods = sortAvailablePeriods(
    (filterOptions.value?.periods || []).filter(
      (item) => item.periodType === query.periodType,
    ),
  );
  const hasCompleteRange =
    isValidPeriodKey(query.periodType, query.startPeriodKey) &&
    isValidPeriodKey(query.periodType, query.endPeriodKey);
  if (hasCompleteRange) return;

  if (periods.length === 0) {
    const currentPeriod = currentPeriodKey(query.periodType);
    query.startPeriodKey = currentPeriod;
    query.endPeriodKey = currentPeriod;
    return;
  }

  const currentYear = String(new Date().getFullYear());
  const currentYearPeriods = periods.filter((item) =>
    item.periodKey.startsWith(currentYear),
  );
  const desired =
    query.periodType === 'MONTH'
      ? periods.slice(0, 12)
      : (currentYearPeriods.length > 0
        ? currentYearPeriods
        : periods);
  query.endPeriodKey = desired[0]?.periodKey || '';
  query.startPeriodKey = desired.at(-1)?.periodKey || '';
}

async function loadFilterOptions(periodType = query.periodType) {
  const requestId = ++filterRequestId;
  filterLoading.value = true;
  try {
    const result = await getDashboardFilterOptions({ periodType });
    if (requestId !== filterRequestId) return;
    filterOptions.value = result;
    if (result.performanceHr && query.publicStatus === undefined) {
      query.publicStatus = 1;
    }
    applyDefaultPeriodRange();
  } catch (error) {
    if (requestId === filterRequestId) {
      message.error('绩效看板筛选项加载失败，请稍后重试');
    }
    throw error;
  } finally {
    if (requestId === filterRequestId) {
      filterLoading.value = false;
    }
  }
}

async function loadOverview() {
  if (!query.startPeriodKey || !query.endPeriodKey) {
    overview.value = null;
    return;
  }
  const requestId = ++overviewRequestId;
  overviewLoading.value = true;
  try {
    const result = await getDashboardOverview(toDashboardRequest(query));
    if (requestId === overviewRequestId) {
      overview.value = result;
    }
  } catch {
    if (requestId === overviewRequestId) {
      message.error('绩效看板概览加载失败，请稍后重试');
    }
  } finally {
    if (requestId === overviewRequestId) {
      overviewLoading.value = false;
    }
  }
}

async function loadHistory() {
  if (!query.startPeriodKey || !query.endPeriodKey) {
    historyRows.value = [];
    historyTotal.value = 0;
    return;
  }
  const requestId = ++historyRequestId;
  historyLoading.value = true;
  try {
    const result = await getDashboardEmployeeHistoryPage(
      toDashboardRequest(query),
    );
    if (requestId === historyRequestId) {
      historyRows.value = result.list;
      historyTotal.value = result.total;
    }
  } catch {
    if (requestId === historyRequestId) {
      message.error('人员历史绩效加载失败，请稍后重试');
    }
  } finally {
    if (requestId === historyRequestId) {
      historyLoading.value = false;
    }
  }
}

async function refreshDashboard() {
  await syncRoute();
  await Promise.all([loadOverview(), loadHistory()]);
}

async function queryDashboard() {
  if (!query.startPeriodKey || !query.endPeriodKey) {
    message.warning('请选择开始周期和结束周期');
    return;
  }
  if (query.startPeriodKey > query.endPeriodKey) {
    message.warning('开始周期不能晚于结束周期');
    return;
  }
  query.userName = query.userName.trim();
  resetPage();
  await refreshDashboard();
}

async function resetDashboard() {
  Object.assign(query, createDashboardQueryState());
  await loadFilterOptions(query.periodType);
  resetPage();
  await refreshDashboard();
}

async function changePeriodType(periodType: JixiaoDashboardApi.PeriodType) {
  query.periodType = periodType;
  query.templateId = undefined;
  resetPage();
  await loadFilterOptions(periodType);
  await refreshDashboard();
}

function updateDashboardQuery(value: typeof query) {
  Object.assign(query, value);
}

async function toggleGrade(grade: string) {
  query.grades = query.grades.includes(grade)
    ? query.grades.filter((item) => item !== grade)
    : [...query.grades, grade];
  resetPage();
  await refreshDashboard();
}

async function selectDepartment(deptId: JixiaoDashboardApi.Id) {
  query.deptId = deptId;
  query.includeChildDept = false;
  resetPage();
  await refreshDashboard();
}

async function changeHistoryPage(pageNo: number, pageSize: number) {
  query.pageNo = pageNo;
  query.pageSize = pageSize;
  await syncRoute();
  await loadHistory();
}

function openPerson(record: JixiaoDashboardApi.EmployeeHistory) {
  const personQuery = toDashboardRouteQuery({
    ...query,
    pageNo: 1,
    userName: '',
  });
  router.push({
    path: `/fdmperformance/dashboard/person/${record.userId}`,
    query: personQuery,
  });
}

function openInstance(record: JixiaoDashboardApi.EmployeeHistory) {
  router.push(
    `/fdmperformance/batches/${record.batchId}/instances/${record.instanceId}`,
  );
}

function openReview(record: JixiaoDashboardApi.EmployeeHistory) {
  if (!record.reviewId) return;
  router.push({
    path: '/fdmperformance/results',
    query: { reviewId: String(record.reviewId) },
  });
}

async function initialize() {
  try {
    const [, departmentList] = await Promise.all([
      loadFilterOptions(),
      getSimpleDeptList(),
    ]);
    departments.value = departmentList;
    await refreshDashboard();
  } catch {
    // Each request has already provided a specific error message.
  }
}

onMounted(() => void initialize());
</script>

<template>
  <PerformanceShell title="绩效看板">
    <PerformanceDashboardFilters
      :model-value="query"
      :departments="departmentTree"
      :loading="filterLoading || overviewLoading || historyLoading"
      :options="filterOptions"
      @period-type-change="changePeriodType"
      @query="queryDashboard"
      @reset="resetDashboard"
      @update:model-value="updateDashboardQuery"
    />

    <PerformanceKpiBand
      :grade-groups="overview?.gradeGroups || []"
      :kpi="overview?.kpi || null"
      :performance-hr="Boolean(filterOptions?.performanceHr)"
    />

    <div class="chart-grid">
      <GradeDistributionChart
        :details="overview?.gradeDetails || []"
        :loading="overviewLoading"
        @grade-click="toggleGrade"
      />
      <PerformanceTrendChart
        :loading="overviewLoading"
        :trends="overview?.trends || []"
        @grade-click="toggleGrade"
      />
    </div>

    <DepartmentComparisonTable
      v-if="showDepartmentComparison"
      :loading="overviewLoading"
      :rows="overview?.departments || []"
      @select-dept="selectDepartment"
    />

    <EmployeeHistoryTable
      :can-query-review="Boolean(filterOptions?.canQueryReview)"
      :loading="historyLoading"
      :page-no="query.pageNo"
      :page-size="query.pageSize"
      :rows="historyRows"
      :total="historyTotal"
      @change-page="changeHistoryPage"
      @open-instance="openInstance"
      @open-person="openPerson"
      @open-review="openReview"
    />

    <Empty
      v-if="!overviewLoading && overview?.kpi.resultCount === 0"
      class="empty-notice"
      description="当前筛选条件下暂无可查看的已公示绩效结果"
    />
  </PerformanceShell>
</template>

<style scoped>
.chart-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.empty-notice {
  padding: 20px 0 8px;
  background: #fff;
  border: 1px solid #edf0f4;
  border-radius: 8px;
}

@media (max-width: 900px) {
  .chart-grid {
    grid-template-columns: 1fr;
  }
}
</style>
