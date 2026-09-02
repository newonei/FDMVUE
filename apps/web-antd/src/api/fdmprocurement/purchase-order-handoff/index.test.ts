import type { FdmProcurementPurchaseOrderHandoffApi } from './index';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  getPurchaseOrderHandoff,
  getPurchaseOrderHandoffExecutionFacts,
  getPurchaseOrderHandoffLifecycleEvents,
  getPurchaseOrderHandoffProjectionState,
  getPurchaseOrderHandoffs,
  normalizePurchaseOrderExecutionDocument,
  normalizePurchaseOrderHandoffProjectionState,
  normalizePurchaseOrderLifecycleEvent,
  retryPurchaseOrderHandoff,
  retryPurchaseOrderHandoffProjection,
} from './index';

const requestMocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));

vi.mock('#/api/request', () => ({ requestClient: requestMocks }));

function rawHandoff() {
  return {
    approvalSnapshotHash: 'a'.repeat(64),
    approvalSnapshotId: 601,
    attemptCount: 1,
    companyId: 1,
    erpCommandId: 'PROC_PO_700_101_USD',
    erpCancelReason: null,
    erpLastAction: 'CREATE',
    erpLastActorUserId: 164,
    erpLifecycleVersion: 0,
    erpPayloadHash: 'b'.repeat(64),
    erpPurchaseOrderId: 9901,
    erpPurchaseOrderNo: 'CG-9901',
    erpPurchaseOrderStatus: 'DRAFT',
    erpStatusUpdatedAt: '2026-08-29T18:30:00',
    erpSupplierId: 9001,
    exchangeRateToCny: '7.100000000000',
    id: 801,
    lines: [
      {
        cnyBaseUnitPrice: '61.94690264',
        erpProductId: 3001,
        erpPurchaseOrderItemId: 9911,
        erpQuantity: '120',
        erpUnitsPerPurchaseUnit: '12',
        id: 901,
        lineRef: 'PRI-11-A-91',
        originalBaseUnitPrice: '8.72491586',
        productId: 1001,
        productVersionToken: 'PV-11',
        promisedDate: '2026-09-20',
        purchaseQuantity: '10',
        purchaseUnit: 'CASE',
        quoteTaxIncluded: true,
        quotedUnitPrice: '120',
        quoteTierId: 601,
        quoteVersionId: 501,
        quoteVersionRef: 'QUOTE-501-V3',
        requisitionItemId: 11,
        requiredDate: '2026-09-20',
        skuId: 2001,
        sourceContractLineId: null,
        sourcePlanLineId: 1011,
        sourcingAllocationId: 91,
        sourcingCandidateId: 191,
        supplierProductId: 401,
        taxPercent: '13',
        taxRateFraction: '0.13',
        unitFreightAmount: '0',
      },
    ],
    quoteCurrency: 'USD',
    rateEffectiveDate: '2026-08-29',
    rateFallbackUsed: false,
    rateProvider: 'SAFE_PROVIDER',
    rateRequestedDate: '2026-08-29',
    requisitionId: 88,
    sourcingAssessmentId: 301,
    sourcingInputHash: 'c'.repeat(64),
    splitKey: '101:USD',
    status: 'SUCCESS',
    submissionSnapshotId: 501,
    submittedSnapshotHash: 'd'.repeat(64),
    submittedVersion: 4,
    supplierId: 101,
    version: 2,
  };
}

