import type { PageParam, PageResult } from '@vben/request';

import { searchFdmAiModels } from '#/api/fdmai';
import { requestClient } from '#/api/request';

export namespace FdmFactorySupplyTaskApi {
  export type Confidence = 'HIGH' | 'LOW' | 'MEDIUM';
  export type DecimalValue = number | string;
  export type GenerationStatus =
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
  export type TaskStatus =
    | 'CANCELLED'
    | 'CONFIRMED'
    | 'DRAFT'
    | 'FAILED'
    | 'HANDED_OFF';

  export interface ModelOption {
    capabilities: string[];
    code: string;
    enabled: boolean;
    id: string;
    name: string;
  }

  export interface PageReq extends PageParam {
    companyId?: string;
    keyword?: string;
    status?: TaskStatus;
  }

  export interface BatchSummary {
    batchNo: string;
    companyId: string;
    companyName?: null | string;
    contractOrderId: string;
    contractOrderNo?: null | string;
    createTime?: null | string;
    createdByUserId: string;
    earliestRequiredDate?: null | string;
    id: string;
    latestRequiredDate?: null | string;
    lineCount: number;
    quantitySummary: Array<{
      quantity: DecimalValue;
      unit: string;
    }>;
    sourcePlanId: string;
    sourcePlanNo?: null | string;
    sourcePlanVersion: number;
    status: TaskStatus;
    taskCount: number;
    version: number;
  }

  export interface FulfillmentConstraints {
    certificationRequirements: string[];
    countryComplianceRequirements: string[];
    customerComplianceRequirements: string[];
    deliveryLocation?: null | string;
    directShipRequired?: boolean | null;
    fulfillmentMode?: null | string;
    incoterm?: null | string;
    packagingRequirements: string[];
  }

  export interface FactoryCapabilityAuthoritySnapshot {
    authorityHash: string;
    capabilityId: string;
    directShipSupported: boolean;
    evidenceByUserId?: null | string;
    evidenceMode: string;
    evidenceNote?: null | string;
    evidenceSourceName?: null | string;
    evidenceSourceRefId?: null | string;
    evidenceSourceSystem?: null | string;
    evidenceSourceVersion?: null | string;
    evidenceTime: string;
    evidenceValidUntil: string;
    skuId: string;
    productVersionToken: string;
    status: string;
    supportedCertificationRequirements: string[];
    supportedCountryComplianceRequirements: string[];
    supportedCustomerComplianceRequirements: string[];
    supportedPackagingRequirements: string[];
    validFrom: string;
    validUntil?: null | string;
    version: number;
  }

  export interface FactoryCapabilityMissingEvidence {
    capabilityId?: never;
    reason: string;
    status: string;
  }

  export type FactoryCapabilityEvidence =
    | FactoryCapabilityAuthoritySnapshot
    | FactoryCapabilityMissingEvidence;

  export interface FactoryCapabilityCoverageSnapshot {
    certificationRequired: string[];
    certificationSupported: string[];
    countryComplianceRequired: string[];
    countryComplianceSupported: string[];
    customerComplianceRequired: string[];
    customerComplianceSupported: string[];
    directShipRequired: boolean;
    directShipSupported: boolean;
    packagingRequired: string[];
    packagingSupported: string[];
    passed: boolean;
  }

  export interface FactoryCapabilitySnapshot {
    authority: FactoryCapabilityAuthoritySnapshot;
    coverage: FactoryCapabilityCoverageSnapshot;
    decisionCode: string;
  }

