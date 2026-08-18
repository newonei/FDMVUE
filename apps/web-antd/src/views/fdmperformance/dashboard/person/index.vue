<script lang="ts" setup>
import type { JixiaoDashboardApi } from '#/api/fdmperformance/dashboard';
import type { SystemDeptApi } from '#/api/system/dept';

import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { handleTree } from '@vben/utils';

import { Alert, Button, Empty, message, Tag } from 'ant-design-vue';

import {
  getDashboardFilterOptions,
  getDashboardPersonGradeLogPage,
  getDashboardPersonHistoryPage,
  getDashboardPersonSummary,
} from '#/api/fdmperformance/dashboard';
import { getSimpleDeptList } from '#/api/system/dept';

import PerformanceShell from '../../shared/PerformanceShell.vue';
import PerformanceDashboardFilters from '../components/PerformanceDashboardFilters.vue';
import PerformanceKpiBand from '../components/PerformanceKpiBand.vue';
import PersonHistoryDetailsTable from '../components/PersonHistoryDetailsTable.vue';
import PersonHistoryTrendChart from '../components/PersonHistoryTrendChart.vue';
import {
  createDashboardQueryState,
  toDashboardRequest,
  toDashboardRouteQuery,
  useDashboardQueryState,
} from '../composables/use-dashboard-query-state';

defineOptions({ name: 'FdmPerformancePersonHistory' });

const route = useRoute();
const router = useRouter();
const { resetPage, state: query, syncRoute } = useDashboardQueryState(router);

const targetUserId = computed(() => {
  const value = route.params.userId;
  return Array.isArray(value) ? value[0] : value;
});

const filterOptions = ref<JixiaoDashboardApi.FilterOptions | null>(null);
const departments = ref<SystemDeptApi.Dept[]>([]);
const summary = ref<JixiaoDashboardApi.PersonSummary | null>(null);
const rows = ref<JixiaoDashboardApi.EmployeeHistory[]>([]);
const total = ref(0);
const gradeLogsByResult = ref<Record<string, JixiaoDashboardApi.GradeLog[]>>(
  {},
);
const loadingGradeLogIds = ref<string[]>([]);
const filterLoading = ref(false);
const summaryLoading = ref(false);
const historyLoading = ref(false);

let filterRequestId = 0;
let summaryRequestId = 0;
let historyRequestId = 0;

const departmentTree = computed(
  () => handleTree(departments.value) as SystemDeptApi.Dept[],
);

function personRequest() {
  const userId = targetUserId.value;
  if (!userId) {
    throw new Error('缺少人员参数');
  }
  return { ...toDashboardRequest(query), userId };
}

function sortPeriods(periods: JixiaoDashboardApi.PeriodOption[]) {
  return [...periods].toSorted((left, right) =>
    right.periodKey.localeCompare(left.periodKey),
  );
}

function applyDefaultPeriodRange() {
  const periods = sortPeriods(
    (filterOptions.value?.periods || []).filter(
      (item) => item.periodType === query.periodType,
    ),
  );
  if (periods.length === 0) {
    query.startPeriodKey = '';
    query.endPeriodKey = '';
    return;
  }
  const keys = new Set(periods.map((item) => item.periodKey));
  if (keys.has(query.startPeriodKey) && keys.has(query.endPeriodKey)) return;

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
      message.error('人员历史筛选项加载失败，请稍后重试');
    }
    throw error;
  } finally {
    if (requestId === filterRequestId) filterLoading.value = false;
  }
}

async function loadSummary() {
  if (!query.startPeriodKey || !query.endPeriodKey || !targetUserId.value) {
    summary.value = null;
    return;
  }
  const requestId = ++summaryRequestId;
  summaryLoading.value = true;
  try {
    const result = await getDashboardPersonSummary(personRequest());
    if (requestId === summaryRequestId) summary.value = result;
  } catch {
    if (requestId === summaryRequestId) {
      message.error('人员历史摘要加载失败，可能已超出当前数据范围');
    }
  } finally {
    if (requestId === summaryRequestId) summaryLoading.value = false;
  }
}

async function loadHistory() {
  if (!query.startPeriodKey || !query.endPeriodKey || !targetUserId.value) {
    rows.value = [];
    total.value = 0;
    return;
  }
  const requestId = ++historyRequestId;
  historyLoading.value = true;
  try {
    const result = await getDashboardPersonHistoryPage(personRequest());
    if (requestId === historyRequestId) {
      rows.value = result.list;
      total.value = result.total;
    }
  } catch {
    if (requestId === historyRequestId) {
      message.error('人员历史明细加载失败，请稍后重试');
    }
  } finally {
    if (requestId === historyRequestId) historyLoading.value = false;
  }
}

async function refreshPage() {
  await syncRoute();
  gradeLogsByResult.value = {};
  loadingGradeLogIds.value = [];
  await Promise.all([loadSummary(), loadHistory()]);
}

async function queryPage() {
  if (!query.startPeriodKey || !query.endPeriodKey) {
    message.warning('请选择开始周期和结束周期');
    return;
  }
  if (query.startPeriodKey > query.endPeriodKey) {
    message.warning('开始周期不能晚于结束周期');
    return;
  }
  resetPage();
  await refreshPage();
}

