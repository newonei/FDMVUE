import type { FdmProcurementRequisitionApi } from '#/api/fdmprocurement/requisition';

export type RequisitionAction =
  | 'AI_SOURCING'
  | 'APPROVAL_WORKSPACE'
  | 'EDIT'
  | 'PRE_VALIDATE'
  | 'SOURCING'
  | 'SUBMIT'
  | 'WITHDRAW';

const ACTION_PERMISSIONS: Record<RequisitionAction, string[]> = {
  AI_SOURCING: [
    'fdmprocurement:sourcing:query',
    'fdmprocurement:sourcing:view-sensitive',
    'fdmprocurement:sourcing:select',
    'fdmprocurement:sourcing:ai-generate',
    'fdmdocflow:generation:query',
    'fdmdocflow:generation:create',
    'fdmdocflow:generation:retry',
  ],
  APPROVAL_WORKSPACE: ['bpm:process-instance:query', 'bpm:task:query'],
  EDIT: ['fdmprocurement:requisition:update'],
  PRE_VALIDATE: ['fdmprocurement:requisition:update'],
  SOURCING: [
    'fdmprocurement:sourcing:query',
    'fdmprocurement:sourcing:view-sensitive',
  ],
  SUBMIT: ['fdmprocurement:requisition:submit'],
  WITHDRAW: ['fdmprocurement:requisition:withdraw'],
};

export function hasAllActionPermissions(
  action: RequisitionAction,
  hasPermission: (code: string) => boolean,
) {
  return ACTION_PERMISSIONS[action].every((code) => hasPermission(code));
}

export function canBindUnmappedProductSku(
  record: FdmProcurementRequisitionApi.Requisition,
  item: FdmProcurementRequisitionApi.RequisitionItem,
  hasPermission: (code: string) => boolean,
) {
  return (
    ['DATA_INCOMPLETE', 'DRAFT'].includes(record.status) &&
    item.productMappingStatus === 'PRODUCT_UNMAPPED' &&
    [
      'fdmprocurement:requisition:query',
      'fdmprocurement:requisition:update',
      'fdmproduct:selection:query',
    ].every((code) => hasPermission(code))
  );
}

export function canUseRequisitionAction(
  record: FdmProcurementRequisitionApi.Requisition,
  action: RequisitionAction,
  hasPermission: (code: string) => boolean,
  approvalState?: FdmProcurementRequisitionApi.ApprovalState,
  currentUserId?: null | number | string,
) {
  if (!hasAllActionPermissions(action, hasPermission)) return false;

  if (action === 'PRE_VALIDATE') {
    return ['DATA_INCOMPLETE', 'DRAFT', 'READY'].includes(record.status);
  }
  if (action === 'SOURCING') {
    return ['DRAFT', 'READY'].includes(record.status);
  }
  if (action === 'AI_SOURCING') {
    return (
      ['DRAFT', 'READY'].includes(record.status) &&
      record.validationStatus !== 'BLOCKED'
    );
  }
  if (action === 'SUBMIT') {
    return record.status === 'READY' && record.validationStatus === 'PASSED';
  }
  if (action === 'WITHDRAW') {
    return Boolean(
      record.status === 'SUBMITTED' &&
      approvalState?.submittedBy &&
      currentUserId &&
      String(approvalState.submittedBy) === String(currentUserId),
    );
  }
  if (action === 'APPROVAL_WORKSPACE') {
    return Boolean(approvalState?.processInstanceId);
  }

  // 当前后端没有强类型更新命令。即使用户有 update 权限，也不能展示可保存的假编辑。
  return false;
}

export function authoritativeSelectedAssessmentRef(
  record?: FdmProcurementRequisitionApi.Requisition,
  approvalState?: FdmProcurementRequisitionApi.ApprovalState,
) {
  if (!record || !approvalState || record.status !== 'READY') {
    return { assessmentId: '', inputHash: '' };
  }
  return {
    assessmentId: approvalState.currentSelectedSourcingAssessmentId ?? '',
    inputHash: approvalState.currentSelectedSourcingInputHash ?? '',
  };
}

export function requisitionStatusMeta(
  status?: FdmProcurementRequisitionApi.RequisitionStatus,
) {
  const values = {
    APPROVED: { color: 'green', label: '已通过' },
    CANCELLED: { color: 'default', label: '已取消' },
    DATA_INCOMPLETE: { color: 'orange', label: '资料不完整' },
    DRAFT: { color: 'blue', label: '草稿' },
    READY: { color: 'cyan', label: '待提交' },
    REJECTED: { color: 'red', label: '已驳回' },
    SUBMITTED: { color: 'processing', label: '审批中' },
  } as const;
  return status ? values[status] : { color: 'default', label: '未知' };
}

export function validationStatusMeta(status?: string) {
  if (status === 'PASSED') return { color: 'green', label: '预检通过' };
  if (status === 'BLOCKED') return { color: 'red', label: '预检阻断' };
  return { color: 'default', label: '尚未预检' };
}

export function hasValidSelectedAssessmentRef(
  assessmentId?: null | string,
  inputHash?: null | string,
) {
  return Boolean(
    assessmentId &&
    /^[1-9]\d*$/.test(assessmentId) &&
    inputHash &&
    /^[\da-f]{64}$/i.test(inputHash),
  );
}
