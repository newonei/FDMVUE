import { requestClient } from '#/api/request';

import { normalizeId, normalizeNullableId } from '../id-normalizer';

export namespace FdmProcurementRequisitionApi {
  export type DecimalValue = number | string;
  export type RequisitionStatus =
    | 'APPROVED'
    | 'CANCELLED'
    | 'DATA_INCOMPLETE'
    | 'DRAFT'
    | 'READY'
    | 'REJECTED'
    | 'SUBMITTED';
  export type ValidationStatus = 'BLOCKED' | 'NOT_CHECKED' | 'PASSED' | string;
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

  export interface RequisitionItem {
    aiSuggestionNote?: null | string;
    customization?: null | string;
    customizationSnapshot?: null | string;
    id: string;
    lineNo: number;
    productCode?: null | string;
    productId?: null | string;
    productMappingStatus?: null | string;
    productName: string;
    productVersionToken?: null | string;
    procurementNote?: null | string;
    purchaseUnit?: null | string;
    requestedQty: DecimalValue;
    requiredDate?: null | string;
    riskCodes: string[];
    skuId?: null | string;
    sourceContractLineId?: null | string;
    sourcePlanLineId: string;
    specification?: null | string;
    unitConversionFactor?: DecimalValue | null;
    version: number;
  }

  /** A data-scope-filtered document reference returned by the backend. */
  export interface TraceabilityDocumentRef {
    accessible: boolean;
    documentNo?: null | string;
    documentType: string;
    id?: null | string;
    matchedLineCount?: null | number;
    status?: null | string;
    version?: null | number;
  }

  export interface RequisitionTraceability {
    shipmentQueryAllowed?: boolean;
    shipments?: TraceabilityDocumentRef[];
    sourceContract?: null | TraceabilityDocumentRef;
    sourceFulfillmentPlan?: null | TraceabilityDocumentRef;
  }

  export interface Requisition {
    companyId: string;
    correlationId?: null | string;
    generationProposalHash?: null | string;
    generationEditedHash?: null | string;
    generationRunId?: null | string;
    id: string;
    items: RequisitionItem[];
    ownerUserId: string;
    proposalVersion?: null | number;
    remark?: null | string;
    requestedDate?: null | string;
    requisitionNo: string;
    requiredDate?: null | string;
    sourceOrderId: string;
    sourceOrderVersion: number;
    sourcePlanId: string;
    sourcePlanVersion: number;
    sourceSnapshotHash: string;
    status: RequisitionStatus;
    traceability?: null | RequisitionTraceability;
    validationStatus: ValidationStatus;
    version: number;
  }

  export interface ValidationIssue {
    code: string;
    fieldPath?: null | string;
    itemId?: null | string;
    message: string;
    severity: 'BLOCKER' | 'INFO' | 'WARNING' | string;
  }

  export interface ValidationResult {
    checkedVersion: number;
    issues: ValidationIssue[];
    requisitionId: string;
    validationStatus: ValidationStatus;
  }

  export interface SubmitReq {
    comment?: string;
    expectedAssessmentInputHash: string;
    expectedVersion: number;
    id: string;
    idempotencyKey: string;
    selectedAssessmentId: string;
  }

  export interface WithdrawReq {
    expectedVersion: number;
    id: string;
    idempotencyKey: string;
    reason: string;
  }

  export interface LifecycleResult {
    approvalSnapshotHash?: null | string;
    id: string;
    idempotent: boolean;
    processInstanceId?: null | string;
    status: RequisitionStatus;
    submittedSnapshotHash?: null | string;
    version: number;
  }

  export interface ApprovalAudit {
    actorType?: null | string;
    actorUserId?: null | string;
    createTime?: null | number | string;
    eventId?: null | string;
    fromStatus?: null | RequisitionStatus;
    operation: string;
    reason?: null | string;
    toStatus?: null | RequisitionStatus;
    versionAfter?: null | number;
    versionBefore?: null | number;
  }

  export interface ApprovalState {
    approvalSnapshotHash?: null | string;
    audits: ApprovalAudit[];
    processDefinitionId?: null | string;
    processDefinitionKey?: null | string;
    processDefinitionVersion?: null | number;
    processInstanceId?: null | string;
    requisitionId: string;
    status: RequisitionStatus;
    currentSelectedSourcingAssessmentId?: null | string;
    currentSelectedSourcingInputHash?: null | string;
    submittedAt?: null | number | string;
    submittedBy?: null | string;
    submittedSourcingAssessmentId?: null | string;
    submittedSourcingInputHash?: null | string;
    submittedSnapshotHash?: null | string;
    submittedVersion?: null | number;
    terminalDecisionAt?: null | number | string;
    terminalDecisionType?: null | string;
    terminalDecisionUserId?: null | string;
    terminalReason?: null | string;
    version: number;
  }

