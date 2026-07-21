import type { PageParam, PageResult } from '@vben/request';

import { requestClient } from '#/api/request';

export namespace JixiaoApi {
  export interface Indicator {
    createTime?: string;
    defaultWeight?: number | string;
    deptId?: number;
    dimensionName?: string;
    id?: number;
    name?: string;
    remark?: string;
    scoreMethod?: string;
    standard?: string;
    status?: number;
  }

  export type IndicatorPageParams = PageParam & {
    deptId?: number;
    dimensionName?: string;
    name?: string;
    status?: number;
  };

  export interface TemplatePerson {
    deptId?: number;
    id?: number;
    superiorSupervisorUserId?: number;
    superiorSupervisorUserName?: string;
    supervisorUserId?: number;
    supervisorUserName?: string;
    userId?: number;
    userName?: string;
  }

  export interface TemplateIndicator {
    actionPlanEnabled?: boolean;
    dimensionId?: number;
    dimensionName?: string;
    id?: number;
    indicatorId?: number;
    name?: string;
    scoreMethod?: string;
    sort?: number;
    standard?: string;
    status?: number;
    templateId?: number;
    weight?: number;
  }

  export interface TemplateDimension {
    id?: number;
    indicators?: TemplateIndicator[];
    name?: string;
    remark?: string;
    sort?: number;
    templateId?: number;
    weight?: number;
  }

  export interface Template {
    createTime?: string;
    dimensions?: TemplateDimension[];
    id?: number;
    name?: string;
    periodType?: string;
    persons?: TemplatePerson[];
    processDefinitionKey?: string;
    remark?: string;
    status?: number;
  }

  export type TemplatePageParams = PageParam & {
    name?: string;
    periodType?: string;
    status?: number;
  };

  export interface TemplateSelectItem {
    deptIds: number[];
    deptNames: string[];
    id: number;
    indicatorCount: number;
    name: string;
    periodType: string;
    personCount: number;
    updateTime?: string;
  }

  export type TemplateSelectPageParams = PageParam & {
    deptId?: number;
    keyword?: string;
    periodType?: string;
  };

  export interface LaunchReq {
    endDate?: string;
    name: string;
    periodKey: string;
    remark?: string;
    startDate?: string;
    templateId: number;
  }

  export interface LaunchBatchItem {
    name: string;
    periodKey: string;
    templateId: number;
  }

  export interface LaunchBatchReq {
    endDate?: string;
    items: LaunchBatchItem[];
    remark?: string;
    startDate?: string;
  }

  export interface LaunchPreview {
    dimensions?: TemplateDimension[];
    periodType?: string;
    persons?: TemplatePerson[];
    processDefinitionKey?: string;
    templateId?: number;
    templateName?: string;
  }

  export interface Batch {
    createTime?: string;
    creatorUserId?: number;
    creatorUserName?: string;
    endDate?: string;
    id?: number;
    name?: string;
    periodKey?: string;
    periodType?: string;
    remark?: string;
    startDate?: string;
    status?: number;
    templateId?: number;
    templateName?: string;
    totalCount?: number;
  }

  export type BatchPageParams = PageParam & {
    name?: string;
    periodKey?: string;
    status?: number;
    templateId?: number;
  };

  export interface InstanceIndicator {
    actionPlanCompletedTime?: string;
    actionPlanCompletedUserId?: number;
    actionPlanCompletedUserName?: string;
    actionPlanEnabled?: boolean;
    actionPlanStatus?: number;
    dimensionName?: string;
    id?: number;
    indicatorId?: number;
    instanceId?: number;
    name?: string;
    scoreMethod?: string;
    sort?: number;
    standard?: string;
    templateIndicatorId?: number;
    weight?: number;
  }

  export interface Score {
    comment?: string;
    id?: number;
    instanceId?: number;
    instanceIndicatorId?: number;
    score?: number;
    scoreType?: string;
    scorerUserId?: number;
    scorerUserName?: string;
  }

  export interface Result {
    employeeConfirmed?: boolean;
    finalScore?: number;
    grade?: string;
    id?: number;
    instanceId?: number;
    periodKey?: string;
    publicStatus?: number;
    publicTime?: string;
    supervisorUserId?: number;
    supervisorUserName?: string;
    userId?: number;
    userName?: string;
  }

