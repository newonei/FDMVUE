import type { PageParam } from '@vben/request';

import { requestClient } from '#/api/request';

export namespace DingTalkApprovalApi {
  export type Scope = 'CC' | 'DONE' | 'STARTED' | 'TODO';

  export type JsonValue =
    | boolean
    | JsonValue[]
    | null
    | number
    | string
    | { [key: string]: JsonValue };

  export interface PageParams extends PageParam {
    endTime?: number;
    keyword?: string;
    processCode: string;
    scope: Scope;
    startTime?: number;
  }

  export interface Template {
    datatype?: null | number;
    name: string;
    processCode: string;
  }

  export interface Approval {
    businessId?: string;
    canAction: boolean;
    createTime?: number;
    currentTaskId?: number;
    finishTime?: number;
    originatorDeptId?: string;
    originatorDeptName?: string;
    originatorUserId?: string;
    processCode?: string;
    processInstanceId: string;
    result?: string;
    status?: string;
    templateName?: string;
    title?: string;
  }

  export interface Attachment {
    downloadUrl?: string;
    fileId?: string;
    fileName?: string;
    fileSize?: number | string;
    fileType?: string;
    spaceId?: string;
  }

  export interface FormComponent {
    attachments?: Attachment[];
    bizAlias?: string;
    componentType?: string;
    extValue?: unknown;
    id?: string;
    name?: string;
    value?: unknown;
  }

  export interface OperationRecord {
    activityId?: string;
    attachments?: Attachment[];
    ccUserIds?: string[];
    date?: number;
    images?: string[];
    remark?: string;
    result?: string;
    showName?: string;
    type?: string;
    userId?: string;
  }

  export interface Task {
    activityId?: string;
    createTime?: number;
    finishTime?: number;
    mobileUrl?: string;
    pcUrl?: string;
    processInstanceId?: string;
    result?: string;
    status?: string;
    taskId?: number;
    userId?: string;
  }

  export interface BusinessDocument {
    dataType?: number;
    documentName?: string;
    fieldNames?: Record<string, string>;
    message?: string;
    msgId?: string;
    record?: JsonValue;
    source: 'JINZHI_CRM';
    status: 'AVAILABLE' | 'NO_MAPPING' | 'NOT_FOUND' | 'UNAVAILABLE';
  }

  export interface Detail extends Approval {
    businessDocument?: BusinessDocument;
    formComponents?: FormComponent[];
    operationRecords?: OperationRecord[];
    tasks?: Task[];
  }

  export interface ApprovalPageResult {
    list: Approval[];
    pageNo: number;
    pageSize: number;
    queryEndTime?: number;
    queryNotice?: string;
    queryStartTime?: number;
    scope: Scope;
    total: number;
    truncated?: boolean;
  }

  export interface TodoCountResult {
    count: number;
  }

  export type AttachmentDownloadUrlResult = Attachment;

  export interface ActionRequest {
    remark?: string;
  }

  export interface ActionResult {
    processInstanceId: string;
    result: string;
    success: boolean;
    taskId: number;
  }
}

export function getDingTalkApprovalPage(
  params: DingTalkApprovalApi.PageParams,
) {
  return requestClient.get<DingTalkApprovalApi.ApprovalPageResult>(
    '/fdmdingtalk/approvals/page',
    { params },
  );
}

export function getDingTalkApprovalTodoCount() {
  return requestClient.get<DingTalkApprovalApi.TodoCountResult>(
    '/fdmdingtalk/approvals/todo-count',
  );
}

export function getDingTalkApprovalTemplates() {
  return requestClient.get<DingTalkApprovalApi.Template[]>(
    '/fdmdingtalk/approvals/templates',
  );
}

export function getDingTalkApprovalDetail(processInstanceId: string) {
  return requestClient.get<DingTalkApprovalApi.Detail>(
    `/fdmdingtalk/approvals/${encodeURIComponent(processInstanceId)}`,
  );
}

export function getDingTalkApprovalAttachmentDownloadUrl(
  processInstanceId: string,
  fileId: string,
) {
  return requestClient.get<DingTalkApprovalApi.AttachmentDownloadUrlResult>(
    `/fdmdingtalk/approvals/${encodeURIComponent(processInstanceId)}/attachment-download-url`,
    { params: { fileId } },
  );
}

export function approveDingTalkApproval(
  processInstanceId: string,
  data: DingTalkApprovalApi.ActionRequest = {},
) {
  return requestClient.post<DingTalkApprovalApi.ActionResult>(
    `/fdmdingtalk/approvals/${encodeURIComponent(processInstanceId)}/approve`,
    data,
  );
}

export function rejectDingTalkApproval(
  processInstanceId: string,
  data: Required<Pick<DingTalkApprovalApi.ActionRequest, 'remark'>>,
) {
  return requestClient.post<DingTalkApprovalApi.ActionResult>(
    `/fdmdingtalk/approvals/${encodeURIComponent(processInstanceId)}/reject`,
    data,
  );
}
