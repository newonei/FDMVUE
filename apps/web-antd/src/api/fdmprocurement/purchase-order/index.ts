import { requestClient } from '#/api/request';

import { normalizeId, normalizeNullableId } from '../id-normalizer';

export namespace FdmProcurementPurchaseOrderApi {
  export type DateTimeValue = number | string;
  export type DecimalValue = number | string;
  export type PurchaseOrderProjectionStatus =
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
   * Read-only projection of one immutable FDM purchase-order lifecycle event.
   * Browser-facing
   * Long values are strings so IDs above Number.MAX_SAFE_INTEGER stay exact.
   */
  export interface LifecycleEvent {
    action: LifecycleAction;
    actorUserId?: null | string;
    scopeKey: string;
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
    purchaseOrderCount: number;
    lastErrorCode?: null | string;
    lastErrorMessage?: null | string;
    outboxId?: null | string;
    outboxVersion?: null | number;
    publishedAt?: DateTimeValue | null;
    requisitionId: string;
    retryCount: number;
    status: ProjectionStatus;
  }

  /** Immutable POST/REVERSE transition for one FDM purchase execution document. */
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
    purchaseReceiptItemId?: null | string;
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

  /** Current receipt/return posting state plus its immutable event history. */
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

  export interface PurchaseOrderLine {
    cnyBaseUnitPrice: DecimalValue;
    writeModelProductId: string;
    purchaseOrderItemId?: null | string;
    stockQuantity: DecimalValue;
    unitsPerPurchaseUnit: DecimalValue;
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