  export interface Instance {
    batchId?: number;
    currentTaskId?: string;
    currentTaskAssigneeUserId?: number;
    currentTaskAssigneeUserName?: string;
    currentTaskKey?: string;
    currentTaskName?: string;
    deptId?: number;
    deptName?: string;
    finalScore?: number;
    finishTime?: string;
    grade?: string;
    id?: number;
    indicators?: InstanceIndicator[];
    managerScoreEnabled?: boolean;
    periodKey?: string;
    processDefinitionKey?: string;
    processInstanceId?: string;
    publicTime?: string;
    result?: Result;
    scores?: Score[];
    status?: number;
    superiorSupervisorUserId?: number;
    superiorSupervisorUserName?: string;
    supervisorUserId?: number;
    supervisorUserName?: string;
    templateId?: number;
    templateName?: string;
    userId?: number;
    userName?: string;
  }

  export type InstancePageParams = PageParam & {
    batchId?: number;
    periodKey?: string;
    status?: number;
    supervisorUserId?: number;
    userId?: number;
  };

  export interface TaskReq {
    instanceId: number;
    reason?: string;
    taskId: string;
  }

  export interface IndicatorActionCompleteReq {
    instanceIndicatorId: number;
  }

  export interface TaskTransferReq {
    assigneeUserId: number;
    instanceId: number;
    reason: string;
    taskId: string;
  }

  export interface TaskReturnNode {
    name: string;
    taskDefinitionKey: string;
  }

  export interface TaskReturnReq {
    instanceId: number;
    reason: string;
    targetTaskDefinitionKey: string;
    taskId?: string;
  }

  export interface ScoreItemReq {
    comment?: string;
    instanceIndicatorId: number;
    score: number;
  }

  export interface ScoreSubmitReq {
    instanceId: number;
    items: ScoreItemReq[];
    reason?: string;
    taskId: string;
  }

  export interface HrReviewReq {
    approved?: boolean;
    instanceId: number;
    reason?: string;
    taskId: string;
  }

  export type HrReviewPendingPageParams = PageParam;

  export interface HrReviewPendingItem {
    batchId?: number;
    batchName?: string;
    finalScore?: number;
    instanceId?: number;
    periodKey?: string;
    supervisorUserId?: number;
    supervisorUserName?: string;
    taskAssigneeUserId?: number;
    taskAssigneeUserName?: string;
    taskId?: string;
    templateName?: string;
    userId?: number;
    userName?: string;
  }

  export interface HrReviewBatchReq {
    instanceIds: number[];
  }

  export type ResultPageParams = PageParam & {
    batchId?: number;
    grade?: string;
    periodKey?: string;
    publicStatus?: number;
    userId?: number;
  };

  export interface GradeAdjustReq {
    grade: string;
    reason: string;
    resultId: number;
  }

  export interface ResultPublishReq {
    resultId: number;
  }

  export interface ResultBatchPublishReq {
    resultIds: number[];
  }

  export interface GradeLog {
    createTime?: string;
    id?: number;
    instanceId?: number;
    newGrade?: string;
    oldGrade?: string;
    operatorUserId?: number;
    operatorUserName?: string;
    reason?: string;
    resultId?: number;
    userId?: number;
    userName?: string;
  }

  export type GradeLogPageParams = PageParam & {
    instanceId?: number;
    resultId?: number;
  };

  export interface Review {
    bossUserId?: number;
    bossUserName?: string;
    createTime?: string;
    generalManagerUserId?: number;
    generalManagerUserName?: string;
    id?: number;
    closedTime?: string;
    employeeConfirmedTime?: string;
    employeeConfirmedUserId?: number;
    employeeConfirmedUserName?: string;
    improvementPlan?: string;
    instanceId?: number;
    missedIndicators?: string;
    reasonAnalysis?: string;
    resultId?: number;
    status?: number;
    submittedTime?: string;
    supervisorSubmittedUserId?: number;
    supervisorSubmittedUserName?: string;
    superiorSupervisorUserId?: number;
    superiorSupervisorUserName?: string;
    supervisorUserId?: number;
    supervisorUserName?: string;
    supportNeeded?: string;
    triggerGrade?: string;
    userId?: number;
    userName?: string;
    workCompletion?: string;
  }

  export type ReviewPageParams = PageParam & {
    periodKey?: string;
    status?: number;
    userId?: number;
  };

  export interface ReviewSubmitReq {
    improvementPlan: string;
    missedIndicators: string;
    reasonAnalysis: string;
    reviewId: number;
    supportNeeded: string;
    workCompletion: string;
  }

  export interface ReviewConfirmReq {
    reviewId: number;
  }

  export interface Setting {
    bossUserId?: number;
    bossUserName?: string;
    detailUrlPrefix?: string;
    dingtalkTodoEnabled?: boolean;
    generalManagerUserId?: number;
    generalManagerUserName?: string;
    hrUserIds?: number[];
    hrUserNames?: Record<number, string>;
  }
}

