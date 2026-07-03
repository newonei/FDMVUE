import type { PageParam, PageResult } from '@vben/request';

import { requestClient } from '#/api/request';

export namespace FdmPerformanceAssessmentApi {
  export interface Participant {
    deptId?: number;
    deptName?: string;
    postId?: number;
    postName?: string;
    userId: number;
    userName?: string;
  }

  export interface LaunchReq {
    name?: string;
    participants?: Participant[];
    periodEndDate?: string;
    periodKey: string;
    periodStartDate?: string;
    periodType: number;
    templateIds: number[];
  }

  export interface HistoryImportReq {
    defaultScore?: number;
    name?: string;
    periodKey?: string;
    periodType?: number;
    templateIds?: number[];
  }

  export type BatchPageParams = PageParam & {
    name?: string;
    periodKey?: string;
    periodType?: number;
    status?: number;
  };

  export interface Batch {
    createTime?: string;
    finishedCount?: number;
    id: number;
    instanceCount?: number;
    launchTime?: string;
    launcherUserId?: number;
    name?: string;
    periodEndDate?: string;
    periodKey?: string;
    periodStartDate?: string;
    periodType?: number;
    status?: number;
    templateIds?: number[];
  }

  export type InstancePageParams = PageParam & {
    batchId?: number;
    status?: number;
    templateId?: number;
    userId?: number;
    userName?: string;
  };

  export interface Score {
    attachmentIds?: string;
    coefficient?: number;
    dimensionId?: number;
    id?: number;
    nodeKey?: string;
    nodeName?: string;
    score?: number;
    scoreComment?: string;
    scoreWeight?: number;
    scorerRoleType?: number;
    scorerUserId?: number;
    status?: number;
    submitTime?: string;
    taskId?: number;
    templateIndicatorId?: number;
  }

  export interface ScoreSummary {
    comment?: string;
    nodeKey?: string;
    nodeName?: string;
    scoreWeight?: number;
    scorerRoleType?: number;
    scorerUserId?: number;
    submitTime?: string;
    taskId?: number;
    taskType?: number;
    totalScore?: number;
  }

  export interface Instance {
    batchId?: number;
    batchName?: string;
    coefficient?: number;
    currentNodeKey?: string;
    currentNodeName?: string;
    deptId?: number;
    deptName?: string;
    finalScore?: number;
    flowSnapshotJson?: string;
    gradeName?: string;
    id: number;
    interviewRecords?: ChangeLog[];
    performanceSalary?: number;
    periodKey?: string;
    periodType?: number;
    postId?: number;
    postName?: string;
    progressCurrent?: number;
    progressTotal?: number;
    resultConfirmed?: boolean;
    resultObjections?: ChangeLog[];
    resultVisible?: boolean;
    resultVisibleTime?: string;
    scores?: Score[];
    scoreSummaries?: ScoreSummary[];
    status?: number;
    templateId?: number;
    templateSnapshotJson?: string;
    userId?: number;
    userName?: string;
  }

  export type TaskPageParams = PageParam & {
    assigneeUserId?: number;
    batchId?: number;
    instanceId?: number;
    status?: number;
    taskType?: number;
  };

  export interface Task {
    assigneeUserId?: number;
    batchId?: number;
    dueTime?: string;
    finishComment?: string;
    finishTime?: string;
    id: number;
    instanceId?: number;
    nodeKey?: string;
    nodeName?: string;
    status?: number;
    taskType?: number;
    templateId?: number;
  }

  export interface ScoreItemReq {
    attachmentIds?: string;
    coefficient?: number;
    dimensionId?: number;
    score?: number;
    scoreComment?: string;
    templateIndicatorId?: number;
  }

  export interface ScoreSubmitReq {
    comment?: string;
    instanceId: number;
    items: ScoreItemReq[];
    nextAssigneeUserId?: number;
    scorerRoleType?: number;
    scorerUserId?: number;
    taskId?: number;
  }

  export interface HrReviewReq {
    comment?: string;
    instanceId: number;
  }

  export interface ResultPublishReq {
    batchId: number;
    instanceIds?: number[];
  }

  export interface CancelReq {
    batchId: number;
    reason?: string;
  }

  export interface StopReq {
    batchId?: number;
    reason?: string;
    userId: number;
  }

  export interface TransferReq {
    batchId?: number;
    fromUserId: number;
    reason?: string;
    toUserId: number;
  }