  export interface SupplyTaskLine {
    allocationEvidenceByUserId?: null | string;
    allocationEvidenceNote?: null | string;
    allocationEvidenceQuantityUpperBound?: DecimalValue | null;
    allocationEvidenceSourceName?: null | string;
    allocationEvidenceSourceRefId?: null | string;
    allocationEvidenceSourceSystem?: null | string;
    allocationEvidenceSourceVersion?: null | string;
    allocationEvidenceStatus?: null | string;
    allocationEvidenceTime?: null | string;
    allocationEvidenceValidUntil?: null | string;
    atpAvailableQuantity?: DecimalValue | null;
    atpDataTime?: null | string;
    atpEligibleInboundQuantity?: DecimalValue | null;
    atpPromiseThroughDate?: null | string;
    atpProductVersionToken?: null | string;
    atpReservedQuantity?: DecimalValue | null;
    atpSourceSystem?: null | string;
    atpSourcePayloadHash?: null | string;
    atpSourceSequence?: null | string;
    atpSourceVersion?: null | string;
    atpStatus?: null | string;
    atpUnitCode?: null | string;
    atpValidUntil?: null | string;
    capacityQuantity?: DecimalValue | null;
    capacityUnit?: null | string;
    confidence: Confidence;
    customization?: null | string;
    factoryCapabilityAuthorityHash?: null | string;
    factoryCapabilityDecisionCode?: null | string;
    factoryCapabilityId?: null | string;
    factoryCapabilitySnapshot?: FactoryCapabilitySnapshot | null;
    factoryCapabilityStatus?: null | string;
    factoryCapabilityVersion?: null | number;
    id: string;
    lineNo: number;
    productCode?: null | string;
    productId: string;
    productName?: null | string;
    productVersionToken?: null | string;
    quantity: DecimalValue;
    requiredDate: string;
    riskCodes: string[];
    selectionReason?: null | string;
    skuId: string;
    sourceAllocationId: string;
    sourceOrderLineId: string;
    sourcePlanLineId: string;
    unit?: null | string;
    unitConversionEffectiveFrom?: null | string;
    unitConversionEffectiveUntil?: null | string;
    unitConversionFactor?: DecimalValue | null;
    unitConversionVersion?: null | string;
  }

  export interface SupplyTask {
    factoryCode?: null | string;
    factoryId: string;
    factoryName?: null | string;
    factoryTimezone?: null | string;
    factoryVersion: number;
    id: string;
    lines: SupplyTaskLine[];
    requiredDate: string;
    status: TaskStatus;
    taskNo: string;
    version: number;
  }

  export interface BatchDetail {
    batchNo: string;
    companyId: string;
    companyName?: null | string;
    contractOrderId: string;
    contractOrderNo?: null | string;
    contractOrderVersion: number;
    createTime?: null | string;
    createdByUserId: string;
    customerId?: null | string;
    editedProposalHash?: null | string;
    fulfillmentConstraints: FulfillmentConstraints;
    generationModelId: string;
    generationProposalHash?: null | string;
    generationProposalId: string;
    generationProposalVersion: number;
    generationRunId: string;
    id: string;
    proposalSummary?: null | string;
    sourceAuthorityHash?: null | string;
    sourceConfirmedHash?: null | string;
    sourcePlanId: string;
    sourcePlanNo?: null | string;
    sourcePlanVersion: number;
    status: TaskStatus;
    tasks: SupplyTask[];
    version: number;
  }

  export interface GenerationSourceRef {
    id: string;
    type: 'FULFILLMENT_PLAN' | string;
    version: string;
  }

  export interface GenerationTargetRef {
    id: string;
    type: string;
    version: string;
  }

  export interface GenerationRule {
    evidence: Record<string, unknown>;
    fieldPath?: null | string;
    message: string;
    passed: boolean;
    ruleCode: string;
    ruleVersion?: null | string;
    severity: 'BLOCKER' | 'INFO' | 'WARNING' | string;
  }

  export interface FactoryCandidateEvidence {
    atpAvailableQuantity?: DecimalValue | null;
    atpDataTime?: null | string;
    atpEligibleInboundQuantity?: DecimalValue | null;
    atpPromiseThroughDate?: null | string;
    atpProductVersionToken?: null | string;
    atpReservedQuantity?: DecimalValue | null;
    atpSourceSystem?: null | string;
    atpSourcePayloadHash?: null | string;
    atpSourceSequence?: null | string;
    atpSourceVersion?: null | string;
    atpStatus?: null | string;
    atpUnit?: null | string;
    atpValidUntil?: null | string;
    atpDecisionCode?: null | string;
    decisionCode?: null | string;
    factoryCode?: null | string;
    factoryCapabilityAuthorityHash?: null | string;
    factoryCapabilityDecisionCode?: null | string;
    factoryCapabilityEvidence?: FactoryCapabilityEvidence | null;
    factoryCapabilityStatus?: null | string;
    factoryCapabilityVersion?: null | number;
    factoryId: string;
    factoryName?: null | string;
    factoryTimezone?: null | string;
    factoryToken: string;
    factoryVersion: number;
    selectable: boolean;
  }

