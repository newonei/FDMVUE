import type { PageParam, PageResult } from '@vben/request';

import { requestClient } from '#/api/request';

export namespace FdmWaimaoDemandPlanApi {
  export type DateTimeValue = number | string;
  export type DecimalValue = string;
  export type DemandPlanStatus =
    | 'AI_DRAFT'
    | 'CONFIRMED'
    | 'DRAFT'
    | 'NEEDS_REPLAN'
    | 'VOIDED';
  export type AllocationType =
    | 'EXTERNAL_PURCHASE'
    | 'INTERNAL_FACTORY'
    | 'STOCK';
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

  export interface Rule {
    evidence?: null | Record<string, unknown>;
    fieldPath?: null | string;
    message: string;
    passed: boolean;
    ruleCode: string;
    severity: 'BLOCKER' | 'INFO' | 'WARNING' | string;
  }

  export interface SourceOrderItem {
    code?: null | string;
    entrySource?: null | string;
    id: string;
    lineNo?: null | number;
    mappingStatus?: null | string;
    name: string;
    productId?: null | string;
    quantity: DecimalValue;
    skuId?: null | string;
    unit?: null | string;
  }

  export interface SourceOrder {
    companyName?: null | string;
    currency?: null | string;
    customerName?: null | string;
    id: string;
    items: SourceOrderItem[];
    orderNo: string;
    ownerUserName?: null | string;
    requiredDeliveryDate?: null | string;
    status: string;
    subject: string;
    version: number;
  }

  export interface GenerationModel {
    capabilities: string[];
    code: string;
    enabled?: boolean;
    id: string;
    name: string;
  }

  export interface OrderSummary {
    generationBlockerCode?: null | string;
    generationBlockerMessage?: null | string;
    generationEligible: boolean;
    latestPlanId?: null | string;
    latestPlanNo?: null | string;
    latestPlanStatus?: DemandPlanStatus | null;
    latestPlanVersion?: null | number;
    latestRevisionNo?: null | number;
    orderId: string;
    orderNo?: null | string;
    orderStatus?: null | string;
    orderVersion?: null | number;
  }

  export interface GenerationOptions {
    missingData: string[];
    models: GenerationModel[];
    source: OrderSummary;
    sourceOrder: SourceOrder;
    sourceSnapshotHash: string;
  }

  export interface GenerationAllocationProposal {
    evidenceNote?: null | string;
    quantity?: DecimalValue | null;
    recommendationReason?: null | string;
    type: AllocationType;
  }

  export interface GenerationLineProposal {
    allocations: GenerationAllocationProposal[];
    decisionNote?: null | string;
    requiredDate?: null | string;
    sourceContractOrderItemId: string;
  }

  export interface GenerationProposal {
    lines: GenerationLineProposal[];
    remark?: null | string;
  }

  export interface GenerationFieldMeta {
    alternatives?: Array<{
      confidence?: string;
      id: string;
      impact?: string;
      label: string;
      reason?: string;
      value: unknown;
    }>;
    confidence?: string;
    evidence?: Array<{
      detail?: string;
      id: string;
      label: string;
      value?: null | string;
    }>;
    fieldKey?: string;
    fieldPath?: string;
    editable?: boolean;
    label?: string;
    origin?: string;
    proposedValue?: unknown;
    reason?: null | string;
    sourceValue?: unknown;
    status?: null | string;
  }

  export interface GenerationJob {
    completedAt?: DateTimeValue | null;
    currentAttemptNo?: null | number;
    errorCode?: null | string;
    errorMessage?: null | string;
    fieldMetas?:
      | GenerationFieldMeta[]
      | null
      | Record<string, GenerationFieldMeta>;
    generatedAt?: DateTimeValue | null;
    generationType: string;
    id: string;
    invocationId?: null | string;
    missingData: string[];
    modelId: string;
    modelName?: null | string;
    proposal?: GenerationProposal | null;
    proposalHash?: null | string;
    proposalSchemaVersion?: null | string;
    proposalVersion?: null | number;
    requestedAt?: DateTimeValue | null;
    rules: Rule[];
    sourceId: string;
    sourceSnapshotHash: string;
    sourceType: string;
    sourceVersion: string;
    startedAt?: DateTimeValue | null;
    status: GenerationJobStatus;
    version: string;
    warnings: string[];
  }

  export interface GenerationStartReq {
    expectedOrderVersion: number;
    idempotencyKey: string;
    instruction?: string;
    modelId: string;
    orderId: string;
  }

  export interface GenerationTransitionReq {
    expectedVersion: string;
    id: string;
  }

  export interface GenerationRegenerateReq extends GenerationTransitionReq {
    idempotencyKey: string;
    instruction?: string;
    modelId: string;
  }

