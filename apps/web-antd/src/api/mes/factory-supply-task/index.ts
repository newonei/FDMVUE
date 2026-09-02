import type { PageParam, PageResult } from '@vben/request';

import { searchFdmAiModels } from '#/api/fdmai';
import { requestClient } from '#/api/request';

export namespace MesFactorySupplyTaskApi {
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
    productSkuId: string;
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

  export interface FactoryTaskLine {
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
    mesItemCode?: null | string;
    mesItemId: string;
    mesMappingVersion?: null | string;
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

  export interface FactoryTask {
    factoryCode?: null | string;
    factoryId: string;
    factoryName?: null | string;
    factoryTimezone?: null | string;
    factoryVersion: number;
    id: string;
    lines: FactoryTaskLine[];
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
    tasks: FactoryTask[];
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
    mesItemCode?: null | string;
    mesItemId: string;
    mesMappingVersion?: null | string;
    productCode?: null | string;
    productName?: null | string;
    productVersionToken?: null | string;
    quantity: DecimalValue;
    requiredDate: string;
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
    generationType: 'DEMAND_TO_FACTORY_TASK' | string;
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
    generationType: 'DEMAND_TO_FACTORY_TASK';
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

const BASE_URL = '/mes/factory-supply-task';
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
  value?: null | Partial<MesFactorySupplyTaskApi.FulfillmentConstraints>,
): MesFactorySupplyTaskApi.FulfillmentConstraints {
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
  value: MesFactorySupplyTaskApi.FactoryCapabilityAuthoritySnapshot,
  fieldPrefix: string,
): MesFactorySupplyTaskApi.FactoryCapabilityAuthoritySnapshot {
  return {
    ...value,
    capabilityId: id(value.capabilityId, `${fieldPrefix}.capabilityId`),
    evidenceByUserId: nullableId(
      value.evidenceByUserId,
      `${fieldPrefix}.evidenceByUserId`,
    ),
    productSkuId: id(value.productSkuId, `${fieldPrefix}.productSkuId`),
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
  value: MesFactorySupplyTaskApi.FactoryCapabilityEvidence,
): value is MesFactorySupplyTaskApi.FactoryCapabilityAuthoritySnapshot {
  return Object.prototype.hasOwnProperty.call(value, 'capabilityId');
}

function normalizeFactoryCapabilityEvidence(
  value?: MesFactorySupplyTaskApi.FactoryCapabilityEvidence | null,
): MesFactorySupplyTaskApi.FactoryCapabilityEvidence | null | undefined {
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
  value?: MesFactorySupplyTaskApi.FactoryCapabilitySnapshot | null,
): MesFactorySupplyTaskApi.FactoryCapabilitySnapshot | null | undefined {
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
  value: MesFactorySupplyTaskApi.FactoryTaskLine,
): MesFactorySupplyTaskApi.FactoryTaskLine {
  return {
    ...value,
    factoryCapabilityId: nullableId(
      value.factoryCapabilityId,
      'factoryTaskLine.factoryCapabilityId',
    ),
    factoryCapabilitySnapshot: normalizeFactoryCapabilitySnapshot(
      value.factoryCapabilitySnapshot,
    ),
    id: id(value.id, 'factoryTaskLine.id'),
    mesItemId: id(value.mesItemId, 'factoryTaskLine.mesItemId'),
    productId: id(value.productId, 'factoryTaskLine.productId'),
    riskCodes: [...(value.riskCodes || [])],
    skuId: id(value.skuId, 'factoryTaskLine.skuId'),
    sourceAllocationId: id(
      value.sourceAllocationId,
      'factoryTaskLine.sourceAllocationId',
    ),
    sourceOrderLineId: id(
      value.sourceOrderLineId,
      'factoryTaskLine.sourceOrderLineId',
    ),
    sourcePlanLineId: id(
      value.sourcePlanLineId,
      'factoryTaskLine.sourcePlanLineId',
    ),
  };
}

function normalizeTask(
  value: MesFactorySupplyTaskApi.FactoryTask,
): MesFactorySupplyTaskApi.FactoryTask {
  return {
    ...value,
    factoryId: id(value.factoryId, 'factoryTask.factoryId'),
    id: id(value.id, 'factoryTask.id'),
    lines: (value.lines || []).map((line) => normalizeLine(line)),
  };
}

export function normalizeFactorySupplyBatch(
  value: MesFactorySupplyTaskApi.BatchDetail,
): MesFactorySupplyTaskApi.BatchDetail {
  return {
    ...value,
    companyId: id(value.companyId, 'factorySupplyBatch.companyId'),
    contractOrderId: id(
      value.contractOrderId,
      'factorySupplyBatch.contractOrderId',
    ),
    createdByUserId: id(
      value.createdByUserId,
      'factorySupplyBatch.createdByUserId',
    ),
    customerId: nullableId(value.customerId, 'factorySupplyBatch.customerId'),
    fulfillmentConstraints: constraints(value.fulfillmentConstraints),
    generationModelId: id(
      value.generationModelId,
      'factorySupplyBatch.generationModelId',
    ),
    generationProposalId: id(
      value.generationProposalId,
      'factorySupplyBatch.generationProposalId',
    ),
    generationRunId: id(
      value.generationRunId,
      'factorySupplyBatch.generationRunId',
    ),
    id: id(value.id, 'factorySupplyBatch.id'),
    sourcePlanId: id(value.sourcePlanId, 'factorySupplyBatch.sourcePlanId'),
    tasks: (value.tasks || []).map((task) => normalizeTask(task)),
  };
}

function normalizeSummary(
  value: MesFactorySupplyTaskApi.BatchSummary,
): MesFactorySupplyTaskApi.BatchSummary {
  return {
    ...value,
    companyId: id(value.companyId, 'factorySupplyBatch.companyId'),
    contractOrderId: id(
      value.contractOrderId,
      'factorySupplyBatch.contractOrderId',
    ),
    createdByUserId: id(
      value.createdByUserId,
      'factorySupplyBatch.createdByUserId',
    ),
    id: id(value.id, 'factorySupplyBatch.id'),
    quantitySummary: (value.quantitySummary || []).map((item) => ({
      ...item,
    })),
    sourcePlanId: id(value.sourcePlanId, 'factorySupplyBatch.sourcePlanId'),
  };
}

function normalizeCandidateLine(
  value: MesFactorySupplyTaskApi.CandidateLineEvidence,
): MesFactorySupplyTaskApi.CandidateLineEvidence {
  return {
    ...value,
    candidates: (value.candidates || []).map((candidate) => ({
      ...candidate,
      factoryCapabilityEvidence: normalizeFactoryCapabilityEvidence(
        candidate.factoryCapabilityEvidence,
      ),
      factoryId: id(candidate.factoryId, 'generationCandidate.factoryId'),
    })),
    mesItemId: id(value.mesItemId, 'generationCandidateLine.mesItemId'),
    sourcePlanLineId: id(
      value.sourcePlanLineId,
      'generationCandidateLine.sourcePlanLineId',
    ),
  };
}

function normalizeGenerationProposal(
  value: MesFactorySupplyTaskApi.GenerationProposal,
): MesFactorySupplyTaskApi.GenerationProposal {
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

export function normalizeFactoryTaskGenerationDetail(
  value: MesFactorySupplyTaskApi.GenerationDetail,
): MesFactorySupplyTaskApi.GenerationDetail {
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
  value: MesFactorySupplyTaskApi.GenerationTicket,
): MesFactorySupplyTaskApi.GenerationTicket {
  return { ...value, runId: id(value.runId, 'generation.runId') };
}

export async function getFactorySupplyTaskPage(
  params: MesFactorySupplyTaskApi.PageReq,
) {
  const result = await requestClient.get<
    PageResult<MesFactorySupplyTaskApi.BatchSummary>
  >(`${BASE_URL}/page`, { params });
  return {
    ...result,
    list: (result.list || []).map((summary) => normalizeSummary(summary)),
  };
}

export async function getFactorySupplyTask(idValue: string) {
  const result = await requestClient.get<MesFactorySupplyTaskApi.BatchDetail>(
    `${BASE_URL}/get`,
    { params: { id: idValue } },
  );
  return normalizeFactorySupplyBatch(result);
}

export async function searchFactoryTaskAiModels() {
  const result = await searchFdmAiModels({
    modality: 'TEXT',
    requiredCapabilities: ['CHAT', 'STRUCTURED_OUTPUT'],
    routeKey: 'mes.demand-to-factory-task',
  });
  return result.map<MesFactorySupplyTaskApi.ModelOption>((model) => ({
    capabilities: [...(model.capabilities || [])],
    code: model.code,
    enabled: model.enabled,
    id: id(model.id, 'factoryTaskModel.id'),
    name: model.name,
  }));
}

export async function startFactoryTaskGeneration(
  data: MesFactorySupplyTaskApi.StartGenerationReq,
) {
  const result =
    await requestClient.post<MesFactorySupplyTaskApi.GenerationTicket>(
      GENERATION_URL,
      data,
    );
  return normalizeTicket(result);
}

export async function getFactoryTaskGeneration(runId: string) {
  const result =
    await requestClient.get<MesFactorySupplyTaskApi.GenerationDetail>(
      `${GENERATION_URL}/${encodeURIComponent(runId)}`,
    );
  return normalizeFactoryTaskGenerationDetail(result);
}

export async function retryFactoryTaskGeneration(
  runId: string,
  expectedVersion: number,
) {
  const result =
    await requestClient.post<MesFactorySupplyTaskApi.GenerationTicket>(
      `${GENERATION_URL}/${encodeURIComponent(runId)}/retry`,
      { expectedVersion },
    );
  return normalizeTicket(result);
}

export async function regenerateFactoryTaskGeneration(
  runId: string,
  data: MesFactorySupplyTaskApi.RegenerateGenerationReq,
) {
  const result =
    await requestClient.post<MesFactorySupplyTaskApi.GenerationTicket>(
      `${GENERATION_URL}/${encodeURIComponent(runId)}/regenerate`,
      data,
    );
  return normalizeTicket(result);
}

export async function materializeFactoryTaskGeneration(
  data: MesFactorySupplyTaskApi.MaterializeReq,
) {
  const result =
    await requestClient.post<MesFactorySupplyTaskApi.MaterializeResult>(
      `${BASE_URL}/materialize-from-generation`,
      data,
    );
  return {
    ...result,
    batch: normalizeFactorySupplyBatch(result.batch),
  };
}
