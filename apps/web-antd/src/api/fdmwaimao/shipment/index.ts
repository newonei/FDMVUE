import type { PageParam, PageResult } from '@vben/request';

import { requestClient } from '#/api/request';

export namespace FdmWaimaoShipmentApi {
  export type DateTimeValue = number | string;
  export type DecimalValue = string;
  /** Java Long values are serialized as canonical decimal strings. */
  export type JavaLongString = string;
  export type GenerationJobStatus =
    | 'CANCELLED'
    | 'CONTEXT_BUILDING'
    | 'CREATED'
    | 'EXPIRED'
    | 'FAILED'
    | 'GENERATING'
    | 'MATERIALIZED'
    | 'PARSING'
    | 'QUEUED'
    | 'READY'
    | 'RULE_BLOCKED'
    | 'STALE'
    | 'VALIDATING';
  export type ShipmentStatus = 'CANCELLED' | 'CONFIRMED' | 'DRAFT';
  export type ReservationStatus =
    | 'ACTIVE'
    | 'CONSUMED'
    | 'EXPIRED'
    | 'HANDED_OFF'
    | 'HANDOFF_PENDING'
    | 'RELEASED';
  export type ShipmentNextRequiredAction =
    | 'CANCELLED'
    | 'RE_RESERVE_WAREHOUSE_STOCK'
    | 'READINESS_TO_SHIPMENT'
    | 'RESERVE_WAREHOUSE_STOCK'
    | 'RUN_READINESS_TO_SHIPMENT'
    | 'SHIPMENT_CONFIRMATION'
    | 'WAREHOUSE_HANDOFF'
    | 'WAREHOUSE_HANDOFF_PENDING'
    | 'WAREHOUSE_HANDOFF_RECOVERY_REQUIRED'
    | 'WAREHOUSE_OUTBOUND_COMPLETED'
    | 'WAREHOUSE_OUTBOUND_PENDING';
  export type TransportMode =
    | 'AIR'
    | 'COURIER'
    | 'MULTIMODAL'
    | 'OTHER'
    | 'RAIL'
    | 'ROAD'
    | 'SEA';

  export interface PageReq extends PageParam {
    companyId?: string;
    contractOrderId?: string;
    customerId?: string;
    etd?: [string, string];
    fulfillmentPlanId?: string;
    keyword?: string;
    ownerUserId?: string;
    status?: ShipmentStatus;
    transportMode?: TransportMode;
  }

  export interface Source {
    authorityPoolKey: string;
    evidenceExpiresAt: DateTimeValue;
    evidenceHash: string;
    evidenceObservedAt: DateTimeValue;
    evidenceRef: string;
    evidenceType: string;
    evidenceVersion: string;
    id: string;
    plannedQuantity: DecimalValue;
    readinessStatus: 'READY';
    sequenceNo: number;
    sourcePayloadHash: string;
    sourceRequestId: string;
    /** Monotonic WAREHOUSE publication identity; keep as string to avoid JS Long precision loss. */
    sourceSequence: JavaLongString;
    sourceSystem: string;
    sourceVersion: string;
    sourceLineRefId?: null | string;
    sourceRefId?: null | string;
    sourceType: 'WAREHOUSE';
    warehouseId: string;
    warehouseAuthorityEffectiveFrom: DateTimeValue;
    warehouseAuthorityEffectiveTo?: DateTimeValue | null;
    warehouseAuthorityEvidenceRef: string;
    warehouseAuthorityEvidenceType: string;
    warehouseAuthorityHash: string;
    warehouseAuthorityMappingId: JavaLongString;
    warehouseAuthorityVersion: number;
  }

  export interface Line {
    actualOutboundQuantity: DecimalValue;
    id: string;
    lineNo: number;
    plannedQuantity: DecimalValue;
    productCode?: null | string;
    productId: string;
    productName: string;
    productVersionToken: string;
    skuId: string;
    sourceContractOrderItemId: string;
    sourceFulfillmentPlanLineId: string;
    sources: Source[];
    unit: string;
  }