  export interface AllocationDraftReq {
    changeReason?: string;
    evidenceNote?: string;
    evidenceSourceRefId?: string;
    evidenceSourceSystem?: string;
    evidenceSourceVersion?: string;
    evidenceValidUntil?: string;
    id?: string;
    quantity?: DecimalValue | null;
    recommendationReason?: string;
    type: AllocationType;
  }

  export interface LineDraftReq {
    allocations: AllocationDraftReq[];
    decisionNote?: string;
    id?: string;
    requiredDate?: string;
    sourceContractOrderItemId: string;
  }

  export interface MaterializeReq {
    attachmentIds?: string[];
    expectedRunVersion: string;
    expectedSourceSnapshotHash: string;
    expectedSourceVersion: number;
    generationRunId: string;
    lines: LineDraftReq[];
    proposalVersion: number;
    remark?: string;
  }

  export interface UpdateReq {
    expectedSourceSnapshotHash?: string;
    expectedRunVersion?: string;
    expectedVersion: number;
    generationRunId?: string;
    id: string;
    lines: LineDraftReq[];
    proposalVersion?: number;
    remark?: string;
  }

  export interface ConfirmReq {
    expectedVersion: number;
    id: string;
  }

  export interface DirectCreateReq {
    attachmentIds?: string[];
    creationMode: 'MANUAL' | 'RULE';
    expectedOrderVersion: number;
    idempotencyKey: string;
    orderId: string;
    remark?: string;
  }

  export interface ValidationResult {
    rules: Rule[];
    valid: boolean;
  }

  export interface ValidateCreateReq {
    create: MaterializeReq;
    mode: 'CREATE';
  }

  export interface ValidateUpdateReq {
    mode: 'UPDATE';
    update: UpdateReq;
  }

  export type ValidateReq = ValidateCreateReq | ValidateUpdateReq;

  export interface CreateResult {
    created: boolean;
    id: string;
    version: number;
  }

  export interface Allocation {
    confidence?: null | string;
    evidenceByUserId?: null | string;
    evidenceByUserName?: null | string;
    evidenceNote?: null | string;
    evidenceQuantityUpperBound?: DecimalValue | null;
    evidenceStatus?: null | string;
    evidenceTime?: DateTimeValue | null;
    evidenceValidUntil?: DateTimeValue | null;
    fieldOrigin?: null | string;
    id: string;
    quantity?: DecimalValue | null;
    recommendationReason?: null | string;
    sequenceNo?: null | number;
    sourceName?: null | string;
    sourceRefId?: null | string;
    sourceSystem?: null | string;
    sourceVersion?: null | string;
    type: AllocationType;
  }

  export interface Line {
    allocatedQuantity?: DecimalValue | null;
    allocations: Allocation[];
    category?: null | string;
    complete?: boolean | null;
    contractEntrySource?: null | string;
    contractQuantity: DecimalValue;
    customizationText?: null | string;
    decisionNote?: null | string;
    gift?: boolean | null;
    id: string;
    imageUrl?: null | string;
    lineNo?: null | number;
    mappingStatus?: null | string;
    productCode?: null | string;
    productId?: null | string;
    productName: string;
    productVersionToken?: null | string;
    remainingQuantity?: DecimalValue | null;
    requiredDate?: null | string;
    skuId?: null | string;
    sourceContractOrderItemId: string;
    unit?: null | string;
  }

  export interface Event {
    actorUserId?: null | string;
    actorUserName?: null | string;
    detailSummary?: null | string;
    eventType: string;
    fromStatus?: null | string;
    generationRunId?: null | string;
    id: string;
    occurredTime?: DateTimeValue | null;
    planVersion?: null | number;
    toStatus?: null | string;
  }

  export interface PageReq extends PageParam {
    companyId?: string;
    customerId?: string;
    keyword?: string;
    ownerUserId?: string;
    requiredDate?: [string, string];
    status?: DemandPlanStatus;
  }

