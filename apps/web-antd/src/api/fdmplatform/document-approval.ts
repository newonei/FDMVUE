import { requestClient } from '#/api/request';

const base = '/fdmplatform/v1/document-approvals';

export type ApprovalDocType = 'PAYMENT' | 'PURCHASE_ORDER' | 'REIMBURSEMENT';

/** WAITING 未轮到；RUNNING 审批中；AGREE / REFUSE 已办；CANCELED 流程结束没轮到；REDIRECTED 已转交；DONE 已结束。 */
export type ApprovalUserState =
  | 'AGREE'
  | 'CANCELED'
  | 'DONE'
  | 'REDIRECTED'
  | 'REFUSE'
  | 'RUNNING'
  | 'WAITING';

export interface ApprovalNodeUser {
  createTime?: number;
  finishTime?: number;
  name: string;
  remark?: null | string;
  state: ApprovalUserState;
  userId: number;
}

export interface ApprovalProgressNode {
  /** AND 会签，OR 或签，NONE 单人。 */
  actionType: 'AND' | 'NONE' | 'OR';
  index: number;
  state: 'AGREE' | 'CANCELED' | 'REFUSE' | 'RUNNING' | 'WAITING';
  users: ApprovalNodeUser[];
}

export interface ApprovalRecord {
  date?: number;
  name?: null | string;
  remark?: null | string;
  result?: null | string;
  type?: null | string;
  userId?: number;
}

export interface DocumentApprovalView {
  canAction: boolean;
  createTime?: number;
  finishTime?: number;
  lastError?: null | string;
  nodes: ApprovalProgressNode[];
  originator: { name: string; userId: number };
  processInstanceId?: null | string;
  progressError?: string;
  records: ApprovalRecord[];
  /** 钉钉实例状态：RUNNING、AGREED、REFUSED、TERMINATED；读不到时没有。 */
  state?: 'AGREED' | 'REFUSED' | 'RUNNING' | 'TERMINATED';
  /** FDM 发起记录状态。 */
  status: string;
}

export interface DocumentApprovalTarget {
  contractId?: string;
  docType: ApprovalDocType;
  id: string;
}

/** 单据最近一次钉钉审批；没走过审批时为 null。 */
export function getDocumentApproval(target: DocumentApprovalTarget) {
  return requestClient.get<DocumentApprovalView | null>(base, {
    params: target,
  });
}

export function approveDocument(
  target: DocumentApprovalTarget & { remark?: string },
) {
  return requestClient.post<DocumentApprovalView>(`${base}/approve`, target);
}

export function rejectDocument(
  target: DocumentApprovalTarget & { remark: string },
) {
  return requestClient.post<DocumentApprovalView>(`${base}/reject`, target);
}