export function getIndicatorPage(params: JixiaoApi.IndicatorPageParams) {
  return requestClient.get<PageResult<JixiaoApi.Indicator>>(
    '/fdmperformance/indicator/page',
    { params },
  );
}

export function getIndicator(id: number) {
  return requestClient.get<JixiaoApi.Indicator>(
    '/fdmperformance/indicator/get',
    {
      params: { id },
    },
  );
}

export function getEnabledIndicators() {
  return requestClient.get<JixiaoApi.Indicator[]>(
    '/fdmperformance/indicator/simple-list',
  );
}

export function createIndicator(data: JixiaoApi.Indicator) {
  return requestClient.post<number>('/fdmperformance/indicator/create', data);
}

export function updateIndicator(data: JixiaoApi.Indicator) {
  return requestClient.put<boolean>('/fdmperformance/indicator/update', data);
}

export function deleteIndicator(id: number) {
  return requestClient.delete<boolean>(
    `/fdmperformance/indicator/delete?id=${id}`,
  );
}

export function getTemplatePage(params: JixiaoApi.TemplatePageParams) {
  return requestClient.get<PageResult<JixiaoApi.Template>>(
    '/fdmperformance/template/page',
    { params },
  );
}

export function getTemplate(id: number) {
  return requestClient.get<JixiaoApi.Template>('/fdmperformance/template/get', {
    params: { id },
  });
}

export function getEnabledTemplates() {
  return requestClient.get<JixiaoApi.Template[]>(
    '/fdmperformance/template/simple-list',
  );
}

export function getTemplateSelectPage(
  params: JixiaoApi.TemplateSelectPageParams,
) {
  return requestClient.get<PageResult<JixiaoApi.TemplateSelectItem>>(
    '/fdmperformance/template/select-page',
    { params },
  );
}

export function saveTemplate(data: JixiaoApi.Template) {
  return requestClient.post<number>('/fdmperformance/template/save', data);
}

export function deleteTemplate(id: number) {
  return requestClient.delete<boolean>(
    `/fdmperformance/template/delete?id=${id}`,
  );
}

export function enableTemplate(id: number) {
  return requestClient.put<boolean>(`/fdmperformance/template/enable?id=${id}`);
}

export function disableTemplate(id: number) {
  return requestClient.put<boolean>(
    `/fdmperformance/template/disable?id=${id}`,
  );
}

export function validateTemplateProcess(id: number) {
  return requestClient.get<boolean>(
    '/fdmperformance/template/validate-process',
    {
      params: { id },
    },
  );
}

export function getLaunchPreview(templateId: number) {
  return requestClient.get<JixiaoApi.LaunchPreview>(
    '/fdmperformance/assessment/launch-preview',
    { params: { templateId } },
  );
}

export function launchAssessment(data: JixiaoApi.LaunchReq) {
  return requestClient.post<number>('/fdmperformance/assessment/launch', data);
}

export function batchLaunchAssessments(data: JixiaoApi.LaunchBatchReq) {
  return requestClient.post<number[]>(
    '/fdmperformance/assessment/launch-batch',
    data,
  );
}

export function getBatchPage(params: JixiaoApi.BatchPageParams) {
  return requestClient.get<PageResult<JixiaoApi.Batch>>(
    '/fdmperformance/assessment/batch/page',
    { params },
  );
}

export function getBatch(id: number) {
  return requestClient.get<JixiaoApi.Batch>(
    '/fdmperformance/assessment/batch/get',
    {
      params: { id },
    },
  );
}

export function deleteBatch(id: number) {
  return requestClient.delete<boolean>(
    `/fdmperformance/assessment/batch/delete?id=${id}`,
  );
}

export function getInstancePage(params: JixiaoApi.InstancePageParams) {
  return requestClient.get<PageResult<JixiaoApi.Instance>>(
    '/fdmperformance/assessment/instance/page',
    { params },
  );
}

export function getMyInstancePage(params: JixiaoApi.InstancePageParams) {
  return requestClient.get<PageResult<JixiaoApi.Instance>>(
    '/fdmperformance/assessment/instance/my-page',
    { params },
  );
}

export function deleteInstance(id: number) {
  return requestClient.delete<boolean>(
    `/fdmperformance/assessment/instance/delete?id=${id}`,
  );
}

export function getInstance(id: number) {
  return requestClient.get<JixiaoApi.Instance>(
    '/fdmperformance/assessment/instance/get',
    { params: { id } },
  );
}

export function confirmIndicatorTask(data: JixiaoApi.TaskReq) {
  return requestClient.post<boolean>(
    '/fdmperformance/assessment/task/indicator-confirm',
    data,
  );
}