  export interface WarehouseOutboundOrder {
    handedOffTime: DateTimeValue;
    lineCount: number;
    warehouseId: JavaLongString;
    status: 'FINISHED' | 'PREPARE';
    outboundOrderId: JavaLongString;
    outboundOrderNo: string;
  }

  export interface Detail {
    bookingNo?: null | string;
    cancelReason?: null | string;
    cancelledByUserId?: null | string;
    cancelledTime?: DateTimeValue | null;
    carrierName?: null | string;
    companyId: string;
    companyName?: null | string;
    confirmAvailable: boolean;
    confirmationIdempotencyKey?: null | string;
    confirmationOutboxEventId?: null | string;
    confirmationRequestHash?: null | string;
    confirmedByUserId?: JavaLongString | null;
    confirmedSnapshotHash?: null | string;
    confirmedTime?: DateTimeValue | null;
    contractOrderId: string;
    contractOrderNo?: null | string;
    contractOrderVersion: number;
    contractSnapshotHash: string;
    contractSubject?: null | string;
    createTime?: DateTimeValue | null;
    creationIdempotencyKey: string;
    creationRequestHash: string;
    customerId: string;
    customerName?: null | string;
    deliveryLocation?: null | string;
    directShipRequired?: boolean | null;
    eta?: null | string;
    etd?: null | string;
    fulfillmentMode?: null | string;
    fulfillmentPlanConfirmedSnapshotHash: string;
    fulfillmentPlanId: string;
    fulfillmentPlanNo?: null | string;
    fulfillmentPlanVersion: number;
    generationProposalVersion?: null | number;
    generationRunId?: null | string;
    generationSourceSnapshotHash?: null | string;
    id: string;
    incoterm?: null | string;
    lineCount: number;
    lines: Line[];
    nextRequiredAction: ShipmentNextRequiredAction;
    ownerDeptId?: null | string;
    ownerUserId: string;
    readinessMaterialized: boolean;
    readinessSnapshotHash?: null | string;
    remark?: null | string;
    reservationAttemptNo?: null | number;
    reservationExpiresAt?: DateTimeValue | null;
    reservationHandoffPendingAt?: DateTimeValue | null;
    reservationHandoffPinEventId?: null | string;
    reservationHandoffPinIdempotencyKey?: null | string;
    reservationHandoffPinRequestHash?: null | string;
    reservationHandoffPinnedVersion?: null | number;
    reservationId?: JavaLongString | null;
    reservationIdempotencyKey?: null | string;
    reservationRequestHash?: null | string;
    reservationReservedAt?: DateTimeValue | null;
    reservationSourceVersion?: null | number;
    reservationStatus?: null | ReservationStatus;
    reservationVersion?: null | number;
    shipmentNo: string;
    sourceCount: number;
    status: ShipmentStatus;
    transportMode?: null | TransportMode;
    updateTime?: DateTimeValue | null;
    version: number;
    /** Immutable local acknowledgement of the typed WAREHOUSE CONSUMED relay. */
    warehouseCompletionInboxId?: JavaLongString | null;
    warehouseCompletionOutboxId?: JavaLongString | null;
    warehouseCompletionPayloadHash?: null | string;
    warehouseConsumedAt?: DateTimeValue | null;
    warehouseConsumedInventoryCount?: null | number;
    warehouseConsumedLineCount?: null | number;
    warehouseConsumedOrderCount?: null | number;
    warehouseConsumptionEventId?: null | string;
    warehouseConsumptionPlanHash?: null | string;
    warehouseConsumptionRequestHash?: null | string;
    warehouseHandedOffTime?: DateTimeValue | null;
    warehouseHandoffAvailableAt?: DateTimeValue | null;
    warehouseHandoffDeadLetterAt?: DateTimeValue | null;
    warehouseHandoffDeliveryStatus?:
      | 'DEAD_LETTER'
      | 'FAILED'
      | 'PENDING'
      | 'PROCESSING'
      | 'PUBLISHED'
      | null;
    warehouseHandoffEventId?: null | string;
    warehouseHandoffLastErrorCode?: null | string;
    warehouseHandoffLastErrorMessage?: null | string;
    warehouseHandoffOutboxVersion?: null | number;
    warehouseHandoffPlanHash?: null | string;
    warehouseHandoffRecoveryRequired?: boolean | null;
    warehouseHandoffRequestHash?: null | string;
    warehouseHandoffRetryCount?: null | number;
    warehouseOutboundOrderCount?: null | number;
    warehouseOutboundOrders: WarehouseOutboundOrder[];
  }