async function resetFilters() {
  Object.assign(query, createDashboardQueryState());
  query.userName = '';
  await loadFilterOptions(query.periodType);
  resetPage();
  await refreshPage();
}

async function changePeriodType(periodType: JixiaoDashboardApi.PeriodType) {
  query.periodType = periodType;
  query.templateId = undefined;
  resetPage();
  await loadFilterOptions(periodType);
  await refreshPage();
}

function updatePersonQuery(value: typeof query) {
  Object.assign(query, value);
}

async function changeHistoryPage(pageNo: number, pageSize: number) {
  query.pageNo = pageNo;
  query.pageSize = pageSize;
  await syncRoute();
  await loadHistory();
}

async function loadGradeLogs(record: JixiaoDashboardApi.EmployeeHistory) {
  const key = String(record.resultId);
  if (gradeLogsByResult.value[key] || loadingGradeLogIds.value.includes(key)) {
    return;
  }
  loadingGradeLogIds.value = [...loadingGradeLogIds.value, key];
  try {
    const result = await getDashboardPersonGradeLogPage({
      ...toDashboardRequest(query),
      resultId: record.resultId,
    });
    gradeLogsByResult.value = { ...gradeLogsByResult.value, [key]: result.list };
  } catch {
    message.error('调级审计记录加载失败，请稍后重试');
  } finally {
    loadingGradeLogIds.value = loadingGradeLogIds.value.filter(
      (id) => id !== key,
    );
  }
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

function backToDashboard() {
  router.push({
    path: '/fdmperformance/dashboard',
    query: toDashboardRouteQuery(query),
  });
}

async function initialize() {
  query.userName = '';
  try {
    const [, departmentList] = await Promise.all([
      loadFilterOptions(),
      getSimpleDeptList(),
    ]);
    departments.value = departmentList;
    await refreshPage();
  } catch {
    // Each failed request has already surfaced a focused message.
  }
}

onMounted(() => void initialize());
</script>

<template>
  <PerformanceShell title="人员历史绩效">
    <div class="page-heading">
      <div>
        <Button size="small" type="link" @click="backToDashboard">返回绩效看板</Button>
        <h2>{{ summary?.userName || '人员历史绩效' }}</h2>
        <p>
          当前部门：{{ summary?.currentDeptName || '-' }}
          <span class="separator">|</span>
          当前主管：{{ summary?.currentSupervisorUserName || '-' }}
        </p>
      </div>
      <Tag v-if="summary && summary.consecutiveCGroupPeriods > 0" color="orange">
        连续 {{ summary.consecutiveCGroupPeriods }} 个周期出现 C档结果
      </Tag>
    </div>

    <PerformanceDashboardFilters
      :departments="departmentTree"
      hide-user-name
      :loading="filterLoading || summaryLoading || historyLoading"
      :model-value="query"
      :options="filterOptions"
      @period-type-change="changePeriodType"
      @query="queryPage"
      @reset="resetFilters"
      @update:model-value="updatePersonQuery"
    />

    <PerformanceKpiBand
      :grade-groups="summary?.gradeGroups || []"
      :kpi="summary?.kpi || null"
      :performance-hr="Boolean(filterOptions?.performanceHr)"
    />

    <Alert
      v-if="summary && summary.consecutiveCGroupPeriods > 0"
      show-icon
      type="warning"
      :message="`当前筛选范围内，${summary.userName} 连续 ${summary.consecutiveCGroupPeriods} 个周期出现 C档结果。`"
    />

    <PersonHistoryTrendChart
      :loading="summaryLoading"
      :rows="summary?.trendRecords || []"
    />

    <PersonHistoryDetailsTable
      :can-query-review="Boolean(filterOptions?.canQueryReview)"
      :grade-logs-by-result="gradeLogsByResult"
      :loading="historyLoading"
      :loading-grade-log-ids="loadingGradeLogIds"
      :page-no="query.pageNo"
      :page-size="query.pageSize"
      :rows="rows"
      :total="total"
      @change-page="changeHistoryPage"
      @load-grade-logs="loadGradeLogs"
      @open-instance="openInstance"
      @open-review="openReview"
    />

    <Empty
      v-if="!summaryLoading && summary?.kpi.resultCount === 0"
      class="empty-notice"
      description="当前筛选条件下暂无该人员可查看的绩效结果"
    />
  </PerformanceShell>
</template>

<style scoped>
.page-heading {
  display: flex;
  gap: 12px;
  align-items: start;
  justify-content: space-between;
  padding: 2px 2px 0;
}

.page-heading h2 {
  margin: 2px 0 4px;
  font-size: 19px;
  line-height: 1.35;
  color: #172033;
}

.page-heading p {
  margin: 0;
  font-size: 13px;
  color: #64748b;
}

.separator {
  padding: 0 8px;
  color: #cbd5e1;
}

.empty-notice {
  padding: 20px 0 8px;
  background: #fff;
  border: 1px solid #edf0f4;
  border-radius: 8px;
}

@media (max-width: 640px) {
  .page-heading {
    flex-direction: column;
  }
}
</style>
