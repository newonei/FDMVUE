import type { PageParam, PageResult } from '@vben/request';

import { requestClient } from '#/api/request';

/**
 * Read-only performance dashboard contracts. IDs intentionally remain opaque
 * values so a backend Long can travel through the browser without precision
 * loss.
 */
export namespace JixiaoDashboardApi {
  export type Id = number | string;
  export type DateTimeValue = number | string;
  /** Decimal ratio in [0, 1]. UI components format it as a percentage. */
  export type Rate = number;

  export type PeriodType =
    | 'HALF_YEAR'
    | 'MONTH'
    | 'PROBATION'
    | 'QUARTER'
    | 'YEAR';

  export interface QueryParams extends PageParam {
    deptId?: Id;
    endPeriodKey: string;
    grades?: string[];
    includeChildDept?: boolean;
    periodType: PeriodType;
    publicStatus?: 0 | 1;
    startPeriodKey: string;
    templateId?: Id;
    userName?: string;
  }

  export interface FilterOptionsParams {
    periodType?: PeriodType;
  }

  export interface PeriodOption {
    label: string;
    periodKey: string;
    periodType: PeriodType;
    resultCount: number;
  }

  export interface TemplateOption {
    periodType: PeriodType;
    resultCount: number;
    templateId: Id;
    templateName: string;
  }

  export interface FilterOptions {
    canQueryReview: boolean;
    hasRelatedUsers: boolean;
    performanceHr: boolean;
    periods: PeriodOption[];
    templates: TemplateOption[];
  }

  export interface Kpi {
    averageScore?: number;
    employeeCount: number;
    publicCount: number;
    publicRate?: Rate;
    resultCount: number;
  }

  export interface GradeCount {
    count: number;
    grade: string;
    rate?: Rate;
  }

  export interface GradeGroup {
    count: number;
    gradeGroup: 'A' | 'B' | 'C';
    rate?: Rate;
  }

  export interface PeriodTrend {
    aCount: number;
    aplusCount: number;
    averageScore?: number;
    bCount: number;
    cCount: number;
    cplusCount: number;
    employeeCount: number;
    periodKey: string;
    periodLabel: string;
    periodType: PeriodType;
    resultCount: number;
  }

  export interface DepartmentSummary {
    aCount: number;
    aplusCount: number;
    aRate?: Rate;
    averageScore?: number;
    averageScoreChange?: number;
    bCount: number;
    cCount: number;
    cplusCount: number;
    cRate?: Rate;
    comparePeriodKey?: string;
    deptId: Id;
    deptName: string;
    employeeCount: number;
    latestPeriodKey?: string;
    resultCount: number;
  }

  export interface Overview {
    dataTime: string;
    departments: DepartmentSummary[];
    gradeDetails: GradeCount[];
    gradeGroups: GradeGroup[];
    kpi: Kpi;
    trends: PeriodTrend[];
  }

  export interface EmployeeHistory {
    batchId: Id;
    batchName: string;
    deptId: Id;
    deptName: string;
    employeeConfirmed: boolean;
    finalScore?: number;
    grade: string;
    gradeGroup: 'A' | 'B' | 'C';
    instanceId: Id;
    periodKey: string;
    periodLabel: string;
    periodType: PeriodType;
    publicStatus: 0 | 1;
    publicTime?: DateTimeValue;
    resultId: Id;
    reviewId?: Id;
    reviewStatus?: number;
    reviewTriggerGrade?: string;
    supervisorUserId: Id;
    supervisorUserName: string;
    templateId: Id;
    templateName: string;
    userId: Id;
    userName: string;
  }

  export interface PersonSummary {
    consecutiveCGroupPeriods: number;
    currentDeptId?: Id;
    currentDeptName?: string;
    currentSupervisorUserId?: Id;
    currentSupervisorUserName?: string;
    gradeDetails: GradeCount[];
    gradeGroups: GradeGroup[];
    kpi: Kpi;
    trendRecords: EmployeeHistory[];
    trends: PeriodTrend[];
    userId: Id;
    userName: string;
  }

  export interface GradeLog {
    createTime?: DateTimeValue;
    id: Id;
    instanceId: Id;
    newGrade?: string;
    oldGrade?: string;
    operatorUserId?: Id;
    operatorUserName?: string;
    reason?: string;
    resultId: Id;
    userId: Id;
    userName: string;
  }

  export interface PersonQueryParams extends QueryParams {
    userId: Id;
  }

  export interface PersonGradeLogPageParams extends QueryParams {
    resultId: Id;
  }
}

export function getDashboardFilterOptions(
  params: JixiaoDashboardApi.FilterOptionsParams = {},
) {
  return requestClient.get<JixiaoDashboardApi.FilterOptions>(
    '/fdmperformance/dashboard/filter-options',
    { params },
  );
}

export function getDashboardOverview(params: JixiaoDashboardApi.QueryParams) {
  return requestClient.get<JixiaoDashboardApi.Overview>(
    '/fdmperformance/dashboard/overview',
    { params },
  );
}

export function getDashboardEmployeeHistoryPage(
  params: JixiaoDashboardApi.QueryParams,
) {
  return requestClient.get<PageResult<JixiaoDashboardApi.EmployeeHistory>>(
    '/fdmperformance/dashboard/employee-history/page',
    { params },
  );
}

export function getDashboardPersonSummary(
  params: JixiaoDashboardApi.PersonQueryParams,
) {
  return requestClient.get<JixiaoDashboardApi.PersonSummary>(
    '/fdmperformance/dashboard/person/summary',
    { params },
  );
}

export function getDashboardPersonHistoryPage(
  params: JixiaoDashboardApi.PersonQueryParams,
) {
  return requestClient.get<PageResult<JixiaoDashboardApi.EmployeeHistory>>(
    '/fdmperformance/dashboard/person/history-page',
    { params },
  );
}

export function getDashboardPersonGradeLogPage(
  params: JixiaoDashboardApi.PersonGradeLogPageParams,
) {
  return requestClient.get<PageResult<JixiaoDashboardApi.GradeLog>>(
    '/fdmperformance/dashboard/person/grade-log/page',
    { params },
  );
}