  export interface Detail {
    companyId?: null | string;
    companyName?: null | string;
    confirmedByUserId?: null | string;
    confirmedByUserName?: null | string;
    confirmedTime?: DateTimeValue | null;
    contractOrderId: string;
    contractOrderNo: string;
    contractOrderVersion: number;
    contractSubject: string;
    creationMode?: 'AI' | 'MANUAL' | 'RULE' | null | string;
    createTime?: DateTimeValue | null;
    customerId?: null | string;
    customerName?: null | string;
    customerRequiredDeliveryDate?: null | string;
    downstreamReady: boolean;
    events: Event[];
    generationModelCode?: null | string;
    generationModelId?: null | string;
    generationModelName?: null | string;
    generationProposalVersion?: null | number;
    generationRunId?: null | string;
    id: string;
    lineCount: number;
    lines: Line[];
    orderType?: null | string;
    ownerDeptId?: null | string;
    ownerDeptName?: null | string;
    ownerUserId?: null | string;
    ownerUserName?: null | string;
    planNo: string;
    previousPlanId?: null | string;
    remark?: null | string;
    revisionNo: number;
    sourceSnapshotHash?: null | string;
    status: DemandPlanStatus;
    unknownAllocationCount: number;
    unbalancedLineCount: number;
    unmappedLineCount: number;
    updateTime?: DateTimeValue | null;
    version: number;
  }

  export type PageItem = Omit<Detail, 'events' | 'lines'>;
}

const BASE_URL = '/fdmwaimao/demand-plan';

export function getDemandPlanPage(params: FdmWaimaoDemandPlanApi.PageReq) {
  return requestClient.get<PageResult<FdmWaimaoDemandPlanApi.PageItem>>(
    `${BASE_URL}/page`,
    { params },
  );
}

export function getDemandPlan(id: string) {
  return requestClient.get<FdmWaimaoDemandPlanApi.Detail>(`${BASE_URL}/get`, {
    params: { id },
  });
}

export function getDemandPlanSummaryByOrder(orderId: string) {
  return requestClient.get<FdmWaimaoDemandPlanApi.OrderSummary>(
    `${BASE_URL}/summary-by-order`,
    { params: { orderId } },
  );
}

export function getDemandPlanGenerationOptions(orderId: string) {
  return requestClient.get<FdmWaimaoDemandPlanApi.GenerationOptions>(
    `${BASE_URL}/generation-options`,
    { params: { orderId } },
  );
}

export function startDemandPlanGeneration(
  data: FdmWaimaoDemandPlanApi.GenerationStartReq,
) {
  return requestClient.post<FdmWaimaoDemandPlanApi.GenerationJob>(
    `${BASE_URL}/generation/start`,
    data,
  );
}

export function getDemandPlanGenerationJob(id: string) {
  return requestClient.get<FdmWaimaoDemandPlanApi.GenerationJob>(
    `${BASE_URL}/generation/job`,
    { params: { id } },
  );
}

export function retryDemandPlanGeneration(
  data: FdmWaimaoDemandPlanApi.GenerationTransitionReq,
) {
  return requestClient.post<FdmWaimaoDemandPlanApi.GenerationJob>(
    `${BASE_URL}/generation/retry`,
    data,
  );
}

export function regenerateDemandPlanGeneration(
  data: FdmWaimaoDemandPlanApi.GenerationRegenerateReq,
) {
  return requestClient.post<FdmWaimaoDemandPlanApi.GenerationJob>(
    `${BASE_URL}/generation/regenerate`,
    data,
  );
}

export function cancelDemandPlanGeneration(
  data: FdmWaimaoDemandPlanApi.GenerationTransitionReq,
) {
  return requestClient.post<FdmWaimaoDemandPlanApi.GenerationJob>(
    `${BASE_URL}/generation/cancel`,
    data,
  );
}

function validateDemandPlan(data: FdmWaimaoDemandPlanApi.ValidateReq) {
  return requestClient.post<FdmWaimaoDemandPlanApi.ValidationResult>(
    `${BASE_URL}/validate`,
    data,
  );
}

export function validateDemandPlanCreate(
  create: FdmWaimaoDemandPlanApi.MaterializeReq,
) {
  return validateDemandPlan({ create, mode: 'CREATE' });
}

export function validateDemandPlanUpdate(
  update: FdmWaimaoDemandPlanApi.UpdateReq,
) {
  return validateDemandPlan({ mode: 'UPDATE', update });
}

export function createDemandPlan(data: FdmWaimaoDemandPlanApi.MaterializeReq) {
  return requestClient.post<FdmWaimaoDemandPlanApi.CreateResult>(
    `${BASE_URL}/create`,
    data,
  );
}

export function createDemandPlanDirect(
  data: FdmWaimaoDemandPlanApi.DirectCreateReq,
) {
  return requestClient.post<FdmWaimaoDemandPlanApi.CreateResult>(
    `${BASE_URL}/create-direct`,
    data,
  );
}

export function updateDemandPlan(data: FdmWaimaoDemandPlanApi.UpdateReq) {
  return requestClient.put<boolean>(`${BASE_URL}/update`, data);
}

export function confirmDemandPlan(data: FdmWaimaoDemandPlanApi.ConfirmReq) {
  return requestClient.put<boolean>(`${BASE_URL}/confirm`, data);
}