export function completeIndicatorAction(
  data: JixiaoApi.IndicatorActionCompleteReq,
) {
  return requestClient.post<boolean>(
    '/fdmperformance/assessment/indicator-action/complete',
    data,
  );
}

export function submitSelfScore(data: JixiaoApi.ScoreSubmitReq) {
  return requestClient.post<boolean>(
    '/fdmperformance/assessment/task/self-score',
    data,
  );
}

export function submitSupervisorScore(data: JixiaoApi.ScoreSubmitReq) {
  return requestClient.post<boolean>(
    '/fdmperformance/assessment/task/supervisor-score',
    data,
  );
}

export function submitManagerScore(data: JixiaoApi.ScoreSubmitReq) {
  return requestClient.post<boolean>(
    '/fdmperformance/assessment/task/manager-score',
    data,
  );
}

export function submitHrReview(data: JixiaoApi.HrReviewReq) {
  return requestClient.post<boolean>(
    '/fdmperformance/assessment/task/hr-review',
    data,
  );
}

export function getHrReviewPendingPage(
  params: JixiaoApi.HrReviewPendingPageParams,
) {
  return requestClient.get<PageResult<JixiaoApi.HrReviewPendingItem>>(
    '/fdmperformance/assessment/hr-review/pending-page',
    { params },
  );
}

export function batchHrReview(data: JixiaoApi.HrReviewBatchReq) {
  return requestClient.post<boolean>(
    '/fdmperformance/assessment/task/hr-review/batch',
    data,
  );
}

export function confirmEmployeeResult(data: JixiaoApi.TaskReq) {
  return requestClient.post<boolean>(
    '/fdmperformance/assessment/task/employee-confirm',
    data,
  );
}

export function transferTask(data: JixiaoApi.TaskTransferReq) {
  return requestClient.post<boolean>(
    '/fdmperformance/assessment/task/transfer',
    data,
  );
}

export function getReturnableTaskNodes(instanceId: number) {
  return requestClient.get<JixiaoApi.TaskReturnNode[]>(
    '/fdmperformance/assessment/task/returnable-nodes',
    { params: { instanceId } },
  );
}

export function returnTask(data: JixiaoApi.TaskReturnReq) {
  return requestClient.post<boolean>(
    '/fdmperformance/assessment/task/return',
    data,
  );
}

export function getResultPage(params: JixiaoApi.ResultPageParams) {
  return requestClient.get<PageResult<JixiaoApi.Result>>(
    '/fdmperformance/result/page',
    { params },
  );
}

export function getMyResults() {
  return requestClient.get<JixiaoApi.Result[]>(
    '/fdmperformance/result/my-list',
  );
}

export function adjustGrade(data: JixiaoApi.GradeAdjustReq) {
  return requestClient.post<boolean>(
    '/fdmperformance/result/grade-adjust',
    data,
  );
}

export function publishResult(data: JixiaoApi.ResultPublishReq) {
  return requestClient.post<boolean>('/fdmperformance/result/publish', data);
}

export function batchPublishResults(data: JixiaoApi.ResultBatchPublishReq) {
  return requestClient.post<boolean>(
    '/fdmperformance/result/batch-publish',
    data,
  );
}

export function getGradeLogPage(params: JixiaoApi.GradeLogPageParams) {
  return requestClient.get<PageResult<JixiaoApi.GradeLog>>(
    '/fdmperformance/result/grade-log/page',
    { params },
  );
}

export function getReviewPage(params: JixiaoApi.ReviewPageParams) {
  return requestClient.get<PageResult<JixiaoApi.Review>>(
    '/fdmperformance/review/page',
    { params },
  );
}

export function getReview(id: number) {
  return requestClient.get<JixiaoApi.Review>('/fdmperformance/review/get', {
    params: { id },
  });
}

export function getMyPendingReviews() {
  return requestClient.get<JixiaoApi.Review[]>(
    '/fdmperformance/review/my-pending-confirm',
  );
}

export function getMyPendingSupervisorReviews() {
  return requestClient.get<JixiaoApi.Review[]>(
    '/fdmperformance/review/my-pending-supervisor',
  );
}

export function submitReview(data: JixiaoApi.ReviewSubmitReq) {
  return requestClient.post<boolean>('/fdmperformance/review/submit', data);
}

export function confirmReview(data: JixiaoApi.ReviewConfirmReq) {
  return requestClient.post<boolean>('/fdmperformance/review/confirm', data);
}

export function getSetting() {
  return requestClient.get<JixiaoApi.Setting>('/fdmperformance/setting/get');
}

export function saveSetting(data: JixiaoApi.Setting) {
  return requestClient.post<boolean>('/fdmperformance/setting/save', data);
}
