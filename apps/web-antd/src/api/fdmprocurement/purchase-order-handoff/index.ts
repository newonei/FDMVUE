import { requestClient } from '#/api/request';

import { normalizeId, normalizeNullableId } from '../id-normalizer';

export namespace FdmProcurementPurchaseOrderHandoffApi {
  export type DateTimeValue = number | string;
  export type DecimalValue = number | string;
  export type HandoffStatus =
    | 'MANUAL_REVIEW'
    | 'PROCESSING'
    | 'READY'
    | 'RETRY_WAIT'
    | 'SUCCESS';
  export type ProjectionStatus =
    | 'DEAD_LETTER'
    | 'FAILED'
    | 'NOT_CREATED'
    | 'PENDING'
    | 'PROCESSING'
    | 'PUBLISHED';
  export type LifecycleAction = 'CANCEL' | 'CONFIRM' | 'UNCONFIRM';
  export type LifecycleStatus =
    | 'APPROVED'
    | 'CANCELLED'
    | 'CONFIRMED'
    | 'DRAFT';
  export type LifecycleProcessingResult = 'APPLIED' | 'IGNORED_STALE';
  export type ExecutionAction = 'POST' | 'REVERSE';
  export type ExecutionPostingState = 'DRAFT' | 'POSTED';
  export type ExecutionProcessingResult = 'APPLIED' | 'IGNORED_STALE';

  /**
   * Read-only projection of one immutable ERP lifecycle event. Browser-facing
   * Long values are strings so IDs above Number.MAX_SAFE_INTEGER stay exact.
   */
  export interface LifecycleEvent {
    action: LifecycleAction;
    actorUserId?: null | string;
    erpScopeKey: string;
    eventId: string;
    fromStatus?: LifecycleStatus | null;
    lifecycleVersion: number;
    occurredAt: DateTimeValue;
    processedAt?: DateTimeValue | null;
    reason?: null | string;
    result: LifecycleProcessingResult;
    toStatus: LifecycleStatus;
  }

  export interface ProjectionState {
    availableAt?: DateTimeValue | null;
    deadLetterAt?: DateTimeValue | null;
    handoffCount: number;
    lastErrorCode?: null | string;
    lastErrorMessage?: null | string;
    outboxId?: null | string;
    outboxVersion?: null | number;
    publishedAt?: DateTimeValue | null;
    requisitionId: string;
    retryCount: number;
    status: ProjectionStatus;
  }

  /** Immutable POST/REVERSE transition for one ERP purchase execution document. */
  export interface ExecutionEvent {
    action: ExecutionAction;
    actorUserId?: null | string;
    documentVersion: number;
    eventId: string;
    fromPostingState: ExecutionPostingState;
    occurredAt: DateTimeValue;
    postingState: ExecutionPostingState;
    reason?: null | string;
    result: ExecutionProcessingResult;
    reversesEventId?: null | string;
  }

  /**
   * Current line projection. activeQuantity is zero after an applied REVERSE.
   * Aggregate quantities are the authoritative current purchase-order-line balance.
   */
  export interface ExecutionLine {
    activeQuantity: DecimalValue;
    lastDocumentVersion: number;
    lastEventId: string;
    lastOccurredAt: DateTimeValue;
    lineRef: string;
    postingState: ExecutionPostingState;
    productId: string;
    productPrice: DecimalValue;
    purchaseInItemId?: null | string;
    purchaseOrderItemId: string;
    purchaseReturnItemId?: null | string;
    quantity: DecimalValue;
    receivedQuantity?: DecimalValue | null;
    requisitionItemId: string;
    returnedQuantity?: DecimalValue | null;
    netReceivedQuantity?: DecimalValue | null;
    sourcingAllocationId: string;
    taxPercent: DecimalValue | null;
    taxPrice: DecimalValue | null;
    totalPrice: DecimalValue;
    warehouseId: string;
  }

