import type { PageParam, PageResult } from '@vben/request';

import { requestClient } from '#/api/request';

export namespace FdmPerformanceGoalApi {
  export type GoalStatus = 0 | 1 | 2;

  export interface Goal {
    createTime?: string;
    deptId?: number;
    deptName?: string;
    id?: number;
    linkedIndicatorIds?: number[];
    name: string;
    ownerUserId?: number;
    ownerUserName?: string;
    progress?: number;
    remark?: string;
    status?: GoalStatus;
    targetValue: string;
    updateTime?: string;
  }

  export type GoalPageParams = PageParam & {
    createTime?: string[];
    deptId?: number;
    name?: string;
    ownerUserId?: number;
    status?: GoalStatus;
  };

  export type GoalSaveReq = Omit<Goal, 'createTime' | 'updateTime'>;
}

export function getFdmPerformanceGoalPage(
  params: FdmPerformanceGoalApi.GoalPageParams,
) {
  return requestClient.get<PageResult<FdmPerformanceGoalApi.Goal>>(
    '/fdmperformance/goal/page',
    { params },
  );
}

export function getFdmPerformanceGoalList() {
  return requestClient.get<FdmPerformanceGoalApi.Goal[]>(
    '/fdmperformance/goal/list',
  );
}

export function getFdmPerformanceGoal(id: number) {
  return requestClient.get<FdmPerformanceGoalApi.Goal>(
    `/fdmperformance/goal/get?id=${id}`,
  );
}

export function createFdmPerformanceGoal(
  data: FdmPerformanceGoalApi.GoalSaveReq,
) {
  return requestClient.post<number>('/fdmperformance/goal/create', data);
}

export function updateFdmPerformanceGoal(
  data: FdmPerformanceGoalApi.GoalSaveReq,
) {
  return requestClient.put<boolean>('/fdmperformance/goal/update', data);
}

export function deleteFdmPerformanceGoal(id: number) {
  return requestClient.delete<boolean>(`/fdmperformance/goal/delete?id=${id}`);
}

export function createFdmPerformanceActionPlanFromGoal(goalId: number) {
  return requestClient.post<number>(
    `/fdmperformance/goal/create-action-plan?goalId=${goalId}`,
  );
}