  export interface CreateFromSourceReq {
    expectedPlanVersion: number;
    fulfillmentPlanId: string;
    idempotencyKey: string;
    remark?: string;
  }

  export interface CreateFromGenerationReq {
    draft: RequisitionDraftReq;
    expectedPlanVersion: number;
    expectedRunVersion: number;
    fulfillmentPlanId: string;
    generationRunId: string;
    idempotencyKey: string;
    proposalVersion: number;
  }

  export interface RequisitionDraftItemReq {
    procurementNote?: string;
    productId?: string;
    productVersionToken?: string;
    purchaseUnit: string;
    requestedQty: DecimalValue;
    requiredDate?: string;
    skuId?: string;
    sourceContractLineId?: string;
    sourcePlanLineId: string;
    unitConversionFactor: DecimalValue;
  }

  export interface RequisitionDraftReq {
    items: RequisitionDraftItemReq[];
    remark?: string;
    requiredDate?: string;
  }

  export interface UpdateDraftItemReq extends RequisitionDraftItemReq {
    id: string;
    itemExpectedVersion: number;
  }

  export interface UpdateDraftReq {
    editReason?: string;
    expectedVersion: number;
    id: string;
    items: UpdateDraftItemReq[];
    remark?: string;
    requiredDate?: string;
  }

  export interface BindProductSkuReq {
    expectedVersion: number;
    id: string;
    idempotencyKey: string;
    itemExpectedVersion: number;
    itemId: string;
    productId: string;
    productVersionToken: string;
    reason: string;
    skuId: string;
  }

  export interface RequisitionRef {
    companyId: string;
    created?: boolean;
    id: string;
    requisitionNo: string;
    sourcePlanId: string;
    sourcePlanVersion: number;
    status: RequisitionStatus;
    version: number;
  }

  export interface GenerationRule {
    evidence?: null | Record<string, unknown>;
    fieldPath?: null | string;
    message: string;
    passed: boolean;
    ruleCode: string;
    severity: 'BLOCKER' | 'INFO' | 'WARNING' | string;
  }

  export interface GenerationModel {
    capabilities: string[];
    code: string;
    enabled?: boolean;
    id: string;
    name: string;
  }

  export interface GenerationSourceLine {
    customizationSnapshot?: null | string;
    externalPurchaseQuantity: DecimalValue;
    lineNo?: null | number;
    productCode?: null | string;
    productId?: null | string;
    productMappingStatus?: null | string;
    productName: string;
    productVersionToken?: null | string;
    requiredDate?: null | string;
    skuId?: null | string;
    sourceContractLineId?: null | string;
    sourcePlanLineId: string;
    specification?: null | string;
    unit: string;
  }

  export interface GenerationSource {
    companyId?: null | string;
    companyName?: null | string;
    fulfillmentPlanId: string;
    fulfillmentPlanNo?: null | string;
    lines: GenerationSourceLine[];
    orderId?: null | string;
    orderNo?: null | string;
    orderVersion?: null | number;
    requiredDate?: null | string;
    sourceSnapshotHash: string;
    status: string;
    version: number;
  }

  export interface GenerationOptions {
    existingDraft?: ExistingDraft | null;
    generationType: string;
    missingData: string[];
    models: GenerationModel[];
    routeKey: string;
    source: GenerationSource;
    sourceSnapshotHash: string;
  }

  export interface ExistingDraft {
    id: string;
    requisitionNo: string;
    status: RequisitionStatus;
    version: number;
  }

  export interface GenerationLineProposal {
    note?: null | string;
    opaqueLineRef?: string;
    procurementNote?: null | string;
    riskCodes: string[];
    sourcePlanLineId: string;
  }

  export interface GenerationProposal {
    lineSuggestions: GenerationLineProposal[];
    summary: string;
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
    editable?: boolean;
    evidence?: Array<{
      detail?: string;
      id: string;
      label: string;
      value?: null | string;
    }>;
    fieldKey?: string;
    fieldPath?: string;
    label?: string;
    origin?: string;
    proposedValue?: unknown;
    reason?: null | string;
    sourceValue?: unknown;
    status?: null | string;
  }