  /** Current ERP receipt/return posting state plus its immutable event history. */
  export interface ExecutionDocument {
    documentId: string;
    documentNo: string;
    documentTime: DateTimeValue;
    documentType: string;
    documentVersion: number;
    events: ExecutionEvent[];
    lastAction: ExecutionAction;
    lastActorUserId?: null | string;
    lastEventId: string;
    lastOccurredAt: DateTimeValue;
    lastReason?: null | string;
    lines: ExecutionLine[];
    postingState: ExecutionPostingState;
  }

  export interface HandoffLine {
    cnyBaseUnitPrice: DecimalValue;
    erpProductId: string;
    erpPurchaseOrderItemId?: null | string;
    erpQuantity: DecimalValue;
    erpUnitsPerPurchaseUnit: DecimalValue;
    id: string;
    lineRef: string;
    originalBaseUnitPrice: DecimalValue;
    productId: string;
    productVersionToken: string;
    promisedDate: string;
    purchaseQuantity: DecimalValue;
    purchaseUnit: string;
    quoteTaxIncluded: boolean;
    quotedUnitPrice: DecimalValue;
    quoteTierId: string;
    quoteVersionId: string;
    quoteVersionRef: string;
    requisitionItemId: string;
    requiredDate: string;
    skuId: string;
    sourceContractLineId?: null | string;
    sourcePlanLineId: string;
    sourcingAllocationId: string;
    sourcingCandidateId: string;
    supplierProductId: string;
    taxPercent: DecimalValue;
    taxRateFraction: DecimalValue;
    unitFreightAmount: DecimalValue;
  }

  export interface Handoff {
    approvalSnapshotHash: string;
    approvalSnapshotId: string;
    attemptCount: number;
    companyId: string;
    completedAt?: DateTimeValue | null;
    erpCommandId: string;
    erpPayloadHash?: null | string;
    erpCancelReason?: null | string;
    erpLastAction?: null | string;
    erpLastActorUserId?: null | string;
    erpLifecycleVersion?: null | number;
    erpPurchaseOrderId?: null | string;
    erpPurchaseOrderNo?: null | string;
    erpPurchaseOrderStatus?: null | string;
    erpStatusUpdatedAt?: DateTimeValue | null;
    erpSupplierId: string;
    exchangeRateToCny: DecimalValue;
    id: string;
    lastAttemptAt?: DateTimeValue | null;
    lastErrorCode?: null | string;
    lastErrorMessage?: null | string;
    lines: HandoffLine[];
    nextRetryAt?: DateTimeValue | null;
    quoteCurrency: string;
    rateEffectiveDate: string;
    rateFallbackUsed: boolean;
    rateProvider: string;
    rateRequestedDate: string;
    rateRetrievedAt?: DateTimeValue | null;
    requisitionId: string;
    sourcingAssessmentId: string;
    sourcingInputHash: string;
    splitKey: string;
    status: HandoffStatus;
    submissionSnapshotId: string;
    submittedSnapshotHash: string;
    submittedVersion: number;
    supplierId: string;
    version: number;
  }

  export interface RetryReq {
    expectedVersion: number;
    id: string;
  }

  export interface ProjectionRetryReq {
    expectedVersion: number;
    outboxId: string;
    reason: string;
    requisitionId: string;
  }
}

const BASE_URL = '/fdmprocurement/purchase-order-handoff';

