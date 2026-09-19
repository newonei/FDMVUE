import type { RelatedTarget } from '../documents/navigation';

import type {
  ApprovalNotice,
  ApprovalTask,
} from '#/api/fdmplatform/approval-inbox';

export function approvalTarget(task: ApprovalTask): RelatedTarget | undefined {
  if (task.sourceKind === 'PROC_FINANCE')
    return { type: 'procurementFinance', id: task.sourceId };
  if (!task.contractId) return undefined;
  return task.sourceKind === 'PURCHASE_PLAN'
    ? {
        type: 'document',
        kind: 'plans',
        contractId: task.contractId,
        documentId: task.sourceId,
      }
    : { type: 'contract', contractId: task.contractId };
}
export function noticeTarget(
  notice: ApprovalNotice,
): RelatedTarget | undefined {
  return notice.category === 'ARRIVAL' && notice.contractId && notice.sourceId
    ? {
        type: 'document',
        kind: 'arrivals',
        contractId: notice.contractId,
        documentId: notice.sourceId,
      }
    : undefined;
}
export const noticeStatuses: Record<string, string> = {
  PENDING: '待发送',
  SENT: '已发送',
  SKIPPED_COMPLETED: '已办结，无需提醒',
  SKIPPED_DISABLED_USER: '接收人已停用',
};
