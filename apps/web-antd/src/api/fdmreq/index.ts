import { requestClient } from '#/api/request';

export type FdmReqStatus =
  | 'PENDING_ANALYSIS'
  | 'PENDING_SUPPLEMENT'
  | 'PENDING_CONFIRM'
  | 'APPROVED_PENDING_DEV'
  | 'DEVELOPING'
  | 'TESTING'
  | 'PUSHED_CHECKING'
  | 'PENDING_ACCEPTANCE'
  | 'ACCEPTED'
  | 'BLOCKED'
  | 'CANCELLED';

export namespace FdmReqApi {
  export interface Requirement {
    id?: number;
    reqNo: string;
    title: string;
    rawDescription?: string;
    submitterId?: string;
    status: FdmReqStatus | string;
    currentVersionId?: number;
    createTime?: string;
    updateTime?: string;
  }

  export interface RequirementVersion {
    id?: number;
    reqNo?: string;
    versionNo: string;
    contentJson?: string;
    snapshotHash?: string;
    createdBy?: string;
    createTime?: string;
  }

  export interface Approval {
    id?: number;
    reqNo?: string;
    versionId?: number;
    snapshotHash?: string;
    approverId?: string;
    approvedAt?: string;
    allowedScopeJson?: string;
  }

  export interface DevTask {
    id?: number;
    taskNo?: string;
    reqNo?: string;
    versionId?: number;
    approvalId?: number;
    status?: string;
    branchName?: string;
    commitSha?: string;
    prUrl?: string;
    heartbeatAt?: string;
    logExcerpt?: string;
    failReason?: string;
    retryCount?: number;
  }

  export interface TestReport {
    id?: number;
    reqNo?: string;
    versionId?: number;
    taskId?: number;
    commitSha?: string;
    commandsJson?: string;
    result?: string;
    skippedReason?: string;
    evidenceJson?: string;
    residualRisk?: string;
    createTime?: string;
  }

  export interface RequirementDetail {
    requirement: Requirement;
    versions: RequirementVersion[];
    approvals: Approval[];
    tasks: DevTask[];
    reports: TestReport[];
  }

  export interface CreateRequirementParams {
    reqNo: string;
    title: string;
    rawDescription: string;
    submitterId?: string;
  }

  export interface UpdateRequirementParams {
    title?: string;
  }

  export interface CreateVersionParams {
    versionNo: string;
    contentJson: string;
    createdBy?: string;
  }

  export interface ApproveParams {
    versionId: number;
    approverId?: string;
    allowedScopeJson?: string;
  }

  export interface CreateTaskParams {
    versionId: number;
    approvalId: number;
    branchName?: string;
  }

  export interface CallbackParams {
    status?: string;
    branchName?: string;
    commitSha?: string;
    prUrl?: string;
    logExcerpt?: string;
    failReason?: string;
  }

  export interface CreateReportParams {
    versionId: number;
    taskId: number;
    commitSha?: string;
    commandsJson: string;
    result: 'PASS' | 'FAIL' | 'SKIPPED' | string;
    skippedReason?: string;
    evidenceJson?: string;
    residualRisk?: string;
  }
}

export function listRequirements(status?: string) {
  return requestClient.get<FdmReqApi.Requirement[]>('/fdmreq/requirements', {
    params: status ? { status } : undefined,
  });
}

export function getRequirementDetail(reqNo: string) {
  return requestClient.get<FdmReqApi.RequirementDetail>(
    `/fdmreq/requirements/${encodeURIComponent(reqNo)}`,
  );
}

export function createRequirement(data: FdmReqApi.CreateRequirementParams) {
  return requestClient.post<FdmReqApi.Requirement>('/fdmreq/requirements', data);
}

export function updateRequirement(
  reqNo: string,
  data: FdmReqApi.UpdateRequirementParams,
) {
  return requestClient.put<FdmReqApi.Requirement>(
    `/fdmreq/requirements/${encodeURIComponent(reqNo)}`,
    data,
  );
}

export function deleteRequirement(reqNo: string) {
  return requestClient.delete<boolean>(
    `/fdmreq/requirements/${encodeURIComponent(reqNo)}`,
  );
}

export function createRequirementVersion(
  reqNo: string,
  data: FdmReqApi.CreateVersionParams,
) {
  return requestClient.post<FdmReqApi.RequirementVersion>(
    `/fdmreq/requirements/${encodeURIComponent(reqNo)}/versions`,
    data,
  );
}

export function approveRequirement(reqNo: string, data: FdmReqApi.ApproveParams) {
  return requestClient.post<FdmReqApi.Approval>(
    `/fdmreq/requirements/${encodeURIComponent(reqNo)}/approve`,
    data,
  );
}

export function createRequirementTask(
  reqNo: string,
  data: FdmReqApi.CreateTaskParams,
) {
  return requestClient.post<FdmReqApi.DevTask>(
    `/fdmreq/requirements/${encodeURIComponent(reqNo)}/tasks`,
    data,
  );
}

export function callbackTask(taskId: number | string, data: FdmReqApi.CallbackParams) {
  return requestClient.post<FdmReqApi.DevTask>(
    `/fdmreq/tasks/${encodeURIComponent(String(taskId))}/callback`,
    data,
  );
}

export function listRequirementReports(reqNo: string) {
  return requestClient.get<FdmReqApi.TestReport[]>(
    `/fdmreq/requirements/${encodeURIComponent(reqNo)}/reports`,
  );
}

export function createRequirementReport(
  reqNo: string,
  data: FdmReqApi.CreateReportParams,
) {
  return requestClient.post<FdmReqApi.TestReport>(
    `/fdmreq/requirements/${encodeURIComponent(reqNo)}/reports`,
    data,
  );
}