  export interface CandidateLineEvidence {
    capacityQuantity?: DecimalValue | null;
    capacityUnit?: null | string;
    candidates: FactoryCandidateEvidence[];
    lineToken: string;
    productCode?: null | string;
    productId: string;
    productName?: null | string;
    productVersionToken: string;
    quantity: DecimalValue;
    requiredDate: string;
    skuId: string;
    sourcePlanLineId: string;
    unit?: null | string;
    unitConversionVersion?: null | string;
  }

  export interface GenerationEvidence {
    authorityHash?: string;
    candidateLines?: CandidateLineEvidence[];
    factoryAuthority?: string;
    quantityAuthority?: string;
    selections?: unknown[];
    [key: string]: unknown;
  }

  export interface ProposalSelection {
    confidence: Confidence;
    factoryToken: string;
    lineToken: string;
    reason: string;
    riskCodes: string[];
  }

  export interface NormalizedProposal {
    authorityHash: string;
    confirmedPlanSnapshotHash: string;
    lineSelections: ProposalSelection[];
    sourcePlanId: string;
    sourcePlanVersion: number;
    summary: string;
  }

  export interface GenerationProposal {
    evidence: GenerationEvidence;
    hash: string;
    id: string;
    missingData: string[];
    normalizedJson: string;
    schemaVersion: string;
    source: string;
    version: number;
    warnings: string[];
  }

  export interface GenerationDetail {
    attempts: unknown[];
    companyId: string;
    completedAt?: null | string;
    currentAttemptNo: number;
    errorCode?: null | string;
    errorMessage?: null | string;
    generationType: 'DEMAND_TO_SUPPLY_TASK' | string;
    modelId: string;
    proposal?: GenerationProposal | null;
    requestedAt?: null | string;
    requestedBy: string;
    rules: GenerationRule[];
    runId: string;
    source: GenerationSourceRef;
    sourceSnapshotHash: string;
    startedAt?: null | string;
    status: GenerationStatus;
    target?: GenerationTargetRef | null;
    targetDocumentType: string;
    traceId?: null | string;
    version: number;
  }

  export interface GenerationTicket {
    created: boolean;
    runId: string;
    status: GenerationStatus;
    version: number;
  }

  export interface StartGenerationReq {
    generationType: 'DEMAND_TO_SUPPLY_TASK';
    idempotencyKey: string;
    modelId: string;
    options: { instruction?: string };
    source: GenerationSourceRef;
  }

  export interface RegenerateGenerationReq {
    expectedVersion: number;
    idempotencyKey: string;
    modelId: string;
    options: { instruction?: string };
  }

  export interface MaterializeSelectionReq {
    confidence: Confidence;
    factoryToken: string;
    lineToken: string;
    reason?: string;
    riskCodes: string[];
  }

  export interface MaterializeReq {
    expectedProposalVersion: number;
    expectedRunVersion: number;
    idempotencyKey: string;
    overrideReason?: string;
    runId: string;
    selections: MaterializeSelectionReq[];
    sourcePlanId: string;
    sourcePlanVersion: number;
    summary?: string;
  }

  export interface MaterializeResult {
    batch: BatchDetail;
    created: boolean;
  }
}

const BASE_URL = '/fdmfactory/supply-task';
const GENERATION_URL = '/fdm-document-generation/runs';

function id(value: unknown, field: string) {
  if (typeof value === 'string' && /^[1-9]\d*$/.test(value)) return value;
  if (typeof value === 'number' && Number.isSafeInteger(value) && value > 0) {
    return String(value);
  }
  throw new TypeError(`${field} 不是有效的正整数 ID`);
}

function nullableId(value: unknown, field: string) {
  return value === null || value === undefined ? value : id(value, field);
}