  export type PageItem = Omit<Detail, 'lines'>;

  /**
   * Browser-safe header-shell command. Product, quantity, warehouse and WAREHOUSE evidence are
   * deliberately absent; they may only be materialized from a server READY generation run.
   */
  export interface CreateDraftReq {
    attachmentIds?: string[];
    bookingNo?: string;
    carrierName?: string;
    contractOrderId: string;
    eta?: string;
    etd?: string;
    expectedContractOrderVersion: number;
    expectedFulfillmentPlanVersion: number;
    fulfillmentPlanId: string;
    idempotencyKey: string;
    remark?: string;
    transportMode?: TransportMode;
  }

  export interface CreateDraftResult {
    created: boolean;
    id: string;
    nextRequiredAction: ShipmentNextRequiredAction;
    readinessMaterialized: false;
    version: number;
  }

  export interface UpdateDraftReq {
    bookingNo?: string;
    carrierName?: string;
    eta?: string;
    etd?: string;
    expectedVersion: number;
    id: string;
    remark?: string;
    transportMode?: TransportMode;
  }

  export interface CancelDraftReq {
    expectedVersion: number;
    id: string;
    reason: string;
  }

  export interface ReadinessWarehouseOption {
    authorityVersion: number;
    effectiveFrom: DateTimeValue;
    effectiveTo?: DateTimeValue | null;
    evidenceRef: string;
    evidenceType: string;
    mappingId: JavaLongString;
    warehouseCode: string;
    warehouseId: JavaLongString;
    warehouseName: string;
  }

  export interface ReadinessModelOption {
    capabilities: string[];
    code: string;
    id: JavaLongString;
    name: string;
  }

  export interface ReadinessGenerationOptions {
    blockers: string[];
    companyId: JavaLongString;
    companyName?: null | string;
    etd?: null | string;
    models: ReadinessModelOption[];
    shipmentId: JavaLongString;
    shipmentNo: string;
    shipmentVersion: number;
    warehouses: ReadinessWarehouseOption[];
  }

  export interface ReadinessRule {
    evidence?: null | Record<string, unknown>;
    fieldPath?: null | string;
    message: string;
    passed: boolean;
    ruleCode: string;
    severity: 'BLOCKER' | 'INFO' | 'WARNING' | string;
  }

  export interface ReadinessWarehouseEvidence {
    allocatable: true;
    authorityPoolKey: string;
    authorityScope: 'WAREHOUSE';
    availableToPromise: DecimalValue;
    evidenceRef: string;
    evidenceType: string;
    observedAt: DateTimeValue;
    poolRequiredQuantity: DecimalValue;
    productVersionToken: string;
    promiseThroughDate: string;
    reasonCodes: string[];
    resolvedWarehouseId: JavaLongString;
    sourcePayloadHash: string;
    sourceRequestId: string;
    /** Monotonic WAREHOUSE publication identity; keep as string to avoid JS Long precision loss. */
    sourceSequence: JavaLongString;
    sourceSystem: string;
    sourceVersion: string;
    status: 'READY';
    supportedQuantity: DecimalValue;
    unitCode: string;
    validUntil: DateTimeValue;
    warehouseAuthorityEvidence: ReadinessAuthorityEvidence;
  }

  export interface ReadinessAuthorityEvidence {
    authorityHash: string;
    authorityVersion: number;
    companyId: JavaLongString;
    effectiveFrom: DateTimeValue;
    effectiveTo?: DateTimeValue | null;
    evidenceRef: string;
    evidenceType: string;
    mappingId: JavaLongString;
    tenantId: JavaLongString;
    warehouseId: JavaLongString;
  }