  export interface GenerationJob {
    completedAt?: null | number | string;
    currentAttemptNo?: null | number;
    errorCode?: null | string;
    errorMessage?: null | string;
    fieldMetas?:
      | GenerationFieldMeta[]
      | null
      | Record<string, GenerationFieldMeta>;
    generatedAt?: null | number | string;
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
    requestedAt?: null | number | string;
    rules: GenerationRule[];
    sourceId: string;
    sourceSnapshotHash: string;
    sourceType: string;
    sourceVersion: number | string;
    startedAt?: null | number | string;
    status: GenerationJobStatus;
    version: number;
    warnings: string[];
  }

  export interface GenerationStartReq {
    expectedPlanVersion: number;
    fulfillmentPlanId: string;
    idempotencyKey: string;
    instruction?: string;
    modelId: string;
  }

  export interface GenerationTransitionReq {
    expectedVersion: number;
    id: string;
  }

  export interface GenerationRegenerateReq extends GenerationTransitionReq {
    idempotencyKey: string;
    instruction?: string;
    modelId: string;
  }
}

const BASE_URL = '/fdmprocurement/requisition';

function normalizeRequisitionItem(
  value: FdmProcurementRequisitionApi.RequisitionItem,
): FdmProcurementRequisitionApi.RequisitionItem {
  return {
    ...value,
    id: normalizeId(value.id, 'requisitionItem.id'),
    productId: normalizeNullableId(
      value.productId,
      'requisitionItem.productId',
    ),
    riskCodes: [...(value.riskCodes || [])],
    skuId: normalizeNullableId(value.skuId, 'requisitionItem.skuId'),
    sourceContractLineId: normalizeNullableId(
      value.sourceContractLineId,
      'requisitionItem.sourceContractLineId',
    ),
    sourcePlanLineId: normalizeId(
      value.sourcePlanLineId,
      'requisitionItem.sourcePlanLineId',
    ),
  };
}

function normalizeGenerationSourceLine(
  value: FdmProcurementRequisitionApi.GenerationSourceLine,
): FdmProcurementRequisitionApi.GenerationSourceLine {
  return {
    ...value,
    productId: normalizeNullableId(
      value.productId,
      'generationSourceLine.productId',
    ),
    skuId: normalizeNullableId(value.skuId, 'generationSourceLine.skuId'),
    sourceContractLineId: normalizeNullableId(
      value.sourceContractLineId,
      'generationSourceLine.sourceContractLineId',
    ),
    sourcePlanLineId: normalizeId(
      value.sourcePlanLineId,
      'generationSourceLine.sourcePlanLineId',
    ),
  };
}

function normalizeTraceabilityDocumentRef(
  value: FdmProcurementRequisitionApi.TraceabilityDocumentRef,
  field: string,
): FdmProcurementRequisitionApi.TraceabilityDocumentRef {
  return {
    ...value,
    id: normalizeNullableId(value.id, `${field}.id`),
  };
}

function normalizeGenerationOptions(
  value: FdmProcurementRequisitionApi.GenerationOptions,
): FdmProcurementRequisitionApi.GenerationOptions {
  return {
    ...value,
    existingDraft: value.existingDraft
      ? {
          ...value.existingDraft,
          id: normalizeId(value.existingDraft.id, 'existingDraft.id'),
        }
      : value.existingDraft,
    models: (value.models || []).map((model) => ({
      ...model,
      id: normalizeId(model.id, 'generationModel.id'),
    })),
    source: {
      ...value.source,
      companyId: normalizeNullableId(
        value.source.companyId,
        'generationSource.companyId',
      ),
      fulfillmentPlanId: normalizeId(
        value.source.fulfillmentPlanId,
        'generationSource.fulfillmentPlanId',
      ),
      lines: (value.source.lines || []).map((line) =>
        normalizeGenerationSourceLine(line),
      ),
      orderId: normalizeNullableId(
        value.source.orderId,
        'generationSource.orderId',
      ),
    },
  };
}

function normalizeGenerationJob(
  value: FdmProcurementRequisitionApi.GenerationJob,
): FdmProcurementRequisitionApi.GenerationJob {
  return {
    ...value,
    id: normalizeId(value.id, 'generationJob.id'),
    invocationId: normalizeNullableId(
      value.invocationId,
      'generationJob.invocationId',
    ),
    modelId: normalizeId(value.modelId, 'generationJob.modelId'),
    proposal: value.proposal
      ? {
          ...value.proposal,
          lineSuggestions: (value.proposal.lineSuggestions || []).map(
            (line) => ({
              ...line,
              riskCodes: [...(line.riskCodes || [])],
              sourcePlanLineId: normalizeId(
                line.sourcePlanLineId,
                'generationProposal.sourcePlanLineId',
              ),
            }),
          ),
        }
      : value.proposal,
    sourceId: normalizeId(value.sourceId, 'generationJob.sourceId'),
  };
}