function constraints(
  value?: null | Partial<FdmFactorySupplyTaskApi.FulfillmentConstraints>,
): FdmFactorySupplyTaskApi.FulfillmentConstraints {
  return {
    certificationRequirements: [...(value?.certificationRequirements || [])],
    countryComplianceRequirements: [
      ...(value?.countryComplianceRequirements || []),
    ],
    customerComplianceRequirements: [
      ...(value?.customerComplianceRequirements || []),
    ],
    deliveryLocation: value?.deliveryLocation,
    directShipRequired: value?.directShipRequired,
    fulfillmentMode: value?.fulfillmentMode,
    incoterm: value?.incoterm,
    packagingRequirements: [...(value?.packagingRequirements || [])],
  };
}

function normalizeFactoryCapabilityAuthority(
  value: FdmFactorySupplyTaskApi.FactoryCapabilityAuthoritySnapshot,
  fieldPrefix: string,
): FdmFactorySupplyTaskApi.FactoryCapabilityAuthoritySnapshot {
  return {
    ...value,
    capabilityId: id(value.capabilityId, `${fieldPrefix}.capabilityId`),
    evidenceByUserId: nullableId(
      value.evidenceByUserId,
      `${fieldPrefix}.evidenceByUserId`,
    ),
    skuId: id(value.skuId, `${fieldPrefix}.skuId`),
    supportedCertificationRequirements: [
      ...(value.supportedCertificationRequirements || []),
    ],
    supportedCountryComplianceRequirements: [
      ...(value.supportedCountryComplianceRequirements || []),
    ],
    supportedCustomerComplianceRequirements: [
      ...(value.supportedCustomerComplianceRequirements || []),
    ],
    supportedPackagingRequirements: [
      ...(value.supportedPackagingRequirements || []),
    ],
  };
}

function isFactoryCapabilityAuthorityEvidence(
  value: FdmFactorySupplyTaskApi.FactoryCapabilityEvidence,
): value is FdmFactorySupplyTaskApi.FactoryCapabilityAuthoritySnapshot {
  return Object.prototype.hasOwnProperty.call(value, 'capabilityId');
}

function normalizeFactoryCapabilityEvidence(
  value?: FdmFactorySupplyTaskApi.FactoryCapabilityEvidence | null,
): FdmFactorySupplyTaskApi.FactoryCapabilityEvidence | null | undefined {
  if (!value) return value;
  if (isFactoryCapabilityAuthorityEvidence(value)) {
    return normalizeFactoryCapabilityAuthority(
      value,
      'generationCandidate.factoryCapabilityEvidence',
    );
  }
  return { ...value };
}

function normalizeFactoryCapabilitySnapshot(
  value?: FdmFactorySupplyTaskApi.FactoryCapabilitySnapshot | null,
): FdmFactorySupplyTaskApi.FactoryCapabilitySnapshot | null | undefined {
  if (!value) return value;
  return {
    ...value,
    authority: normalizeFactoryCapabilityAuthority(
      value.authority,
      'factoryCapabilitySnapshot.authority',
    ),
    coverage: {
      ...value.coverage,
      certificationRequired: [...(value.coverage.certificationRequired || [])],
      certificationSupported: [
        ...(value.coverage.certificationSupported || []),
      ],
      countryComplianceRequired: [
        ...(value.coverage.countryComplianceRequired || []),
      ],
      countryComplianceSupported: [
        ...(value.coverage.countryComplianceSupported || []),
      ],
      customerComplianceRequired: [
        ...(value.coverage.customerComplianceRequired || []),
      ],
      customerComplianceSupported: [
        ...(value.coverage.customerComplianceSupported || []),
      ],
      packagingRequired: [...(value.coverage.packagingRequired || [])],
      packagingSupported: [...(value.coverage.packagingSupported || [])],
    },
  };
}

function normalizeLine(
  value: FdmFactorySupplyTaskApi.SupplyTaskLine,
): FdmFactorySupplyTaskApi.SupplyTaskLine {
  return {
    ...value,
    factoryCapabilityId: nullableId(
      value.factoryCapabilityId,
      'supplyTaskLine.factoryCapabilityId',
    ),
    factoryCapabilitySnapshot: normalizeFactoryCapabilitySnapshot(
      value.factoryCapabilitySnapshot,
    ),
    id: id(value.id, 'supplyTaskLine.id'),
    productId: id(value.productId, 'supplyTaskLine.productId'),
    riskCodes: [...(value.riskCodes || [])],
    skuId: id(value.skuId, 'supplyTaskLine.skuId'),
    sourceAllocationId: id(
      value.sourceAllocationId,
      'supplyTaskLine.sourceAllocationId',
    ),
    sourceOrderLineId: id(
      value.sourceOrderLineId,
      'supplyTaskLine.sourceOrderLineId',
    ),
    sourcePlanLineId: id(
      value.sourcePlanLineId,
      'supplyTaskLine.sourcePlanLineId',
    ),
  };
}