function normalizeLine(
  value: FdmProcurementPurchaseOrderHandoffApi.HandoffLine,
): FdmProcurementPurchaseOrderHandoffApi.HandoffLine {
  return {
    ...value,
    erpProductId: normalizeId(value.erpProductId, 'handoffLine.erpProductId'),
    erpPurchaseOrderItemId: normalizeNullableId(
      value.erpPurchaseOrderItemId,
      'handoffLine.erpPurchaseOrderItemId',
    ),
    id: normalizeId(value.id, 'handoffLine.id'),
    productId: normalizeId(value.productId, 'handoffLine.productId'),
    quoteTierId: normalizeId(value.quoteTierId, 'handoffLine.quoteTierId'),
    quoteVersionId: normalizeId(
      value.quoteVersionId,
      'handoffLine.quoteVersionId',
    ),
    requisitionItemId: normalizeId(
      value.requisitionItemId,
      'handoffLine.requisitionItemId',
    ),
    skuId: normalizeId(value.skuId, 'handoffLine.skuId'),
    sourceContractLineId: normalizeNullableId(
      value.sourceContractLineId,
      'handoffLine.sourceContractLineId',
    ),
    sourcePlanLineId: normalizeId(
      value.sourcePlanLineId,
      'handoffLine.sourcePlanLineId',
    ),
    sourcingAllocationId: normalizeId(
      value.sourcingAllocationId,
      'handoffLine.sourcingAllocationId',
    ),
    sourcingCandidateId: normalizeId(
      value.sourcingCandidateId,
      'handoffLine.sourcingCandidateId',
    ),
    supplierProductId: normalizeId(
      value.supplierProductId,
      'handoffLine.supplierProductId',
    ),
  };
}

export function normalizePurchaseOrderHandoff(
  value: FdmProcurementPurchaseOrderHandoffApi.Handoff,
): FdmProcurementPurchaseOrderHandoffApi.Handoff {
  return {
    ...value,
    approvalSnapshotId: normalizeId(
      value.approvalSnapshotId,
      'handoff.approvalSnapshotId',
    ),
    companyId: normalizeId(value.companyId, 'handoff.companyId'),
    erpPurchaseOrderId: normalizeNullableId(
      value.erpPurchaseOrderId,
      'handoff.erpPurchaseOrderId',
    ),
    erpLastActorUserId: normalizeNullableId(
      value.erpLastActorUserId,
      'handoff.erpLastActorUserId',
    ),
    erpSupplierId: normalizeId(value.erpSupplierId, 'handoff.erpSupplierId'),
    id: normalizeId(value.id, 'handoff.id'),
    lines: value.lines.map(normalizeLine),
    requisitionId: normalizeId(value.requisitionId, 'handoff.requisitionId'),
    sourcingAssessmentId: normalizeId(
      value.sourcingAssessmentId,
      'handoff.sourcingAssessmentId',
    ),
    submissionSnapshotId: normalizeId(
      value.submissionSnapshotId,
      'handoff.submissionSnapshotId',
    ),
    supplierId: normalizeId(value.supplierId, 'handoff.supplierId'),
  };
}

export function normalizePurchaseOrderHandoffProjectionState(
  value: FdmProcurementPurchaseOrderHandoffApi.ProjectionState,
): FdmProcurementPurchaseOrderHandoffApi.ProjectionState {
  return {
    ...value,
    outboxId: normalizeNullableId(value.outboxId, 'projectionState.outboxId'),
    requisitionId: normalizeId(
      value.requisitionId,
      'projectionState.requisitionId',
    ),
  };
}

export function normalizePurchaseOrderLifecycleEvent(
  value: FdmProcurementPurchaseOrderHandoffApi.LifecycleEvent,
): FdmProcurementPurchaseOrderHandoffApi.LifecycleEvent {
  return {
    ...value,
    actorUserId: normalizeNullableId(
      value.actorUserId,
      'lifecycleEvent.actorUserId',
    ),
  };
}

function normalizePurchaseOrderExecutionLine(
  value: FdmProcurementPurchaseOrderHandoffApi.ExecutionLine,
): FdmProcurementPurchaseOrderHandoffApi.ExecutionLine {
  return {
    ...value,
    productId: normalizeId(value.productId, 'executionLine.productId'),
    purchaseInItemId: normalizeNullableId(
      value.purchaseInItemId,
      'executionLine.purchaseInItemId',
    ),
    purchaseOrderItemId: normalizeId(
      value.purchaseOrderItemId,
      'executionLine.purchaseOrderItemId',
    ),
    purchaseReturnItemId: normalizeNullableId(
      value.purchaseReturnItemId,
      'executionLine.purchaseReturnItemId',
    ),
    requisitionItemId: normalizeId(
      value.requisitionItemId,
      'executionLine.requisitionItemId',
    ),
    sourcingAllocationId: normalizeId(
      value.sourcingAllocationId,
      'executionLine.sourcingAllocationId',
    ),
    warehouseId: normalizeId(value.warehouseId, 'executionLine.warehouseId'),
  };
}