export function normalizeProcurementRequisition(
  value: FdmProcurementRequisitionApi.Requisition,
): FdmProcurementRequisitionApi.Requisition {
  return {
    ...value,
    companyId: normalizeId(value.companyId, 'requisition.companyId'),
    generationRunId: normalizeNullableId(
      value.generationRunId,
      'requisition.generationRunId',
    ),
    id: normalizeId(value.id, 'requisition.id'),
    items: value.items.map(normalizeRequisitionItem),
    ownerUserId: normalizeId(value.ownerUserId, 'requisition.ownerUserId'),
    sourceOrderId: normalizeId(
      value.sourceOrderId,
      'requisition.sourceOrderId',
    ),
    sourcePlanId: normalizeId(value.sourcePlanId, 'requisition.sourcePlanId'),
    traceability: value.traceability
      ? {
          ...value.traceability,
          shipments: (value.traceability.shipments || []).map((shipment) =>
            normalizeTraceabilityDocumentRef(
              shipment,
              'requisition.traceability.shipments',
            ),
          ),
          sourceContract: value.traceability.sourceContract
            ? normalizeTraceabilityDocumentRef(
                value.traceability.sourceContract,
                'requisition.traceability.sourceContract',
              )
            : value.traceability.sourceContract,
          sourceFulfillmentPlan: value.traceability.sourceFulfillmentPlan
            ? normalizeTraceabilityDocumentRef(
                value.traceability.sourceFulfillmentPlan,
                'requisition.traceability.sourceFulfillmentPlan',
              )
            : value.traceability.sourceFulfillmentPlan,
        }
      : value.traceability,
  };
}

function normalizeValidationResult(
  value: FdmProcurementRequisitionApi.ValidationResult,
): FdmProcurementRequisitionApi.ValidationResult {
  return {
    ...value,
    issues: value.issues.map((issue) => ({
      ...issue,
      itemId: normalizeNullableId(issue.itemId, 'validationIssue.itemId'),
    })),
    requisitionId: normalizeId(value.requisitionId, 'validation.requisitionId'),
  };
}

function normalizeLifecycleResult(
  value: FdmProcurementRequisitionApi.LifecycleResult,
): FdmProcurementRequisitionApi.LifecycleResult {
  return { ...value, id: normalizeId(value.id, 'lifecycle.id') };
}

export function normalizeApprovalState(
  value: FdmProcurementRequisitionApi.ApprovalState,
): FdmProcurementRequisitionApi.ApprovalState {
  return {
    ...value,
    audits: value.audits.map((audit) => ({
      ...audit,
      actorUserId: normalizeNullableId(
        audit.actorUserId,
        'approvalAudit.actorUserId',
      ),
    })),
    currentSelectedSourcingAssessmentId: normalizeNullableId(
      value.currentSelectedSourcingAssessmentId,
      'approvalState.currentSelectedSourcingAssessmentId',
    ),
    requisitionId: normalizeId(
      value.requisitionId,
      'approvalState.requisitionId',
    ),
    submittedBy: normalizeNullableId(
      value.submittedBy,
      'approvalState.submittedBy',
    ),
    submittedSourcingAssessmentId: normalizeNullableId(
      value.submittedSourcingAssessmentId,
      'approvalState.submittedSourcingAssessmentId',
    ),
    terminalDecisionUserId: normalizeNullableId(
      value.terminalDecisionUserId,
      'approvalState.terminalDecisionUserId',
    ),
  };
}

function normalizeRequisitionRef(
  value: FdmProcurementRequisitionApi.RequisitionRef,
): FdmProcurementRequisitionApi.RequisitionRef {
  return {
    ...value,
    companyId: normalizeId(value.companyId, 'requisitionRef.companyId'),
    id: normalizeId(value.id, 'requisitionRef.id'),
    sourcePlanId: normalizeId(
      value.sourcePlanId,
      'requisitionRef.sourcePlanId',
    ),
  };
}

export async function createRequisitionFromSource(
  data: FdmProcurementRequisitionApi.CreateFromSourceReq,
) {
  const result =
    await requestClient.post<FdmProcurementRequisitionApi.RequisitionRef>(
      `${BASE_URL}/create-from-source`,
      data,
    );
  return normalizeRequisitionRef(result);
}

export async function createRequisitionFromGeneration(
  data: FdmProcurementRequisitionApi.CreateFromGenerationReq,
) {
  const result =
    await requestClient.post<FdmProcurementRequisitionApi.RequisitionRef>(
      `${BASE_URL}/create-from-generation`,
      data,
    );
  return normalizeRequisitionRef(result);
}