function normalizeTask(
  value: FdmFactorySupplyTaskApi.SupplyTask,
): FdmFactorySupplyTaskApi.SupplyTask {
  return {
    ...value,
    factoryId: id(value.factoryId, 'supplyTask.factoryId'),
    id: id(value.id, 'supplyTask.id'),
    lines: (value.lines || []).map((line) => normalizeLine(line)),
  };
}

export function normalizeSupplyTaskBatch(
  value: FdmFactorySupplyTaskApi.BatchDetail,
): FdmFactorySupplyTaskApi.BatchDetail {
  return {
    ...value,
    companyId: id(value.companyId, 'supplyTaskBatch.companyId'),
    contractOrderId: id(
      value.contractOrderId,
      'supplyTaskBatch.contractOrderId',
    ),
    createdByUserId: id(
      value.createdByUserId,
      'supplyTaskBatch.createdByUserId',
    ),
    customerId: nullableId(value.customerId, 'supplyTaskBatch.customerId'),
    fulfillmentConstraints: constraints(value.fulfillmentConstraints),
    generationModelId: id(
      value.generationModelId,
      'supplyTaskBatch.generationModelId',
    ),
    generationProposalId: id(
      value.generationProposalId,
      'supplyTaskBatch.generationProposalId',
    ),
    generationRunId: id(
      value.generationRunId,
      'supplyTaskBatch.generationRunId',
    ),
    id: id(value.id, 'supplyTaskBatch.id'),
    sourcePlanId: id(value.sourcePlanId, 'supplyTaskBatch.sourcePlanId'),
    tasks: (value.tasks || []).map((task) => normalizeTask(task)),
  };
}

function normalizeSummary(
  value: FdmFactorySupplyTaskApi.BatchSummary,
): FdmFactorySupplyTaskApi.BatchSummary {
  return {
    ...value,
    companyId: id(value.companyId, 'supplyTaskBatch.companyId'),
    contractOrderId: id(
      value.contractOrderId,
      'supplyTaskBatch.contractOrderId',
    ),
    createdByUserId: id(
      value.createdByUserId,
      'supplyTaskBatch.createdByUserId',
    ),
    id: id(value.id, 'supplyTaskBatch.id'),
    quantitySummary: (value.quantitySummary || []).map((item) => ({
      ...item,
    })),
    sourcePlanId: id(value.sourcePlanId, 'supplyTaskBatch.sourcePlanId'),
  };
}

function normalizeCandidateLine(
  value: FdmFactorySupplyTaskApi.CandidateLineEvidence,
): FdmFactorySupplyTaskApi.CandidateLineEvidence {
  return {
    ...value,
    candidates: (value.candidates || []).map((candidate) => ({
      ...candidate,
      factoryCapabilityEvidence: normalizeFactoryCapabilityEvidence(
        candidate.factoryCapabilityEvidence,
      ),
      factoryId: id(candidate.factoryId, 'generationCandidate.factoryId'),
    })),
    productId: id(value.productId, 'generationCandidateLine.productId'),
    skuId: id(value.skuId, 'generationCandidateLine.skuId'),
    sourcePlanLineId: id(
      value.sourcePlanLineId,
      'generationCandidateLine.sourcePlanLineId',
    ),
  };
}

function normalizeGenerationProposal(
  value: FdmFactorySupplyTaskApi.GenerationProposal,
): FdmFactorySupplyTaskApi.GenerationProposal {
  const evidence = { ...value.evidence };
  if (Array.isArray(evidence.candidateLines)) {
    evidence.candidateLines = evidence.candidateLines.map(
      normalizeCandidateLine,
    );
  }
  return {
    ...value,
    evidence,
    id: id(value.id, 'generationProposal.id'),
    missingData: [...(value.missingData || [])],
    warnings: [...(value.warnings || [])],
  };
}

