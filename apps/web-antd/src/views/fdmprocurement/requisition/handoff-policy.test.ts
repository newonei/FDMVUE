import type { FdmProcurementPurchaseOrderHandoffApi } from '#/api/fdmprocurement/purchase-order-handoff';

import { describe, expect, it } from 'vitest';

import {
  canLoadExecutionFacts,
  canLoadLifecycleHistory,
  canRetryHandoff,
  canRetryProjection,
  erpLifecycleActionMeta,
  erpLifecycleEventResultMeta,
  erpLifecycleNotice,
  erpLifecycleStatusMeta,
  executionActionMeta,
  executionDocumentTypeMeta,
  executionEventResultMeta,
  executionPostingStateMeta,
  handoffStatusMeta,
  projectionStateNotice,
  projectionStatusMeta,
  validateProjectionRetryReason,
} from './handoff-policy';

function projectionState(
  overrides: Partial<FdmProcurementPurchaseOrderHandoffApi.ProjectionState>,
) {
  return {
    handoffCount: 0,
    outboxId: '700',
    outboxVersion: 9,
    requisitionId: '88',
    retryCount: 0,
    status: 'PENDING',
    ...overrides,
  } as FdmProcurementPurchaseOrderHandoffApi.ProjectionState;
}

describe('purchase-order handoff display policy', () => {
  it('only allows explicit manager retry from MANUAL_REVIEW', () => {
    const handoff = {
      status: 'MANUAL_REVIEW',
    } as FdmProcurementPurchaseOrderHandoffApi.Handoff;
    expect(canRetryHandoff(handoff, () => true)).toBe(true);
    expect(
      canRetryHandoff({ ...handoff, status: 'RETRY_WAIT' }, () => true),
    ).toBe(false);
    expect(canRetryHandoff(handoff, () => false)).toBe(false);
  });

  it('loads lifecycle history only for a visible handoff with query permission', () => {
    const handoffs = [
      { id: '801', status: 'SUCCESS' },
    ] as FdmProcurementPurchaseOrderHandoffApi.Handoff[];

    expect(canLoadLifecycleHistory('801', handoffs, true)).toBe(true);
    expect(canLoadLifecycleHistory('999', handoffs, true)).toBe(false);
    expect(canLoadLifecycleHistory('801', handoffs, false)).toBe(false);
    expect(canLoadLifecycleHistory('', handoffs, true)).toBe(false);
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

  it('loads execution facts only for a visible handoff with query permission', () => {
    const handoffs = [
      { id: '801', status: 'SUCCESS' },
    ] as FdmProcurementPurchaseOrderHandoffApi.Handoff[];

    expect(canLoadExecutionFacts('801', handoffs, true)).toBe(true);
    expect(canLoadExecutionFacts('999', handoffs, true)).toBe(false);
    expect(canLoadExecutionFacts('801', handoffs, false)).toBe(false);
  });

  it('keeps creation delivery status separate from ERP lifecycle status', () => {
    expect(handoffStatusMeta('SUCCESS').label).toBe('创建交付成功');
    expect(handoffStatusMeta('RETRY_WAIT').color).toBe('orange');
    expect(handoffStatusMeta('MANUAL_REVIEW').color).toBe('red');

    expect(erpLifecycleStatusMeta('DRAFT').label).toBe('ERP 草稿已创建');
    expect(erpLifecycleStatusMeta('CONFIRMED').label).toBe('ERP 已确认');
    expect(erpLifecycleStatusMeta('APPROVED').label).toBe('ERP 已确认');
    expect(erpLifecycleStatusMeta('CANCELLED').label).toBe('ERP 已取消');
    expect(erpLifecycleStatusMeta(null).label).toContain('尚未取得');
  });

  it('uses explicit read-only labels for every supported ERP lifecycle event', () => {
    expect(erpLifecycleActionMeta('CONFIRM')).toEqual({
      color: 'green',
      label: '确认',
    });
    expect(erpLifecycleActionMeta('UNCONFIRM').label).toBe('反确认');
    expect(erpLifecycleActionMeta('CANCEL').color).toBe('red');
    expect(erpLifecycleEventResultMeta('APPLIED').label).toBe('已生效');
    expect(erpLifecycleEventResultMeta('IGNORED_STALE').label).toContain(
      '已忽略',
    );
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
    expect(executionDocumentTypeMeta('PURCHASE_IN').label).toBe('采购入库');
    expect(executionDocumentTypeMeta('PURCHASE_RETURN')).toEqual({
      color: 'orange',
      label: '采购退货',
    });
  });

  it('shows cancellation time, reason and normalized actor identity as read-only evidence', () => {
    const notice = erpLifecycleNotice({
      erpCancelReason: '供应计划取消',
      erpLastActorUserId: '164',
      erpPurchaseOrderStatus: 'CANCELLED',
      erpStatusUpdatedAt: '2026-08-29T21:10:00',
    } as FdmProcurementPurchaseOrderHandoffApi.Handoff);

    expect(notice).toMatchObject({
      message: 'ERP 采购单已取消',
      type: 'error',
    });
    expect(notice?.description).toContain('2026-08-29 21:10:00');
    expect(notice?.description).toContain('供应计划取消');
    expect(notice?.description).toContain('164');
    expect(
      erpLifecycleNotice({
        erpPurchaseOrderStatus: 'CONFIRMED',
      } as FdmProcurementPurchaseOrderHandoffApi.Handoff),
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
      { handoffListLoaded: true, visibleHandoffCount: 0 },
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
      { handoffListLoaded: true, visibleHandoffCount: 0 },
    );

    expect(projectionStatusMeta('DEAD_LETTER').color).toBe('red');
    expect(notice.type).toBe('error');
    expect(notice.description).toContain('填写可审计原因');
    expect(notice.description).toContain('不会直接执行投影');
  });

  it('flags published projection without a visible handoff as inconsistent', () => {
    const notice = projectionStateNotice(
      projectionState({ handoffCount: 1, status: 'PUBLISHED' }),
      { handoffListLoaded: true, visibleHandoffCount: 0 },
    );

    expect(notice.type).toBe('error');
    expect(notice.message).toContain('未生成 ERP 交接台账');
  });

  it('shows published projection as healthy when handoff counts reconcile', () => {
    const notice = projectionStateNotice(
      projectionState({ handoffCount: 2, status: 'PUBLISHED' }),
      { handoffListLoaded: true, visibleHandoffCount: 2 },
    );

    expect(notice.type).toBe('success');
    expect(notice.description).toContain('2 个');
  });
});