export async function updateProcurementRequisitionDraft(
  data: FdmProcurementRequisitionApi.UpdateDraftReq,
) {
  const result =
    await requestClient.put<FdmProcurementRequisitionApi.Requisition>(
      `${BASE_URL}/update`,
      data,
    );
  return normalizeProcurementRequisition(result);
}

export async function bindProcurementRequisitionProductSku(
  data: FdmProcurementRequisitionApi.BindProductSkuReq,
) {
  const result =
    await requestClient.post<FdmProcurementRequisitionApi.Requisition>(
      `${BASE_URL}/bind-product-sku`,
      data,
    );
  return normalizeProcurementRequisition(result);
}

export async function getRequisitionGenerationOptions(
  fulfillmentPlanId: string,
  expectedPlanVersion: number,
) {
  const result =
    await requestClient.get<FdmProcurementRequisitionApi.GenerationOptions>(
      `${BASE_URL}/generation-options`,
      { params: { expectedPlanVersion, fulfillmentPlanId } },
    );
  return normalizeGenerationOptions(result);
}

export async function startRequisitionGeneration(
  data: FdmProcurementRequisitionApi.GenerationStartReq,
) {
  const result =
    await requestClient.post<FdmProcurementRequisitionApi.GenerationJob>(
      `${BASE_URL}/generation/start`,
      data,
    );
  return normalizeGenerationJob(result);
}

export async function getRequisitionGenerationJob(id: string) {
  const result =
    await requestClient.get<FdmProcurementRequisitionApi.GenerationJob>(
      `${BASE_URL}/generation/job`,
      { params: { id } },
    );
  return normalizeGenerationJob(result);
}

export async function retryRequisitionGeneration(
  data: FdmProcurementRequisitionApi.GenerationTransitionReq,
) {
  const result =
    await requestClient.post<FdmProcurementRequisitionApi.GenerationJob>(
      `${BASE_URL}/generation/retry`,
      data,
    );
  return normalizeGenerationJob(result);
}

export async function regenerateRequisitionGeneration(
  data: FdmProcurementRequisitionApi.GenerationRegenerateReq,
) {
  const result =
    await requestClient.post<FdmProcurementRequisitionApi.GenerationJob>(
      `${BASE_URL}/generation/regenerate`,
      data,
    );
  return normalizeGenerationJob(result);
}

export async function cancelRequisitionGeneration(
  data: FdmProcurementRequisitionApi.GenerationTransitionReq,
) {
  const result =
    await requestClient.post<FdmProcurementRequisitionApi.GenerationJob>(
      `${BASE_URL}/generation/cancel`,
      data,
    );
  return normalizeGenerationJob(result);
}

export async function getProcurementRequisition(id: string) {
  const result =
    await requestClient.get<FdmProcurementRequisitionApi.Requisition>(
      `${BASE_URL}/get`,
      { params: { id } },
    );
  return normalizeProcurementRequisition(result);
}

export async function getProcurementRequisitionList(companyId: string) {
  const result = await requestClient.get<
    FdmProcurementRequisitionApi.Requisition[]
  >(`${BASE_URL}/list`, { params: { companyId } });
  return result.map((requisition) =>
    normalizeProcurementRequisition(requisition),
  );
}

export async function preValidateProcurementRequisition(data: {
  expectedVersion: number;
  id: string;
}) {
  const result =
    await requestClient.post<FdmProcurementRequisitionApi.ValidationResult>(
      `${BASE_URL}/pre-validate`,
      data,
    );
  return normalizeValidationResult(result);
}

export async function submitProcurementRequisition(
  data: FdmProcurementRequisitionApi.SubmitReq,
) {
  const result =
    await requestClient.post<FdmProcurementRequisitionApi.LifecycleResult>(
      `${BASE_URL}/submit`,
      data,
    );
  return normalizeLifecycleResult(result);
}

export async function withdrawProcurementRequisition(
  data: FdmProcurementRequisitionApi.WithdrawReq,
) {
  const result =
    await requestClient.post<FdmProcurementRequisitionApi.LifecycleResult>(
      `${BASE_URL}/withdraw`,
      data,
    );
  return normalizeLifecycleResult(result);
}

export async function getProcurementRequisitionApprovalState(id: string) {
  const result =
    await requestClient.get<FdmProcurementRequisitionApi.ApprovalState>(
      `${BASE_URL}/approval-state`,
      { params: { id } },
    );
  return normalizeApprovalState(result);
}