  export interface ReadinessLineSelection {
    actualOutboundQuantity: DecimalValue;
    alreadyPlannedQuantity: DecimalValue;
    authorityPoolKey: string;
    lineToken: string;
    maximumShipQuantity: DecimalValue;
    planQuantity: DecimalValue;
    productCode?: null | string;
    productId: JavaLongString;
    productName: string;
    productVersionToken: string;
    reason?: null | string;
    requiredDate: string;
    remainingPlanQuantity: DecimalValue;
    shipQuantity: DecimalValue;
    skuId: JavaLongString;
    sourceContractOrderItemId: JavaLongString;
    sourceFulfillmentPlanLineId: JavaLongString;
    unitCode: string;
    warehouseId: JavaLongString;
    warehouseSupportedQuantity: DecimalValue;
    warehouseEvidence: ReadinessWarehouseEvidence;
  }

  export interface ReadinessProposal {
    confirmedPlanSnapshotHash: string;
    contractSnapshotHash: string;
    effects: {
      materialized: false;
      outboundCreated: false;
      reservationCreated: false;
      stockDeducted: false;
    };
    generationContextHash: string;
    lineSelections: ReadinessLineSelection[];
    readinessAuthorityHash: string;
    sourceContractOrderId: JavaLongString;
    sourceContractOrderVersion: number;
    sourceFulfillmentPlanId: JavaLongString;
    sourceFulfillmentPlanVersion: number;
    sourceShipmentHash: string;
    sourceShipmentId: JavaLongString;
    sourceShipmentVersion: number;
    summary: string;
    targetDocumentType: string;
    targetStatus: 'DRAFT';
  }

  export interface ReadinessGenerationJob {
    completedAt?: DateTimeValue | null;
    currentAttemptNo?: null | number;
    errorCode?: null | string;
    errorMessage?: null | string;
    generationType: 'READINESS_TO_SHIPMENT';
    id: JavaLongString;
    invocationId?: null | string;
    missingData: string[];
    modelId: JavaLongString;
    modelName?: null | string;
    proposal?: null | ReadinessProposal;
    proposalHash?: null | string;
    proposalSchemaVersion?: null | string;
    proposalVersion?: null | number;
    requestedAt?: DateTimeValue | null;
    rules: ReadinessRule[];
    sourceId: JavaLongString;
    sourceSnapshotHash: string;
    sourceType: 'FDM_WAIMAO_SHIPMENT_DRAFT';
    sourceVersion: string;
    startedAt?: DateTimeValue | null;
    status: GenerationJobStatus;
    targetDocumentType: 'FDM_WAIMAO_SHIPMENT';
    version: JavaLongString;
    warnings: string[];
  }

  export interface ReadinessGenerationStartReq {
    expectedShipmentVersion: number;
    idempotencyKey: string;
    instruction?: string;
    modelId: JavaLongString;
    shipmentId: JavaLongString;
    warehouseId: JavaLongString;
  }

  export interface ReadinessGenerationTransitionReq {
    expectedVersion: JavaLongString;
    id: JavaLongString;
  }

  export interface ReadinessGenerationRegenerateReq extends ReadinessGenerationTransitionReq {
    idempotencyKey: string;
    instruction?: string;
    modelId: JavaLongString;
    warehouseId: JavaLongString;
  }

  /**
   * Identity-only command. Product, quantity, warehouse and evidence facts are deliberately
   * absent; the server reloads and revalidates them from the READY run and current authorities.
   */
  export interface ReadinessMaterializeReq {
    expectedRunVersion: JavaLongString;
    expectedShipmentVersion: number;
    expectedSourceSnapshotHash: string;
    generationRunId: JavaLongString;
    proposalVersion: number;
    shipmentId: JavaLongString;
  }

  export interface ReadinessMaterializeResult {
    confirmAvailable: false;
    materializedNow: boolean;
    nextRequiredAction: 'RESERVE_WAREHOUSE_STOCK';
    readinessMaterialized: true;
    readinessSnapshotHash: string;
    shipmentId: JavaLongString;
    shipmentVersion: number;
  }

