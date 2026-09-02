import type { FdmProcurementPurchaseOrderApi } from '#/api/fdmprocurement/purchase-order';

import { describe, expect, it } from 'vitest';

import {
  canLoadExecutionFacts,
  canLoadLifecycleHistory,
  canRetryPurchaseOrderProjection,
  canRetryProjection,
  purchaseOrderLifecycleActionMeta,
  purchaseOrderLifecycleEventResultMeta,
  purchaseOrderLifecycleNotice,
  purchaseOrderLifecycleStatusMeta,
  executionActionMeta,
  executionDocumentTypeMeta,
  executionEventResultMeta,
  executionPostingStateMeta,
  purchaseOrderProjectionStatusMeta,
  projectionStateNotice,
  projectionStatusMeta,
  validateProjectionRetryReason,
} from './purchase-order-policy';

function projectionState(
  overrides: Partial<FdmProcurementPurchaseOrderApi.ProjectionState>,
) {
  return {
    purchaseOrderCount: 0,
    outboxId: '700',
    outboxVersion: 9,
    requisitionId: '88',
    retryCount: 0,
    status: 'PENDING',
    ...overrides,
  } as FdmProcurementPurchaseOrderApi.ProjectionState;
}

describe('purchase-order purchaseOrderProjection display policy', () => {
  it('only allows explicit manager retry from MANUAL_REVIEW', () => {
    const purchaseOrderProjection = {
      status: 'MANUAL_REVIEW',
    } as FdmProcurementPurchaseOrderApi.PurchaseOrderProjection;
    expect(
      canRetryPurchaseOrderProjection(purchaseOrderProjection, () => true),
    ).toBe(true);
    expect(
      canRetryPurchaseOrderProjection(
        { ...purchaseOrderProjection, status: 'RETRY_WAIT' },
        () => true,
      ),
    ).toBe(false);
    expect(
      canRetryPurchaseOrderProjection(purchaseOrderProjection, () => false),
    ).toBe(false);
  });

  it('loads lifecycle history only for a visible purchaseOrderProjection with query permission', () => {
    const purchaseOrderProjections = [
      { id: '801', status: 'SUCCESS' },
    ] as FdmProcurementPurchaseOrderApi.PurchaseOrderProjection[];

    expect(canLoadLifecycleHistory('801', purchaseOrderProjections, true)).toBe(
      true,
    );
    expect(canLoadLifecycleHistory('999', purchaseOrderProjections, true)).toBe(
      false,
    );
    expect(
      canLoadLifecycleHistory('801', purchaseOrderProjections, false),
    ).toBe(false);
    expect(canLoadLifecycleHistory('', purchaseOrderProjections, true)).toBe(
      false,
    );
  });

  it('only exposes projection recovery for a versioned dead-letter identity with permission', () => {
    const deadLetter = projectionState({ status: 'DEAD_LETTER' });
    expect(canRetryProjection(deadLetter, () => true)).toBe(true);
    expect(
      canRetryProjection({ ...deadLetter, outboxVersion: 0 }, () => true),
    ).toBe(true);
    expect(
      canRetryProjection({ ...deadLetter, outboxId: null }, () => true),
    ).toBe(false);
    expect(
      canRetryProjection({ ...deadLetter, outboxVersion: null }, () => true),
    ).toBe(false);
    expect(
      canRetryProjection({ ...deadLetter, status: 'FAILED' }, () => true),
    ).toBe(false);
    expect(
      canRetryProjection(
        { ...deadLetter, outboxVersion: 2_147_483_647 },
        () => true,
      ),
    ).toBe(false);
    expect(canRetryProjection(deadLetter, () => false)).toBe(false);
  });

  it('trims and validates the auditable projection-recovery reason', () => {
    expect(validateProjectionRetryReason('  已修复供应商映射  ')).toEqual({
      reason: '已修复供应商映射',
      valid: true,
    });
    expect(validateProjectionRetryReason('a'.repeat(500))).toMatchObject({
      valid: true,
    });
    expect(validateProjectionRetryReason('   ')).toMatchObject({
      valid: false,
    });
    expect(validateProjectionRetryReason('a'.repeat(501))).toMatchObject({
      valid: false,
    });
    expect(validateProjectionRetryReason('原因\n换行')).toEqual({
      error: '人工恢复原因不能包含控制字符',
      valid: false,
    });
    expect(
      validateProjectionRetryReason(`原因${String.fromCodePoint(0x85)}`),
    ).toMatchObject({ valid: false });
  });

  it('loads execution facts only for a visible purchaseOrderProjection with query permission', () => {
    const purchaseOrderProjections = [
      { id: '801', status: 'SUCCESS' },
    ] as FdmProcurementPurchaseOrderApi.PurchaseOrderProjection[];

    expect(canLoadExecutionFacts('801', purchaseOrderProjections, true)).toBe(
      true,
    );
    expect(canLoadExecutionFacts('999', purchaseOrderProjections, true)).toBe(
      false,
    );
    expect(canLoadExecutionFacts('801', purchaseOrderProjections, false)).toBe(
      false,
    );
  });

  it('keeps creation delivery status separate from purchase-order lifecycle status', () => {
    expect(purchaseOrderProjectionStatusMeta('SUCCESS').label).toBe(
      '采购单生成成功',
    );
    expect(purchaseOrderProjectionStatusMeta('RETRY_WAIT').color).toBe(
      'orange',
    );
    expect(purchaseOrderProjectionStatusMeta('MANUAL_REVIEW').color).toBe(
      'red',
    );

    expect(purchaseOrderLifecycleStatusMeta('DRAFT').label).toBe(
      '采购单草稿已创建',
    );
    expect(purchaseOrderLifecycleStatusMeta('CONFIRMED').label).toBe(
      'FDM 采购单已确认',
    );
    expect(purchaseOrderLifecycleStatusMeta('APPROVED').label).toBe(
      'FDM 采购单已确认',
    );
    expect(purchaseOrderLifecycleStatusMeta('CANCELLED').label).toBe(
      'FDM 采购单已取消',
    );
    expect(purchaseOrderLifecycleStatusMeta(null).label).toContain('尚未取得');
  });

  it('uses explicit read-only labels for every supported purchase-order lifecycle event', () => {
    expect(purchaseOrderLifecycleActionMeta('CONFIRM')).toEqual({
      color: 'green',
      label: '确认',
    });
    expect(purchaseOrderLifecycleActionMeta('UNCONFIRM').label).toBe('反确认');
    expect(purchaseOrderLifecycleActionMeta('CANCEL').color).toBe('red');
    expect(purchaseOrderLifecycleEventResultMeta('APPLIED').label).toBe(
      '已生效',
    );
    expect(
      purchaseOrderLifecycleEventResultMeta('IGNORED_STALE').label,
    ).toContain('已忽略');
  });

  it('keeps purchase-in posting facts distinct and labels both POST and REVERSE', () => {
    expect(executionPostingStateMeta('POSTED')).toEqual({
      color: 'green',
      label: 'POSTED · 已过账',
    });
    expect(executionPostingStateMeta('DRAFT').label).toContain('DRAFT');
    expect(executionActionMeta('POST').label).toBe('过账');
    expect(executionActionMeta('REVERSE').label).toBe('反过账');
    expect(executionEventResultMeta('APPLIED').label).toBe('已生效');
    expect(executionEventResultMeta('IGNORED_STALE').label).toContain('已忽略');
    expect(executionDocumentTypeMeta('PURCHASE_RECEIPT').label).toBe(
      '采购入库',
    );
    expect(executionDocumentTypeMeta('PURCHASE_RETURN')).toEqual({
      color: 'orange',
      label: '采购退货',
    });
  });

  it('shows cancellation time, reason and normalized actor identity as read-only evidence', () => {
    const notice = purchaseOrderLifecycleNotice({
      cancelReason: '供应计划取消',
      lastActorUserId: '164',
      purchaseOrderStatus: 'CANCELLED',
      statusUpdatedAt: '2026-08-29T21:10:00',
    } as FdmProcurementPurchaseOrderApi.PurchaseOrderProjection);

    expect(notice).toMatchObject({
      message: 'FDM 采购单已取消',
      type: 'error',
    });
    expect(notice?.description).toContain('2026-08-29 21:10:00');
    expect(notice?.description).toContain('供应计划取消');
    expect(notice?.description).toContain('164');
    expect(
      purchaseOrderLifecycleNotice({
        purchaseOrderStatus: 'CONFIRMED',
      } as FdmProcurementPurchaseOrderApi.PurchaseOrderProjection),
    ).toBeUndefined();
  });

  it('maps pending, processing and failed projection states without exposing actions', () => {
    expect(projectionStatusMeta('PENDING').label).toBe('等待投递');
    expect(projectionStatusMeta('PROCESSING').color).toBe('processing');

    const failed = projectionStateNotice(
      projectionState({
        availableAt: '2026-08-29T19:30:00',
        lastErrorCode: 'TEMPORARY_FAILURE',
        retryCount: 3,
        status: 'FAILED',
      }),
      { purchaseOrderListLoaded: true, visiblePurchaseOrderCount: 0 },
    );
    expect(failed.type).toBe('warning');
    expect(failed.description).toContain('2026-08-29 19:30:00');
    expect(failed.description).toContain('自动重试');
  });

  it('renders dead-letter as an operational error without claiming direct projection', () => {
    const notice = projectionStateNotice(
      projectionState({
        deadLetterAt: '2026-08-29T20:00:00',
        lastErrorCode: 'INVALID_SNAPSHOT',
        status: 'DEAD_LETTER',
      }),
      { purchaseOrderListLoaded: true, visiblePurchaseOrderCount: 0 },
    );

    expect(projectionStatusMeta('DEAD_LETTER').color).toBe('red');
    expect(notice.type).toBe('error');
    expect(notice.description).toContain('填写可审计原因');
    expect(notice.description).toContain('不会直接执行投影');
  });

  it('flags published projection without a visible purchaseOrderProjection as inconsistent', () => {
    const notice = projectionStateNotice(
      projectionState({ purchaseOrderCount: 1, status: 'PUBLISHED' }),
      { purchaseOrderListLoaded: true, visiblePurchaseOrderCount: 0 },
    );

    expect(notice.type).toBe('error');
    expect(notice.message).toContain('未生成 FDM 采购单投影');
  });

  it('shows published projection as healthy when purchaseOrderProjection counts reconcile', () => {
    const notice = projectionStateNotice(
      projectionState({ purchaseOrderCount: 2, status: 'PUBLISHED' }),
      { purchaseOrderListLoaded: true, visiblePurchaseOrderCount: 2 },
    );

    expect(notice.type).toBe('success');
    expect(notice.description).toContain('2 个');
  });
});