  export interface RemindReq {
    assigneeUserId?: number;
    batchId: number;
    instanceIds?: number[];
    message?: string;
  }

  export interface InterviewReq {
    conclusion: string;
    instanceId: number;
  }

  export interface ResultObjectionReq {
    instanceId: number;
    reason: string;
  }

  export type ResultPageParams = PageParam & {
    batchId?: number;
    templateId?: number;
    userId?: number;
  };

  export interface Result {
    batchId?: number;
    coefficient?: number;
    confirmed?: boolean;
    confirmedTime?: string;
    gradeName?: string;
    hrReviewComment?: string;
    hrReviewTime?: string;
    hrReviewerId?: number;
    id: number;
    instanceId?: number;
    performanceSalary?: number;
    resultJson?: string;
    resultVisible?: boolean;
    templateId?: number;
    totalScore?: number;
    userId?: number;
  }

  export type ChangeLogPageParams = PageParam & {
    batchId?: number;
    instanceId?: number;
    operationType?: string;
    operatorUserId?: number;
  };

  export interface ChangeLog {
    afterJson?: string;
    batchId?: number;
    beforeJson?: string;
    createTime?: string;
    id: number;
    instanceId?: number;
    operationType?: string;
    operatorUserId?: number;
    reason?: string;
    targetId?: number;
    targetTable?: string;
  }
}

export function launchFdmPerformanceAssessment(
  data: FdmPerformanceAssessmentApi.LaunchReq,
) {
  return requestClient.post<number>('/fdmperformance/assessment/launch', data);
}

export function importFdmPerformanceAssessmentHistory(
  data: FdmPerformanceAssessmentApi.HistoryImportReq = {},
) {
  return requestClient.post<number>(
    '/fdmperformance/assessment/history/import',
    data,
  );
}

export function getFdmPerformanceAssessmentBatchPage(
  params: FdmPerformanceAssessmentApi.BatchPageParams,
) {
  return requestClient.get<PageResult<FdmPerformanceAssessmentApi.Batch>>(
    '/fdmperformance/assessment/batch/page',
    { params },
  );
}

export function getFdmPerformanceAssessmentBatch(id: number) {
  return requestClient.get<FdmPerformanceAssessmentApi.Batch>(
    '/fdmperformance/assessment/batch/get',
    { params: { id } },
  );
}

export function deleteFdmPerformanceAssessmentBatch(id: number) {
  return requestClient.delete<boolean>(
    `/fdmperformance/assessment/batch/delete?id=${id}`,
  );
}

export function getFdmPerformanceAssessmentInstancePage(
  params: FdmPerformanceAssessmentApi.InstancePageParams,
) {
  return requestClient.get<PageResult<FdmPerformanceAssessmentApi.Instance>>(
    '/fdmperformance/assessment/instance/page',
    { params: normalizePageParams(params) },
  );
}

export function getMyFdmPerformanceAssessmentInstancePage(
  params: Omit<FdmPerformanceAssessmentApi.InstancePageParams, 'userId'>,
) {
  return requestClient.get<PageResult<FdmPerformanceAssessmentApi.Instance>>(
    '/fdmperformance/assessment/instance/my-page',
    { params: normalizePageParams(params) },
  );
}

function normalizePageParams<T extends { pageSize?: number }>(params: T): T {
  const pageSize = Number(params.pageSize);
  if (Number.isFinite(pageSize) && pageSize > 200) {
    return { ...params, pageSize: -1 };
  }
  return params;
}

export function getFdmPerformanceAssessmentInstance(id: number) {
  return requestClient.get<FdmPerformanceAssessmentApi.Instance>(
    '/fdmperformance/assessment/instance/get',
    { params: { id } },
  );
}

export function getMyFdmPerformanceAssessmentInstance(id: number) {
  return requestClient.get<FdmPerformanceAssessmentApi.Instance>(
    '/fdmperformance/assessment/instance/my-get',
    { params: { id } },
  );
}

export function getFdmPerformanceAssessmentTaskPage(
  params: FdmPerformanceAssessmentApi.TaskPageParams,
) {
  return requestClient.get<PageResult<FdmPerformanceAssessmentApi.Task>>(
    '/fdmperformance/assessment/task/page',
    { params },
  );
}

export function confirmFdmPerformanceAssessmentIndicators(instanceId: number) {
  return requestClient.post<boolean>(
    `/fdmperformance/assessment/indicator/confirm?instanceId=${instanceId}`,
  );
}