  /**
   * Identity-only reservation command. Product, SKU, warehouse, quantity and authority evidence
   * are deliberately absent and are rebuilt by the server from the materialized shipment.
   */
  export interface ReserveStockReq {
    expectedVersion: number;
    id: JavaLongString;
    idempotencyKey: string;
  }

  /** Identity-only release command for the current ACTIVE reservation. */
  export interface ReleaseStockReservationReq extends ReserveStockReq {
    reason: string;
  }

  /** Browser-safe receipt returned by both reserve and release commands. */
  export interface ReservationResult {
    confirmAvailable: false;
    created: boolean;
    expiresAt: DateTimeValue;
    idempotencyKey: string;
    nextRequiredAction: 'RE_RESERVE_WAREHOUSE_STOCK' | 'SHIPMENT_CONFIRMATION';
    requestHash: string;
    reservationAttemptNo: number;
    reservationId: JavaLongString;
    reservationSourceVersion: number;
    reservationVersion: number;
    reservedAt: DateTimeValue;
    shipmentId: JavaLongString;
    shipmentVersion: number;
    status: 'ACTIVE' | 'EXPIRED' | 'RELEASED';
  }

  /** Identity-only confirmation command; the server rebuilds every business fact. */
  export interface ConfirmReq {
    expectedVersion: number;
    id: JavaLongString;
    idempotencyKey: string;
  }

  /** This receipt proves the FDM commit and durable handoff event, not physical outbound. */
  export interface ConfirmResult {
    confirmedSnapshotHash: string;
    created: boolean;
    nextRequiredAction:
      | 'WAREHOUSE_HANDOFF_PENDING'
      | 'WAREHOUSE_HANDOFF_RECOVERY_REQUIRED'
      | 'WAREHOUSE_OUTBOUND_PENDING';
    outboxEventId: string;
    shipmentId: JavaLongString;
    shipmentVersion: number;
    status: 'CONFIRMED';
  }

  export interface HandoffRecoveryReq {
    expectedShipmentVersion: number;
    id: JavaLongString;
    idempotencyKey: string;
    reason: string;
  }

  export interface HandoffRecoveryResult {
    availableAt: DateTimeValue;
    eventId: string;
    nextRequiredAction: 'WAREHOUSE_HANDOFF_PENDING';
    outboxId: JavaLongString;
    outboxVersion: number;
    recovered: boolean;
    shipmentId: JavaLongString;
    shipmentVersion: number;
    status: 'PENDING';
  }
}

const BASE_URL = '/fdmwaimao/shipment';

export function getShipmentPage(params: FdmWaimaoShipmentApi.PageReq) {
  return requestClient.get<PageResult<FdmWaimaoShipmentApi.PageItem>>(
    `${BASE_URL}/page`,
    { params },
  );
}

export function getShipment(id: string) {
  return requestClient.get<FdmWaimaoShipmentApi.Detail>(`${BASE_URL}/get`, {
    params: { id },
  });
}

export function createShipmentDraft(data: FdmWaimaoShipmentApi.CreateDraftReq) {
  return requestClient.post<FdmWaimaoShipmentApi.CreateDraftResult>(
    `${BASE_URL}/create-draft`,
    data,
  );
}

export function updateShipmentDraft(data: FdmWaimaoShipmentApi.UpdateDraftReq) {
  return requestClient.put<boolean>(`${BASE_URL}/update-draft`, data);
}

export function cancelShipmentDraft(data: FdmWaimaoShipmentApi.CancelDraftReq) {
  return requestClient.put<boolean>(`${BASE_URL}/cancel-draft`, data);
}

export function reserveShipmentStock(
  data: FdmWaimaoShipmentApi.ReserveStockReq,
) {
  return requestClient.post<FdmWaimaoShipmentApi.ReservationResult>(
    `${BASE_URL}/reserve`,
    data,
  );
}