export function normalizeSupplyTaskGenerationDetail(
  value: FdmFactorySupplyTaskApi.GenerationDetail,
): FdmFactorySupplyTaskApi.GenerationDetail {
  return {
    ...value,
    companyId: id(value.companyId, 'generation.companyId'),
    modelId: id(value.modelId, 'generation.modelId'),
    proposal: value.proposal
      ? normalizeGenerationProposal(value.proposal)
      : value.proposal,
    requestedBy: id(value.requestedBy, 'generation.requestedBy'),
    rules: (value.rules || []).map((rule) => ({
      ...rule,
      evidence: { ...rule.evidence },
    })),
    runId: id(value.runId, 'generation.runId'),
    source: {
      ...value.source,
      id: id(value.source.id, 'generation.source.id'),
    },
    target: value.target
      ? {
          ...value.target,
          id: id(value.target.id, 'generation.target.id'),
        }
      : value.target,
  };
}

function normalizeTicket(
  value: FdmFactorySupplyTaskApi.GenerationTicket,
): FdmFactorySupplyTaskApi.GenerationTicket {
  return { ...value, runId: id(value.runId, 'generation.runId') };
}

export async function getSupplyTaskPage(
  params: FdmFactorySupplyTaskApi.PageReq,
) {
  const result = await requestClient.get<
    PageResult<FdmFactorySupplyTaskApi.BatchSummary>
  >(`${BASE_URL}/page`, { params });
  return {
    ...result,
    list: (result.list || []).map((summary) => normalizeSummary(summary)),
  };
}

export async function getSupplyTask(idValue: string) {
  const result = await requestClient.get<FdmFactorySupplyTaskApi.BatchDetail>(
    `${BASE_URL}/get`,
    { params: { id: idValue } },
  );
  return normalizeSupplyTaskBatch(result);
}

export async function searchSupplyTaskAiModels() {
  const result = await searchFdmAiModels({
    modality: 'TEXT',
    requiredCapabilities: ['CHAT', 'STRUCTURED_OUTPUT'],
    routeKey: 'fdmfactory.demand-to-supply-task',
  });
  return result.map<FdmFactorySupplyTaskApi.ModelOption>((model) => ({
    capabilities: [...(model.capabilities || [])],
    code: model.code,
    enabled: model.enabled,
    id: id(model.id, 'supplyTaskModel.id'),
    name: model.name,
  }));
}

export async function startSupplyTaskGeneration(
  data: FdmFactorySupplyTaskApi.StartGenerationReq,
) {
  const result =
    await requestClient.post<FdmFactorySupplyTaskApi.GenerationTicket>(
      GENERATION_URL,
      data,
    );
  return normalizeTicket(result);
}

export async function getSupplyTaskGeneration(runId: string) {
  const result =
    await requestClient.get<FdmFactorySupplyTaskApi.GenerationDetail>(
      `${GENERATION_URL}/${encodeURIComponent(runId)}`,
    );
  return normalizeSupplyTaskGenerationDetail(result);
}

export async function retrySupplyTaskGeneration(
  runId: string,
  expectedVersion: number,
) {
  const result =
    await requestClient.post<FdmFactorySupplyTaskApi.GenerationTicket>(
      `${GENERATION_URL}/${encodeURIComponent(runId)}/retry`,
      { expectedVersion },
    );
  return normalizeTicket(result);
}

export async function regenerateSupplyTaskGeneration(
  runId: string,
  data: FdmFactorySupplyTaskApi.RegenerateGenerationReq,
) {
  const result =
    await requestClient.post<FdmFactorySupplyTaskApi.GenerationTicket>(
      `${GENERATION_URL}/${encodeURIComponent(runId)}/regenerate`,
      data,
    );
  return normalizeTicket(result);
}

export async function materializeSupplyTaskGeneration(
  data: FdmFactorySupplyTaskApi.MaterializeReq,
) {
  const result =
    await requestClient.post<FdmFactorySupplyTaskApi.MaterializeResult>(
      `${BASE_URL}/materialize-from-generation`,
      data,
    );
  return {
    ...result,
    batch: normalizeSupplyTaskBatch(result.batch),
  };
}