function rawExecutionDocument() {
  return {
    documentId: '9223372036854775807',
    documentNo: 'RK-20260829-001',
    documentTime: '2026-08-29T20:00:00',
    documentType: 'PURCHASE_IN',
    documentVersion: 2,
    events: [
      {
        action: 'POST',
        actorUserId: '9007199254740993',
        documentVersion: 1,
        eventId: 'erp-purchase-in:9001:v1:post',
        fromPostingState: 'DRAFT',
        occurredAt: '2026-08-29T20:00:00',
        postingState: 'POSTED',
        reason: null,
        result: 'APPLIED',
        reversesEventId: null,
      },
      {
        action: 'REVERSE',
        actorUserId: null,
        documentVersion: 2,
        eventId: 'erp-purchase-in:9001:v2:reverse',
        fromPostingState: 'POSTED',
        occurredAt: '2026-08-29T21:00:00',
        postingState: 'DRAFT',
        reason: '质检退回',
        result: 'APPLIED',
        reversesEventId: 'erp-purchase-in:9001:v1:post',
      },
    ],
    lastAction: 'REVERSE',
    lastActorUserId: 164,
    lastEventId: 'erp-purchase-in:9001:v2:reverse',
    lastOccurredAt: '2026-08-29T21:00:00',
    lastReason: '质检退回',
    lines: [
      {
        activeQuantity: '0',
        lastDocumentVersion: 2,
        lastEventId: 'erp-purchase-in:9001:v2:reverse',
        lastOccurredAt: '2026-08-29T21:00:00',
        lineRef: 'PRI-11-A-91',
        postingState: 'DRAFT',
        productId: 1001,
        productPrice: '12.00',
        purchaseInItemId: 90_011,
        purchaseOrderItemId: 9911,
        quantity: '10',
        requisitionItemId: 11,
        sourcingAllocationId: 91,
        taxPercent: null,
        taxPrice: null,
        totalPrice: '120.00',
        warehouseId: 301,
      },
    ],
    postingState: 'DRAFT',
  };
}

function rawReturnExecutionDocument() {
  return {
    ...rawExecutionDocument(),
    documentId: 9301,
    documentNo: 'TH-20260829-001',
    documentType: 'PURCHASE_RETURN',
    lines: [
      {
        ...rawExecutionDocument().lines[0],
        activeQuantity: '2',
        netReceivedQuantity: '6',
        purchaseInItemId: null,
        purchaseReturnItemId: 93_011,
        quantity: '2',
        receivedQuantity: '8',
        returnedQuantity: '2',
      },
    ],
  };
}