export function releaseShipmentStockReservation(
  data: FdmWaimaoShipmentApi.ReleaseStockReservationReq,
) {
  return requestClient.post<FdmWaimaoShipmentApi.ReservationResult>(
    `${BASE_URL}/release-reservation`,
    data,
  );
}

export function confirmShipment(data: FdmWaimaoShipmentApi.ConfirmReq) {
  return requestClient.post<FdmWaimaoShipmentApi.ConfirmResult>(
    `${BASE_URL}/confirm`,
    data,
  );
}

export function recoverShipmentWarehouseHandoff(
  data: FdmWaimaoShipmentApi.HandoffRecoveryReq,
) {
  return requestClient.post<FdmWaimaoShipmentApi.HandoffRecoveryResult>(
    `${BASE_URL}/recover-warehouse-handoff`,
    data,
  );
}

const READINESS_GENERATION_URL = `${BASE_URL}/readiness-generation`;

export function getShipmentReadinessGenerationOptions(
  shipmentId: FdmWaimaoShipmentApi.JavaLongString,
  expectedShipmentVersion: number,
) {
  return requestClient.get<FdmWaimaoShipmentApi.ReadinessGenerationOptions>(
    `${READINESS_GENERATION_URL}/options`,
    { params: { expectedShipmentVersion, shipmentId } },
  );
}

export function startShipmentReadinessGeneration(
  data: FdmWaimaoShipmentApi.ReadinessGenerationStartReq,
) {
  return requestClient.post<FdmWaimaoShipmentApi.ReadinessGenerationJob>(
    `${READINESS_GENERATION_URL}/start`,
    data,
  );
}

export function getShipmentReadinessGenerationJob(
  id: FdmWaimaoShipmentApi.JavaLongString,
) {
  return requestClient.get<FdmWaimaoShipmentApi.ReadinessGenerationJob>(
    `${READINESS_GENERATION_URL}/job`,
    { params: { id } },
  );
}

export function retryShipmentReadinessGeneration(
  data: FdmWaimaoShipmentApi.ReadinessGenerationTransitionReq,
) {
  return requestClient.post<FdmWaimaoShipmentApi.ReadinessGenerationJob>(
    `${READINESS_GENERATION_URL}/retry`,
    data,
  );
}

export function regenerateShipmentReadinessGeneration(
  data: FdmWaimaoShipmentApi.ReadinessGenerationRegenerateReq,
) {
  return requestClient.post<FdmWaimaoShipmentApi.ReadinessGenerationJob>(
    `${READINESS_GENERATION_URL}/regenerate`,
    data,
  );
}

export function cancelShipmentReadinessGeneration(
  data: FdmWaimaoShipmentApi.ReadinessGenerationTransitionReq,
) {
  return requestClient.post<FdmWaimaoShipmentApi.ReadinessGenerationJob>(
    `${READINESS_GENERATION_URL}/cancel`,
    data,
  );
}

type RawReadinessMaterializeResult = Omit<
  FdmWaimaoShipmentApi.ReadinessMaterializeResult,
  'nextRequiredAction'
> & {
  nextRequiredAction:
    | 'RESERVATION_AND_WAREHOUSE_HANDOFF_NOT_IMPLEMENTED'
    | 'RESERVE_WAREHOUSE_STOCK';
};

/**
 * The detail endpoint already exposes RESERVE_WAREHOUSE_STOCK. Normalize the temporarily older
 * materialize response so the page has one stable next-action contract during rolling rollout.
 */
export function normalizeReadinessMaterializeResult(
  result: RawReadinessMaterializeResult,
): FdmWaimaoShipmentApi.ReadinessMaterializeResult {
  return { ...result, nextRequiredAction: 'RESERVE_WAREHOUSE_STOCK' };
}

export async function materializeShipmentReadinessGeneration(
  data: FdmWaimaoShipmentApi.ReadinessMaterializeReq,
) {
  const result = await requestClient.post<RawReadinessMaterializeResult>(
    `${READINESS_GENERATION_URL}/materialize`,
    data,
  );
  return normalizeReadinessMaterializeResult(result);
}