export function confirmMyFdmPerformanceAssessmentIndicators(instanceId: number) {
  return requestClient.post<boolean>(
    `/fdmperformance/assessment/my/indicator/confirm?instanceId=${instanceId}`,
  );
}

export function startFdmPerformanceAssessmentScoring(batchId: number) {
  return requestClient.post<boolean>(
    `/fdmperformance/assessment/score/start?batchId=${batchId}`,
  );
}

export function submitFdmPerformanceAssessmentScore(
  data: FdmPerformanceAssessmentApi.ScoreSubmitReq,
) {
  return requestClient.post<boolean>(
    '/fdmperformance/assessment/score/submit',
    data,
  );
}

export function submitMyFdmPerformanceAssessmentScore(
  data: FdmPerformanceAssessmentApi.ScoreSubmitReq,
) {
  return requestClient.post<boolean>(
    '/fdmperformance/assessment/my/score/submit',
    data,
  );
}

export function submitFdmPerformanceAssessmentHrReview(
  data: FdmPerformanceAssessmentApi.HrReviewReq,
) {
  return requestClient.post<boolean>(
    '/fdmperformance/assessment/hr-review',
    data,
  );
}

export function publishFdmPerformanceAssessmentResult(
  batchId: number,
  instanceIds?: number[],
) {
  return requestClient.post<boolean>('/fdmperformance/assessment/result/publish', {
    batchId,
    instanceIds,
  });
}

export function confirmFdmPerformanceAssessmentResult(instanceId: number) {
  return requestClient.post<boolean>('/fdmperformance/assessment/result/confirm', {
    instanceId,
  });
}

export function confirmMyFdmPerformanceAssessmentResult(instanceId: number) {
  return requestClient.post<boolean>('/fdmperformance/assessment/my/result/confirm', {
    instanceId,
  });
}

export function recordFdmPerformanceAssessmentInterview(
  data: FdmPerformanceAssessmentApi.InterviewReq,
) {
  return requestClient.post<boolean>(
    '/fdmperformance/assessment/interview/record',
    data,
  );
}

export function submitFdmPerformanceAssessmentResultObjection(
  data: FdmPerformanceAssessmentApi.ResultObjectionReq,
) {
  return requestClient.post<boolean>(
    '/fdmperformance/assessment/result/objection',
    data,
  );
}

export function submitMyFdmPerformanceAssessmentResultObjection(
  data: FdmPerformanceAssessmentApi.ResultObjectionReq,
) {
  return requestClient.post<boolean>(
    '/fdmperformance/assessment/my/result/objection',
    data,
  );
}

export function cancelFdmPerformanceAssessment(
  data: FdmPerformanceAssessmentApi.CancelReq,
) {
  return requestClient.post<boolean>(
    '/fdmperformance/assessment/batch/cancel',
    data,
  );
}

export function stopFdmPerformanceAssessmentInstances(
  data: FdmPerformanceAssessmentApi.StopReq,
) {
  return requestClient.post<number>(
    '/fdmperformance/assessment/instance/stop',
    data,
  );
}

export function transferFdmPerformanceAssessmentTasks(
  data: FdmPerformanceAssessmentApi.TransferReq,
) {
  return requestClient.post<number>(
    '/fdmperformance/assessment/task/transfer',
    data,
  );
}

export function remindFdmPerformanceAssessmentTasks(
  data: FdmPerformanceAssessmentApi.RemindReq,
) {
  return requestClient.post<number>(
    '/fdmperformance/assessment/task/remind',
    data,
  );
}

export function getFdmPerformanceAssessmentResultPage(
  params: FdmPerformanceAssessmentApi.ResultPageParams,
) {
  return requestClient.get<PageResult<FdmPerformanceAssessmentApi.Result>>(
    '/fdmperformance/assessment/result/page',
    { params },
  );
}

export function getFdmPerformanceAssessmentChangeLogPage(
  params: FdmPerformanceAssessmentApi.ChangeLogPageParams,
) {
  return requestClient.get<PageResult<FdmPerformanceAssessmentApi.ChangeLog>>(
    '/fdmperformance/assessment/change-log/page',
    { params },
  );
}

export function getMyFdmPerformanceAssessmentResultList() {
  return requestClient.get<FdmPerformanceAssessmentApi.Result[]>(
    '/fdmperformance/assessment/result/my-list',
  );
}
