import type { FdmProcurementPurchaseOrderApi } from '#/api/fdmprocurement/purchase-order';

export interface ProjectionReconciliation {
  purchaseOrderListLoaded: boolean;
  visiblePurchaseOrderCount: number;
}

export interface ProjectionStateNotice {
  description: string;
  message: string;
  type: 'error' | 'info' | 'success' | 'warning';
}

export interface PurchaseOrderLifecycleNotice {
  description: string;
  message: string;
  type: 'error' | 'info' | 'success' | 'warning';
}

export type ProjectionRetryReasonValidation =
  | { error: string; valid: false }
  | { reason: string; valid: true };

function containsControlCharacter(value: string) {
  return [...value].some((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint <= 31 || (codePoint >= 127 && codePoint <= 159);
  });
}

const MAX_RETRYABLE_OUTBOX_VERSION = 2_147_483_646;

export function purchaseOrderLifecycleActionMeta(
  action: FdmProcurementPurchaseOrderApi.LifecycleAction,
) {
  const values = {
    CANCEL: { color: 'red', label: '取消' },
    CONFIRM: { color: 'green', label: '确认' },
    UNCONFIRM: { color: 'blue', label: '反确认' },
  } as const;
  return values[action];
}

export function purchaseOrderLifecycleEventResultMeta(
  result: FdmProcurementPurchaseOrderApi.LifecycleProcessingResult,
) {
  const values = {
    APPLIED: { color: 'green', label: '已生效' },
    IGNORED_STALE: { color: 'default', label: '过期事件已忽略' },
  } as const;
  return values[result];
}

export function purchaseOrderProjectionStatusMeta(
  status: FdmProcurementPurchaseOrderApi.PurchaseOrderProjectionStatus,
) {
  const values = {
    MANUAL_REVIEW: { color: 'red', label: '采购单生成需人工处理' },
    PROCESSING: { color: 'processing', label: '正在创建采购单草稿' },
    READY: { color: 'blue', label: '等待创建采购单草稿' },
    RETRY_WAIT: { color: 'orange', label: '采购单生成等待自动重试' },
    SUCCESS: { color: 'green', label: '采购单生成成功' },
  } as const;
  return values[status] ?? { color: 'default', label: status || '未知' };
}

export function purchaseOrderLifecycleStatusMeta(status?: null | string) {
  const normalized = String(status || '')
    .trim()
    .toUpperCase();
  const values = {
    APPROVED: { color: 'green', label: 'FDM 采购单已确认' },
    CANCELLED: { color: 'red', label: 'FDM 采购单已取消' },
    CONFIRMED: { color: 'green', label: 'FDM 采购单已确认' },
    DRAFT: { color: 'blue', label: '采购单草稿已创建' },
  } as const;
  if (!normalized) {
    return { color: 'default', label: '尚未取得 FDM 采购单生命周期' };
  }
  return (
    values[normalized as keyof typeof values] ?? {
      color: 'orange',
      label: `FDM 采购单状态待识别（${normalized}）`,
    }
  );
}

function displayPurchaseOrderLifecycleDateTime(
  value?: FdmProcurementPurchaseOrderApi.DateTimeValue | null,
) {
  return value === undefined || value === null || value === ''
    ? '未提供'
    : String(value).replace('T', ' ');
}

export function purchaseOrderLifecycleNotice(
  purchaseOrderProjection: FdmProcurementPurchaseOrderApi.PurchaseOrderProjection,
): PurchaseOrderLifecycleNotice | undefined {
  if (
    String(purchaseOrderProjection.purchaseOrderStatus || '').toUpperCase() !==
    'CANCELLED'
  ) {
    return undefined;
  }
  const details = [
    `取消时间 ${displayPurchaseOrderLifecycleDateTime(purchaseOrderProjection.statusUpdatedAt)}`,
    `取消原因 ${String(purchaseOrderProjection.cancelReason || '').trim() || '后端未提供'}`,
  ];
  if (purchaseOrderProjection.lastActorUserId) {
    details.push(`操作人 ID ${purchaseOrderProjection.lastActorUserId}`);
  }
  return {
    description: details.join('；'),
    message: 'FDM 采购单已取消',
    type: 'error',
  };
}