function normalizePurchaseOrderExecutionEvent(
  value: FdmProcurementPurchaseOrderHandoffApi.ExecutionEvent,
): FdmProcurementPurchaseOrderHandoffApi.ExecutionEvent {
  return {
    ...value,
    actorUserId: normalizeNullableId(
      value.actorUserId,
      'executionEvent.actorUserId',
    ),
  };
}

export function normalizePurchaseOrderExecutionDocument(
  value: FdmProcurementPurchaseOrderHandoffApi.ExecutionDocument,
): FdmProcurementPurchaseOrderHandoffApi.ExecutionDocument {
  return {
    ...value,
    documentId: normalizeId(value.documentId, 'executionDocument.documentId'),
    events: value.events.map(normalizePurchaseOrderExecutionEvent),
    lastActorUserId: normalizeNullableId(
      value.lastActorUserId,
      'executionDocument.lastActorUserId',
    ),
    lines: value.lines.map(normalizePurchaseOrderExecutionLine),
  };
}

export async function getPurchaseOrderHandoffProjectionState(
  requisitionId: string,
) {
  const result =
    await requestClient.get<FdmProcurementPurchaseOrderHandoffApi.ProjectionState>(
      `${BASE_URL}/projection-state`,
      { params: { requisitionId } },
    );
  return normalizePurchaseOrderHandoffProjectionState(result);
}

export async function getPurchaseOrderHandoffs(requisitionId: string) {
  const result = await requestClient.get<
    FdmProcurementPurchaseOrderHandoffApi.Handoff[]
  >(`${BASE_URL}/list`, { params: { requisitionId } });
  return result.map((handoff) => normalizePurchaseOrderHandoff(handoff));
}

export async function getPurchaseOrderHandoffLifecycleEvents(
  handoffId: string,
) {
  const result = await requestClient.get<
    FdmProcurementPurchaseOrderHandoffApi.LifecycleEvent[]
  >(`${BASE_URL}/lifecycle-events`, { params: { handoffId } });
  return result.map((event) => normalizePurchaseOrderLifecycleEvent(event));
}

export async function getPurchaseOrderHandoffExecutionFacts(handoffId: string) {
  const result = await requestClient.get<
    FdmProcurementPurchaseOrderHandoffApi.ExecutionDocument[]
  >(`${BASE_URL}/execution-facts`, { params: { handoffId } });
  return result.map((document) =>
    normalizePurchaseOrderExecutionDocument(document),
  );
}

export async function getPurchaseOrderHandoff(id: string) {
  const result =
    await requestClient.get<FdmProcurementPurchaseOrderHandoffApi.Handoff>(
      `${BASE_URL}/get`,
      { params: { id } },
    );
  return normalizePurchaseOrderHandoff(result);
}

export async function retryPurchaseOrderHandoff(
  data: FdmProcurementPurchaseOrderHandoffApi.RetryReq,
) {
  const result =
    await requestClient.post<FdmProcurementPurchaseOrderHandoffApi.Handoff>(
      `${BASE_URL}/retry`,
      data,
    );
  return normalizePurchaseOrderHandoff(result);
}

export async function retryPurchaseOrderHandoffProjection(
  data: FdmProcurementPurchaseOrderHandoffApi.ProjectionRetryReq,
) {
  const result =
    await requestClient.post<FdmProcurementPurchaseOrderHandoffApi.ProjectionState>(
      `${BASE_URL}/retry-projection`,
      data,
    );
  return normalizePurchaseOrderHandoffProjectionState(result);
}