  export interface PurchaseOrderProjection {
    approvalSnapshotHash: string;
    approvalSnapshotId: string;
    attemptCount: number;
    companyId: string;
    completedAt?: DateTimeValue | null;
    commandId: string;
    payloadHash?: null | string;
    cancelReason?: null | string;
    lastAction?: null | string;
    lastActorUserId?: null | string;
    lifecycleVersion?: null | number;
    purchaseOrderId?: null | string;
    purchaseOrderNo?: null | string;
    purchaseOrderStatus?: null | string;
    statusUpdatedAt?: DateTimeValue | null;
    exchangeRateToCny: DecimalValue;
    id: string;
    lastAttemptAt?: DateTimeValue | null;
    lastErrorCode?: null | string;
    lastErrorMessage?: null | string;
    lines: PurchaseOrderLine[];
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
    status: PurchaseOrderProjectionStatus;
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

const BASE_URL = '/fdmprocurement/purchase-order';

function normalizeLine(
  value: FdmProcurementPurchaseOrderApi.PurchaseOrderLine,
): FdmProcurementPurchaseOrderApi.PurchaseOrderLine {
  return {
    ...value,
    writeModelProductId: normalizeId(
      value.writeModelProductId,
      'purchaseOrderProjectionLine.writeModelProductId',
    ),
    purchaseOrderItemId: normalizeNullableId(
      value.purchaseOrderItemId,
      'purchaseOrderProjectionLine.purchaseOrderItemId',
    ),
    id: normalizeId(value.id, 'purchaseOrderProjectionLine.id'),
    productId: normalizeId(
      value.productId,
      'purchaseOrderProjectionLine.productId',
    ),
    quoteTierId: normalizeId(
      value.quoteTierId,
      'purchaseOrderProjectionLine.quoteTierId',
    ),
    quoteVersionId: normalizeId(
      value.quoteVersionId,
      'purchaseOrderProjectionLine.quoteVersionId',
    ),
    requisitionItemId: normalizeId(
      value.requisitionItemId,
      'purchaseOrderProjectionLine.requisitionItemId',
    ),
    skuId: normalizeId(value.skuId, 'purchaseOrderProjectionLine.skuId'),
    sourceContractLineId: normalizeNullableId(
      value.sourceContractLineId,
      'purchaseOrderProjectionLine.sourceContractLineId',
    ),
    sourcePlanLineId: normalizeId(
      value.sourcePlanLineId,
      'purchaseOrderProjectionLine.sourcePlanLineId',
    ),
    sourcingAllocationId: normalizeId(
      value.sourcingAllocationId,
      'purchaseOrderProjectionLine.sourcingAllocationId',
    ),
    sourcingCandidateId: normalizeId(
      value.sourcingCandidateId,
      'purchaseOrderProjectionLine.sourcingCandidateId',
    ),
    supplierProductId: normalizeId(
      value.supplierProductId,
      'purchaseOrderProjectionLine.supplierProductId',
    ),
  };
}

export function normalizePurchaseOrderProjection(
  value: FdmProcurementPurchaseOrderApi.PurchaseOrderProjection,
): FdmProcurementPurchaseOrderApi.PurchaseOrderProjection {
  return {
    ...value,
    approvalSnapshotId: normalizeId(
      value.approvalSnapshotId,
      'purchaseOrderProjection.approvalSnapshotId',
    ),
    companyId: normalizeId(
      value.companyId,
      'purchaseOrderProjection.companyId',
    ),
    purchaseOrderId: normalizeNullableId(
      value.purchaseOrderId,
      'purchaseOrderProjection.purchaseOrderId',
    ),
    lastActorUserId: normalizeNullableId(
      value.lastActorUserId,
      'purchaseOrderProjection.lastActorUserId',
    ),
    id: normalizeId(value.id, 'purchaseOrderProjection.id'),
    lines: value.lines.map(normalizeLine),
    requisitionId: normalizeId(
      value.requisitionId,
      'purchaseOrderProjection.requisitionId',
    ),
    sourcingAssessmentId: normalizeId(
      value.sourcingAssessmentId,
      'purchaseOrderProjection.sourcingAssessmentId',
    ),
    submissionSnapshotId: normalizeId(
      value.submissionSnapshotId,
      'purchaseOrderProjection.submissionSnapshotId',
    ),
    supplierId: normalizeId(
      value.supplierId,
      'purchaseOrderProjection.supplierId',
    ),
  };
}

export function normalizePurchaseOrderProjectionState(
  value: FdmProcurementPurchaseOrderApi.ProjectionState,
): FdmProcurementPurchaseOrderApi.ProjectionState {
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
  value: FdmProcurementPurchaseOrderApi.LifecycleEvent,
): FdmProcurementPurchaseOrderApi.LifecycleEvent {
  return {
    ...value,
    actorUserId: normalizeNullableId(
      value.actorUserId,
      'lifecycleEvent.actorUserId',
    ),
  };
}

function normalizePurchaseOrderExecutionLine(
  value: FdmProcurementPurchaseOrderApi.ExecutionLine,
): FdmProcurementPurchaseOrderApi.ExecutionLine {
  return {
    ...value,
    productId: normalizeId(value.productId, 'executionLine.productId'),
    purchaseReceiptItemId: normalizeNullableId(
      value.purchaseReceiptItemId,
      'executionLine.purchaseReceiptItemId',
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
  value: FdmProcurementPurchaseOrderApi.ExecutionEvent,
): FdmProcurementPurchaseOrderApi.ExecutionEvent {
  return {
    ...value,
    actorUserId: normalizeNullableId(
      value.actorUserId,
      'executionEvent.actorUserId',
    ),
  };
}

export function normalizePurchaseOrderExecutionDocument(
  value: FdmProcurementPurchaseOrderApi.ExecutionDocument,
): FdmProcurementPurchaseOrderApi.ExecutionDocument {
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

export async function getPurchaseOrderProjectionState(requisitionId: string) {
  const result =
    await requestClient.get<FdmProcurementPurchaseOrderApi.ProjectionState>(
      `${BASE_URL}/projection-state`,
      { params: { requisitionId } },
    );
  return normalizePurchaseOrderProjectionState(result);
}

export async function getPurchaseOrderProjections(requisitionId: string) {
  const result = await requestClient.get<
    FdmProcurementPurchaseOrderApi.PurchaseOrderProjection[]
  >(`${BASE_URL}/list`, { params: { requisitionId } });
  return result.map((purchaseOrderProjection) =>
    normalizePurchaseOrderProjection(purchaseOrderProjection),
  );
}

export async function getPurchaseOrderLifecycleEvents(projectionId: string) {
  const result = await requestClient.get<
    FdmProcurementPurchaseOrderApi.LifecycleEvent[]
  >(`${BASE_URL}/lifecycle-events`, { params: { projectionId } });
  return result.map((event) => normalizePurchaseOrderLifecycleEvent(event));
}

export async function getPurchaseOrderExecutionFacts(projectionId: string) {
  const result = await requestClient.get<
    FdmProcurementPurchaseOrderApi.ExecutionDocument[]
  >(`${BASE_URL}/execution-facts`, { params: { projectionId } });
  return result.map((document) =>
    normalizePurchaseOrderExecutionDocument(document),
  );
}

export async function getPurchaseOrderProjection(id: string) {
  const result =
    await requestClient.get<FdmProcurementPurchaseOrderApi.PurchaseOrderProjection>(
      `${BASE_URL}/get`,
      { params: { id } },
    );
  return normalizePurchaseOrderProjection(result);
}

export async function retryPurchaseOrderProjection(
  data: FdmProcurementPurchaseOrderApi.RetryReq,
) {
  const result =
    await requestClient.post<FdmProcurementPurchaseOrderApi.PurchaseOrderProjection>(
      `${BASE_URL}/retry`,
      data,
    );
  return normalizePurchaseOrderProjection(result);
}

export async function retryPurchaseOrderPublication(
  data: FdmProcurementPurchaseOrderApi.ProjectionRetryReq,
) {
  const result =
    await requestClient.post<FdmProcurementPurchaseOrderApi.ProjectionState>(
      `${BASE_URL}/retry-projection`,
      data,
    );
  return normalizePurchaseOrderProjectionState(result);
}