export function canRetryPurchaseOrderProjection(
  purchaseOrderProjection: FdmProcurementPurchaseOrderApi.PurchaseOrderProjection,
  hasPermission: (code: string) => boolean,
) {
  return (
    purchaseOrderProjection.status === 'MANUAL_REVIEW' &&
    hasPermission('fdmprocurement:purchase-order:retry')
  );
}

export function canRetryProjection(
  state: FdmProcurementPurchaseOrderApi.ProjectionState,
  hasPermission: (code: string) => boolean,
) {
  return (
    state.status === 'DEAD_LETTER' &&
    Boolean(state.outboxId?.trim()) &&
    Number.isInteger(state.outboxVersion) &&
    Number(state.outboxVersion) >= 0 &&
    Number(state.outboxVersion) <= MAX_RETRYABLE_OUTBOX_VERSION &&
    hasPermission('fdmprocurement:purchase-order:retry')
  );
}

export function validateProjectionRetryReason(
  rawReason: string,
): ProjectionRetryReasonValidation {
  if (containsControlCharacter(rawReason)) {
    return { error: '人工恢复原因不能包含控制字符', valid: false };
  }
  const reason = rawReason.trim();
  if (!reason) {
    return { error: '请填写人工恢复原因', valid: false };
  }
  if (reason.length > 500) {
    return { error: '人工恢复原因不能超过 500 个字符', valid: false };
  }
  return { reason, valid: true };
}

export function canLoadLifecycleHistory(
  projectionId: string,
  purchaseOrderProjections: readonly FdmProcurementPurchaseOrderApi.PurchaseOrderProjection[],
  hasQueryPermission: boolean,
) {
  return (
    hasQueryPermission &&
    projectionId.length > 0 &&
    purchaseOrderProjections.some(
      (purchaseOrderProjection) => purchaseOrderProjection.id === projectionId,
    )
  );
}

export function canLoadExecutionFacts(
  projectionId: string,
  purchaseOrderProjections: readonly FdmProcurementPurchaseOrderApi.PurchaseOrderProjection[],
  hasQueryPermission: boolean,
) {
  return (
    hasQueryPermission &&
    projectionId.length > 0 &&
    purchaseOrderProjections.some(
      (purchaseOrderProjection) => purchaseOrderProjection.id === projectionId,
    )
  );
}

export function executionPostingStateMeta(status?: null | string) {
  const normalized = String(status || '')
    .trim()
    .toUpperCase();
  const values = {
    DRAFT: { color: 'blue', label: 'DRAFT · 草稿 / 未生效' },
    POSTED: { color: 'green', label: 'POSTED · 已过账' },
  } as const;
  return (
    values[normalized as keyof typeof values] ?? {
      color: 'default',
      label: normalized ? `过账状态待识别（${normalized}）` : '未提供过账状态',
    }
  );
}

export function executionDocumentTypeMeta(type?: null | string) {
  const normalized = String(type || '')
    .trim()
    .toUpperCase();
  const values = {
    PURCHASE_RECEIPT: { color: 'blue', label: '采购入库' },
    PURCHASE_RETURN: { color: 'orange', label: '采购退货' },
  } as const;
  return (
    values[normalized as keyof typeof values] ?? {
      color: 'default',
      label: normalized ? `执行单据（${normalized}）` : '执行单据',
    }
  );
}

export function executionActionMeta(
  action: FdmProcurementPurchaseOrderApi.ExecutionAction,
) {
  const values = {
    POST: { color: 'green', label: '过账' },
    REVERSE: { color: 'orange', label: '反过账' },
  } as const;
  return values[action] ?? { color: 'default', label: action || '未知动作' };
}

