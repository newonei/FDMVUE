import type { PageParam, PageResult } from '@vben/request';

import { requestClient } from '#/api/request';

export namespace FdmPerformanceActionPlanApi {
  export type ActionPlanStatus = 0 | 1 | 2 | 3;

  export interface ActionPlan {
    assigneeUserId?: number;
    assigneeUserName?: string;
    createTime?: string;
    deadline?: string;
    goalId?: number;
    goalName?: string;
    id?: number;
    name: string;
    progress?: number;
    remark?: string;
    sourceId?: number;
    sourceType?: number;
    status?: ActionPlanStatus;
    updateTime?: string;
  }

  export type ActionPlanPageParams = PageParam & {
    assigneeUserId?: number;
    createTime?: string[];
    goalId?: number;
    name?: string;
    status?: ActionPlanStatus;
  };

  export type ActionPlanSaveReq = Omit<ActionPlan, 'createTime' | 'goalName' | 'updateTime'>;
}

export function getFdmPerformanceActionPlanPage(
  params: FdmPerformanceActionPlanApi.ActionPlanPageParams,
) {
  return requestClient.get<PageResult<FdmPerformanceActionPlanApi.ActionPlan>>(
    '/fdmperformance/action-plan/page',
    { params },
  );
}

export function getFdmPerformanceActionPlan(id: number) {
  return requestClient.get<FdmPerformanceActionPlanApi.ActionPlan>(
    `/fdmperformance/action-plan/get?id=${id}`,
  );
}

export function createFdmPerformanceActionPlan(
  data: FdmPerformanceActionPlanApi.ActionPlanSaveReq,
) {
  return requestClient.post<number>('/fdmperformance/action-plan/create', data);
}

export function updateFdmPerformanceActionPlan(
  data: FdmPerformanceActionPlanApi.ActionPlanSaveReq,
) {
  return requestClient.put<boolean>('/fdmperformance/action-plan/update', data);
}

export function updateFdmPerformanceActionPlanStatus(
  id: number,
  status: FdmPerformanceActionPlanApi.ActionPlanStatus,
) {
  return requestClient.put<boolean>('/fdmperformance/action-plan/update-status', {
    id,
    status,
  });
}

export function deleteFdmPerformanceActionPlan(id: number) {
  return requestClient.delete<boolean>(
    `/fdmperformance/action-plan/delete?id=${id}`,
  );
}
