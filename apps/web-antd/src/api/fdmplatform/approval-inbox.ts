import type { PageResult } from './index';

import { requestClient } from '#/api/request';

export interface ApprovalTask {
  id: string;
  sourceKind: 'CONTRACT_REVIEW' | 'PROC_FINANCE' | 'PURCHASE_PLAN';
  sourceId: string;
  contractId?: string;
  title: string;
  requesterUserId: number;
  handlerUserId: number;
  status: 'CLOSED' | 'OPEN';
  openedAt: string;
  deadline: string;
  overdue: boolean;
}
export interface ApprovalNotice {
  id: string;
  category: 'ARRIVAL' | 'OVERDUE';
  content: string;
  status: string;
  createdAt: string;
  contractId?: string;
  sourceId?: string;
}
const base = '/fdmplatform/v1/approval-inbox';
export function getApprovalTasks(params: {
  pageNo: number;
  pageSize: number;
  scope: 'assigned' | 'requested';
  status: 'CLOSED' | 'OPEN';
}) {
  return requestClient.get<PageResult<ApprovalTask>>(`${base}/page`, {
    params,
  });
}
export function getApprovalNotices(params: {
  pageNo: number;
  pageSize: number;
}) {
  return requestClient.get<PageResult<ApprovalNotice>>(
    `${base}/notifications`,
    { params },
  );
}