export function executionEventResultMeta(
  result: FdmProcurementPurchaseOrderApi.ExecutionProcessingResult,
) {
  const values = {
    APPLIED: { color: 'green', label: '已生效' },
    IGNORED_STALE: { color: 'default', label: '过期事件已忽略' },
  } as const;
  return values[result] ?? { color: 'default', label: result || '未知结果' };
}

export function projectionStatusMeta(
  status: FdmProcurementPurchaseOrderApi.ProjectionStatus,
) {
  const values = {
    DEAD_LETTER: { color: 'red', label: '投递死信' },
    FAILED: { color: 'orange', label: '等待自动重试' },
    NOT_CREATED: { color: 'default', label: '尚未创建投递' },
    PENDING: { color: 'blue', label: '等待投递' },
    PROCESSING: { color: 'processing', label: '正在投影' },
    PUBLISHED: { color: 'green', label: '投递已发布' },
  } as const;
  return values[status] ?? { color: 'default', label: status || '未知' };
}

function displayProjectionDateTime(
  value?: FdmProcurementPurchaseOrderApi.DateTimeValue | null,
) {
  return value === undefined || value === null || value === ''
    ? '未提供'
    : String(value).replace('T', ' ');
}

function displayProjectionError(
  state: FdmProcurementPurchaseOrderApi.ProjectionState,
) {
  const code = state.lastErrorCode || '未提供错误码';
  const message = state.lastErrorMessage || '未提供脱敏错误摘要';
  return `${code}：${message}`;
}

export function projectionStateNotice(
  state: FdmProcurementPurchaseOrderApi.ProjectionState,
  reconciliation: ProjectionReconciliation,
): ProjectionStateNotice {
  if (state.status === 'PUBLISHED') {
    const publishedWithoutPurchaseOrder =
      state.purchaseOrderCount === 0 ||
      (reconciliation.purchaseOrderListLoaded &&
        reconciliation.visiblePurchaseOrderCount === 0);
    if (publishedWithoutPurchaseOrder) {
      return {
        description:
          '审批事件已经标记为已发布，但当前没有任何采购单投影。这是后端投递与投影的一致性异常，页面不会伪造台账或发起补投，请由运营排查。',
        message: '投递已发布但未生成 FDM 采购单投影',
        type: 'error',
      };
    }
    return {
      description: `审批事件已发布，并生成 ${state.purchaseOrderCount} 个 FDM 采购单投影。`,
      message: '审批事件投递完成',
      type: 'success',
    };
  }
  if (state.status === 'DEAD_LETTER') {
    return {
      description: `死信时间 ${displayProjectionDateTime(state.deadLetterAt)}；${displayProjectionError(state)}。具备权限的运营人员可填写可审计原因，将该事件受控恢复到等待投递；页面不会直接执行投影或伪造采购单投影。`,
      message: '审批事件投递进入死信',
      type: 'error',
    };
  }
  if (state.status === 'FAILED') {
    return {
      description: `已失败 ${state.retryCount} 次；后端计划在 ${displayProjectionDateTime(state.availableAt)} 自动重试。${displayProjectionError(state)}。`,
      message: '审批事件投递失败，等待自动重试',
      type: 'warning',
    };
  }
  if (state.status === 'PROCESSING') {
    return {
      description:
        '后端 Worker 正在把审批冻结快照投影为 FDM 采购单草稿，请等待处理完成。',
      message: '审批事件正在投影',
      type: 'info',
    };
  }
  if (state.status === 'PENDING') {
    return {
      description: `审批事件已进入投递队列，可处理时间 ${displayProjectionDateTime(state.availableAt)}。`,
      message: '审批事件等待后端投递',
      type: 'info',
    };
  }
  return {
    description:
      '采购申请已经审批通过，但后端尚未创建审批事件投递记录。页面不会自行创建、重试或恢复投递。',
    message: '尚未创建审批事件投递',
    type: 'warning',
  };
}