describe('procurement purchase-order handoff API', () => {
  beforeEach(() => vi.clearAllMocks());

  it('normalizes every backend Long before exposing the ledger to components', async () => {
    requestMocks.get.mockResolvedValueOnce([rawHandoff()]);

    const result = await getPurchaseOrderHandoffs('88');

    expect(requestMocks.get).toHaveBeenCalledWith(
      '/fdmprocurement/purchase-order-handoff/list',
      { params: { requisitionId: '88' } },
    );
    expect(result[0]).toMatchObject({
      approvalSnapshotId: '601',
      erpLastActorUserId: '164',
      erpLifecycleVersion: 0,
      erpPurchaseOrderId: '9901',
      erpSupplierId: '9001',
      id: '801',
      requisitionId: '88',
      supplierId: '101',
    });
    expect(typeof result[0]?.erpLastActorUserId).toBe('string');
    expect(result[0]?.lines[0]).toMatchObject({
      erpProductId: '3001',
      erpPurchaseOrderItemId: '9911',
      id: '901',
      requisitionItemId: '11',
      sourcingAllocationId: '91',
    });
  });

  it('uses dedicated get and optimistic manual-retry endpoints', async () => {
    requestMocks.get.mockResolvedValueOnce(rawHandoff());
    requestMocks.post.mockResolvedValueOnce(rawHandoff());

    await getPurchaseOrderHandoff('801');
    await retryPurchaseOrderHandoff({ expectedVersion: 2, id: '801' });

    expect(requestMocks.get).toHaveBeenCalledWith(
      '/fdmprocurement/purchase-order-handoff/get',
      { params: { id: '801' } },
    );
    expect(requestMocks.post).toHaveBeenCalledWith(
      '/fdmprocurement/purchase-order-handoff/retry',
      { expectedVersion: 2, id: '801' },
    );
  });

  it('loads projection state and normalizes requisition/outbox Long values', async () => {
    requestMocks.get.mockResolvedValueOnce({
      availableAt: '2026-08-29T19:00:00',
      deadLetterAt: null,
      handoffCount: 0,
      lastErrorCode: 'PROJECTION_TEMPORARY_FAILURE',
      lastErrorMessage: '等待自动重试',
      outboxId: 700,
      outboxVersion: 9,
      publishedAt: null,
      requisitionId: 88,
      retryCount: 2,
      status: 'FAILED',
    });

    const result = await getPurchaseOrderHandoffProjectionState('88');

    expect(requestMocks.get).toHaveBeenCalledWith(
      '/fdmprocurement/purchase-order-handoff/projection-state',
      { params: { requisitionId: '88' } },
    );
    expect(result).toMatchObject({
      outboxId: '700',
      outboxVersion: 9,
      requisitionId: '88',
      retryCount: 2,
      status: 'FAILED',
    });
  });

  it('requeues only the explicit projection identity and normalizes the returned state', async () => {
    requestMocks.post.mockResolvedValueOnce({
      availableAt: '2026-08-29T21:00:00',
      deadLetterAt: null,
      handoffCount: 0,
      lastErrorCode: null,
      lastErrorMessage: null,
      outboxId: 700,
      outboxVersion: 10,
      publishedAt: null,
      requisitionId: 88,
      retryCount: 5,
      status: 'PENDING',
    });

    const result = await retryPurchaseOrderHandoffProjection({
      expectedVersion: 9,
      outboxId: '700',
      reason: '已确认上游映射修复',
      requisitionId: '88',
    });

    expect(requestMocks.post).toHaveBeenCalledWith(
      '/fdmprocurement/purchase-order-handoff/retry-projection',
      {
        expectedVersion: 9,
        outboxId: '700',
        reason: '已确认上游映射修复',
        requisitionId: '88',
      },
    );
    expect(result).toMatchObject({
      outboxId: '700',
      outboxVersion: 10,
      requisitionId: '88',
      retryCount: 5,
      status: 'PENDING',
    });
  });

  it('loads lifecycle history and preserves backend ordering while normalizing actor Long values', async () => {
    requestMocks.get.mockResolvedValueOnce([
      {
        action: 'CONFIRM',
        actorUserId: '9007199254740993',
        erpScopeKey: 'tenant:1:company:1',
        eventId: 'erp-po:9901:v1',
        fromStatus: 'DRAFT',
        lifecycleVersion: 1,
        occurredAt: '2026-08-29T19:00:00',
        processedAt: '2026-08-29T19:00:01',
        reason: '采购经理确认',
        result: 'APPLIED',
        toStatus: 'CONFIRMED',
      },
      {
        action: 'UNCONFIRM',
        actorUserId: null,
        erpScopeKey: 'tenant:1:company:1',
        eventId: 'erp-po:9901:v2',
        fromStatus: 'CONFIRMED',
        lifecycleVersion: 2,
        occurredAt: '2026-08-29T20:00:00',
        processedAt: '2026-08-29T20:00:01',
        reason: null,
        result: 'APPLIED',
        toStatus: 'DRAFT',
      },
    ]);

    const result = await getPurchaseOrderHandoffLifecycleEvents('801');

    expect(requestMocks.get).toHaveBeenCalledWith(
      '/fdmprocurement/purchase-order-handoff/lifecycle-events',
      { params: { handoffId: '801' } },
    );
    expect(result.map((event) => event.lifecycleVersion)).toEqual([1, 2]);
    expect(result[0]?.actorUserId).toBe('9007199254740993');
    expect(result[1]?.actorUserId).toBeNull();
  });

  it('normalizes an actor id without changing lifecycle evidence fields', () => {
    expect(
      normalizePurchaseOrderLifecycleEvent({
        action: 'CANCEL',
        actorUserId: 164 as unknown as string,
        erpScopeKey: 'tenant:1:company:1',
        eventId: 'erp-po:9901:v3',
        fromStatus: 'DRAFT',
        lifecycleVersion: 3,
        occurredAt: '2026-08-29T21:00:00',
        processedAt: null,
        reason: '供应商无法交付',
        result: 'APPLIED',
        toStatus: 'CANCELLED',
      }),
    ).toEqual({
      action: 'CANCEL',
      actorUserId: '164',
      erpScopeKey: 'tenant:1:company:1',
      eventId: 'erp-po:9901:v3',
      fromStatus: 'DRAFT',
      lifecycleVersion: 3,
      occurredAt: '2026-08-29T21:00:00',
      processedAt: null,
      reason: '供应商无法交付',
      result: 'APPLIED',
      toStatus: 'CANCELLED',
    });
  });

  it('lazily loads execution documents and normalizes every browser-facing Long', async () => {
    requestMocks.get.mockResolvedValueOnce([rawExecutionDocument()]);

    const result = await getPurchaseOrderHandoffExecutionFacts('801');

    expect(requestMocks.get).toHaveBeenCalledWith(
      '/fdmprocurement/purchase-order-handoff/execution-facts',
      { params: { handoffId: '801' } },
    );
    expect(result[0]).toMatchObject({
      documentId: '9223372036854775807',
      lastActorUserId: '164',
      postingState: 'DRAFT',
    });
    expect(result[0]?.lines[0]).toMatchObject({
      activeQuantity: '0',
      productId: '1001',
      purchaseInItemId: '90011',
      purchaseOrderItemId: '9911',
      requisitionItemId: '11',
      sourcingAllocationId: '91',
      warehouseId: '301',
    });
    expect(result[0]?.events.map((event) => event.action)).toEqual([
      'POST',
      'REVERSE',
    ]);
    expect(result[0]?.events[0]?.actorUserId).toBe('9007199254740993');
    expect(result[0]?.events[1]?.actorUserId).toBeNull();
  });

  it('normalizes one execution document without altering quantities or immutable event evidence', () => {
    const normalized = normalizePurchaseOrderExecutionDocument(
      rawExecutionDocument() as unknown as FdmProcurementPurchaseOrderHandoffApi.ExecutionDocument,
    );

    expect(normalized.documentId).toBe('9223372036854775807');
    expect(normalized.lines[0]?.quantity).toBe('10');
    expect(normalized.lines[0]?.activeQuantity).toBe('0');
    expect(normalized.lines[0]?.taxPercent).toBeNull();
    expect(normalized.lines[0]?.taxPrice).toBeNull();
    expect(normalized.events[1]?.reversesEventId).toBe(
      'erp-purchase-in:9001:v1:post',
    );
    expect(normalized.events[1]?.reason).toBe('质检退回');
  });

  it('normalizes return-line identity and preserves authoritative net receipt totals', () => {
    const normalized = normalizePurchaseOrderExecutionDocument(
      rawReturnExecutionDocument() as unknown as FdmProcurementPurchaseOrderHandoffApi.ExecutionDocument,
    );

    expect(normalized.documentType).toBe('PURCHASE_RETURN');
    expect(normalized.lines[0]).toMatchObject({
      netReceivedQuantity: '6',
      purchaseInItemId: null,
      purchaseReturnItemId: '93011',
      receivedQuantity: '8',
      returnedQuantity: '2',
    });
  });

  it('preserves a missing outbox identity for NOT_CREATED state', () => {
    expect(
      normalizePurchaseOrderHandoffProjectionState({
        handoffCount: 0,
        outboxId: null,
        requisitionId: 88 as unknown as string,
        retryCount: 0,
        status: 'NOT_CREATED',
      }),
    ).toEqual({
      handoffCount: 0,
      outboxId: null,
      requisitionId: '88',
      retryCount: 0,
      status: 'NOT_CREATED',
    });
  });
});
