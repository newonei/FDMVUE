import type { LocationQuery, LocationQueryRaw, Router } from 'vue-router';

import type { JixiaoDashboardApi } from '#/api/fdmperformance/dashboard';

import { reactive } from 'vue';
import { useRoute } from 'vue-router';

import { PERFORMANCE_DEFAULT_PAGE_SIZE } from '../../shared/constants';

export interface DashboardQueryState {
  deptId?: JixiaoDashboardApi.Id;
  endPeriodKey: string;
  grades: string[];
  includeChildDept: boolean;
  pageNo: number;
  pageSize: number;
  periodType: JixiaoDashboardApi.PeriodType;
  publicStatus?: 0 | 1;
  startPeriodKey: string;
  templateId?: JixiaoDashboardApi.Id;
  userName: string;
}

const PERIOD_TYPES = new Set<JixiaoDashboardApi.PeriodType>([
  'HALF_YEAR',
  'MONTH',
  'PROBATION',
  'QUARTER',
  'YEAR',
]);

function first(query: LocationQuery, key: string) {
  const value = query[key];
  return Array.isArray(value) ? value[0] : value;
}

function safePage(value: null | string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function asPeriodType(value: null | string | undefined) {
  return value && PERIOD_TYPES.has(value as JixiaoDashboardApi.PeriodType)
    ? (value as JixiaoDashboardApi.PeriodType)
    : 'MONTH';
}

function asPublicStatus(value: null | string | undefined) {
  return value === '0' ? 0 : (value === '1' ? 1 : undefined);
}

export function createDashboardQueryState(
  routeQuery: LocationQuery = {},
): DashboardQueryState {
  const grades = first(routeQuery, 'grades')
    ?.split(',')
    .filter((grade) => ['A', 'A+', 'B', 'C', 'C+'].includes(grade));
  return {
    deptId: first(routeQuery, 'deptId') || undefined,
    endPeriodKey: first(routeQuery, 'endPeriodKey') || '',
    grades: grades || [],
    includeChildDept: first(routeQuery, 'includeChildDept') !== '0',
    pageNo: safePage(first(routeQuery, 'pageNo'), 1),
    pageSize: safePage(
      first(routeQuery, 'pageSize'),
      PERFORMANCE_DEFAULT_PAGE_SIZE,
    ),
    periodType: asPeriodType(first(routeQuery, 'periodType')),
    publicStatus: asPublicStatus(first(routeQuery, 'publicStatus')),
    startPeriodKey: first(routeQuery, 'startPeriodKey') || '',
    templateId: first(routeQuery, 'templateId') || undefined,
    userName: first(routeQuery, 'userName') || '',
  };
}

export function toDashboardRequest(
  state: DashboardQueryState,
): JixiaoDashboardApi.QueryParams {
  return {
    ...(state.deptId ? { deptId: state.deptId } : {}),
    endPeriodKey: state.endPeriodKey,
    ...(state.grades.length > 0 ? { grades: state.grades } : {}),
    includeChildDept: state.includeChildDept,
    pageNo: state.pageNo,
    pageSize: state.pageSize,
    periodType: state.periodType,
    ...(state.publicStatus === undefined
      ? {}
      : { publicStatus: state.publicStatus }),
    startPeriodKey: state.startPeriodKey,
    ...(state.templateId ? { templateId: state.templateId } : {}),
    ...(state.userName.trim() ? { userName: state.userName.trim() } : {}),
  };
}

export function toDashboardRouteQuery(
  state: DashboardQueryState,
): LocationQueryRaw {
  return {
    ...(state.deptId ? { deptId: String(state.deptId) } : {}),
    endPeriodKey: state.endPeriodKey || undefined,
    ...(state.grades.length > 0 ? { grades: state.grades.join(',') } : {}),
    ...(state.includeChildDept ? {} : { includeChildDept: '0' }),
    pageNo: String(state.pageNo),
    pageSize: String(state.pageSize),
    periodType: state.periodType,
    ...(state.publicStatus === undefined
      ? {}
      : { publicStatus: String(state.publicStatus) }),
    startPeriodKey: state.startPeriodKey || undefined,
    ...(state.templateId ? { templateId: String(state.templateId) } : {}),
    ...(state.userName.trim() ? { userName: state.userName.trim() } : {}),
  };
}

export function useDashboardQueryState(router: Router) {
  const route = useRoute();
  const state = reactive<DashboardQueryState>(
    createDashboardQueryState(route.query),
  );

  function restore(routeQuery: LocationQuery = route.query) {
    Object.assign(state, createDashboardQueryState(routeQuery));
  }

  function resetPage() {
    state.pageNo = 1;
  }

  async function syncRoute() {
    await router.replace({ query: toDashboardRouteQuery(state) });
  }

  return { resetPage, restore, state, syncRoute };
}
