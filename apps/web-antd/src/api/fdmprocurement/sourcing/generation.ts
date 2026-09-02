import type { FdmProcurementSourcingApi } from './index';

import { requestClient } from '#/api/request';

import { normalizeId, normalizeNullableId } from '../id-normalizer';
import { normalizeSourcingAssessment } from './index';

export namespace FdmProcurementSourcingGenerationApi {
  export type DecimalValue = number | string;
  export type SelectionMode = 'AI_PLAN' | 'CUSTOM' | 'SERVER_PLAN';
  export type JobStatus =
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

  export interface Model {
    capabilities: string[];
    code: string;
    enabled: boolean;
    id: string;
    name: string;
  }

  export interface Rule {
    evidence?: null | unknown;
    fieldPath?: null | string;
    message: string;
    passed: boolean;
    ruleCode: string;
    severity: 'BLOCKER' | 'INFO' | 'WARNING' | string;
  }

  export interface Blocker {
    code: string;
    message: string;
  }

  export interface SourceLine {
    customization?: null | string;
    itemVersion: number;
    lineHash: string;
    lineNo: number;
    lineToken: string;
    productCode?: null | string;
    productId?: null | string;
    productMappingStatus?: null | string;
    productName: string;
    productVersionToken?: null | string;
    purchaseUnit: string;
    requestedQty: DecimalValue;
    requiredBaseQty: DecimalValue;
    requiredDate?: null | string;
    requisitionItemId: string;
    skuId?: null | string;
    specification?: null | string;
    unitConversionFactor: DecimalValue;
  }

  export interface Source {
    companyId: string;
    lines: SourceLine[];
    requirementSetHash: string;
    requiredDate?: null | string;
    requisitionId: string;
    requisitionNo: string;
    status: string;
    validationStatus: string;
    version: number;
  }

  /** Frozen policy fields belong to this run; the UI must never query "current" policy. */
  export interface Policy {
    formulaVersion?: null | string;
    hash: string;
    id: string;
    maximumSupplierConcentration?: DecimalValue | null;
    maximumSupplierCount?: null | number;
    needsConfirmationSelectionAllowed?: boolean | null;
    overrideReasonMinLength?: null | number;
    trustedRateProviders: string[];
    version: number;
  }

  /** Prepared, non-persistent candidate. It intentionally has no database id. */
  export interface Candidate {
    capacityScore?: DecimalValue | null;
    candidateToken: string;
    comparableUnitCost?: DecimalValue | null;
    confidence?: null | string;
    costScore?: DecimalValue | null;
    currency?: null | string;
    deliveryScore?: DecimalValue | null;
    eligibilityStatus: FdmProcurementSourcingApi.EligibilityStatus;
    eliminationCodes: string[];
    evidenceCodes: string[];
    evidenceHash?: null | string;
    exchangeRateToCny?: DecimalValue | null;
    lineToken: string;
    maxAllocatableQty?: DecimalValue | null;
    minOrderQty?: DecimalValue | null;
    packageMultiple?: DecimalValue | null;
    performanceFactsHash?: null | string;
    performanceSnapshotId?: null | string;
    performanceSnapshotVersion?: null | number;
    promisedDate?: null | string;
    purchaseUnit?: null | string;
    qualityScore?: DecimalValue | null;
    quoteBusinessVersion?: null | number;
    quoteRecordVersion?: null | number;
    quoteSourceChecksum?: null | string;
    quoteTierId?: null | string;
    quoteTierMaxQty?: DecimalValue | null;
    quoteTierMinQty?: DecimalValue | null;
    quoteVersionId?: null | string;
    quotedUnitPrice?: DecimalValue | null;
    rateEffectiveDate?: null | string;
    rateFallbackUsed?: boolean | null;
    rateProvider?: null | string;
    rateRequestedDate?: null | string;
    rateRetrievedAt?: null | number;
    requisitionItemId: string;
    resilienceScore?: DecimalValue | null;
    supplierCompanyId?: null | string;
    supplierCompanyVersion?: null | number;
    supplierId: string;
    supplierProductId: string;
    supplierProductVersion?: null | number;
    supplierVersion?: null | number;
    termsScore?: DecimalValue | null;
    totalScore?: DecimalValue | null;
    unitConversionFactor?: DecimalValue | null;
  }

  export interface PlanAllocation {
    allocatedBaseQty: DecimalValue;
    allocationRole: string;
    candidateToken: string;
    lineToken: string;
    quantity: DecimalValue;
  }

  export interface FeasiblePlan {
    allocations: PlanAllocation[];
    comparableTotalCost?: DecimalValue | null;
    latestPromisedDate?: null | string;
    objectiveRank?: null | number;
    planHash: string;
    planToken: string;
    riskCodes: string[];
  }

  export interface CandidateStatusCounts {
    eligible: number;
    ineligible: number;
    needsConfirmation: number;
    unknown: number;
  }

  export interface ExistingAssessmentRef {
    id: string;
    inputHash: string;
    selected?: boolean | null;
    status: string;
  }

  /**
   * Safe, deterministic facts shared by options and READY jobs. Candidate and
   * plan tokens are opaque bindings; the browser never manufactures them.
   */
  export interface PreparedFacts {
    blockers: Blocker[];
    candidateCounts: CandidateStatusCounts;
    candidates: Candidate[];
    comparableCostComplete: boolean;
    evidenceDate?: null | string;
    feasiblePlans: FeasiblePlan[];
    fullCandidateSetHash: string;
    inputHash: string;
    missingData: string[];
    policy: Policy;
    source: Source;
    warnings: string[];
  }

  export interface Options {
    existingAssessment?: ExistingAssessmentRef | null;
    facts: PreparedFacts;
    generationType: 'REQUISITION_TO_SOURCING_PLAN' | string;
    models: Model[];
    routeKey: 'fdmprocurement.requisition-to-sourcing-plan' | string;
    sourceSnapshotHash: string;
  }

  export interface LineExplanation {
    candidateTokens: string[];
    highlightedEvidenceCodes: string[];
    lineToken: string;
    reason: string;
  }

  export interface Proposal {
    alternativePlanTokens: string[];
    lineExplanations: LineExplanation[];
    planReason: string;
    recommendedPlanToken: string;
    summary: string;
  }

  export interface Job {
    completedAt?: null | number;
    currentAttemptNo?: null | number;
    errorCode?: null | string;
    errorMessage?: null | string;
    facts?: null | PreparedFacts;
    generationType: string;
    id: string;
    invocationId?: null | string;
    missingData: string[];
    modelId: string;
    modelName?: null | string;
    proposal?: null | Proposal;
    proposalHash?: null | string;
    proposalSchemaVersion?: null | string;
    proposalVersion?: null | number;
    requestedAt?: null | number;
    rules: Rule[];
    sourceId: string;
    sourceSnapshotHash: string;
    sourceStale?: boolean | null;
    sourceType: string;
    sourceVersion: number;
    startedAt?: null | number;
    status: JobStatus;
    traceId?: null | string;
    version: number;
    warnings: string[];
  }

  export interface StartReq {
    expectedRequisitionVersion: number;
    idempotencyKey: string;
    instruction?: string;
    modelId: string;
    requisitionId: string;
  }

  export interface TransitionReq {
    expectedVersion: number;
    id: string;
  }

  export interface RegenerateReq extends TransitionReq {
    idempotencyKey: string;
    instruction?: string;
    modelId: string;
  }

  export interface MaterializeAllocation {
    candidateToken: string;
    quantity: DecimalValue;
  }

  export interface MaterializeReq {
    allocations: MaterializeAllocation[];
    expectedRequisitionVersion: number;
    expectedRunVersion: number;
    generationRunId: string;
    idempotencyKey: string;
    proposalVersion: number;
    reason?: null | string;
    requisitionId: string;
    selectedPlanToken?: null | string;
    selectionMode: SelectionMode;
  }

  export interface MaterializeResult {
    assessment: FdmProcurementSourcingApi.Assessment;
    created: boolean;
  }
}

const BASE_URL = '/fdmprocurement/sourcing';

function normalizeSourceLine(
  value: FdmProcurementSourcingGenerationApi.SourceLine,
): FdmProcurementSourcingGenerationApi.SourceLine {
  return {
    ...value,
    productId: normalizeNullableId(
      value.productId,
      'sourcingAi.source.productId',
    ),
    requisitionItemId: normalizeId(
      value.requisitionItemId,
      'sourcingAi.source.requisitionItemId',
    ),
    skuId: normalizeNullableId(value.skuId, 'sourcingAi.source.skuId'),
  };
}

function normalizeSource(
  value: FdmProcurementSourcingGenerationApi.Source,
): FdmProcurementSourcingGenerationApi.Source {
  return {
    ...value,
    companyId: normalizeId(value.companyId, 'sourcingAi.source.companyId'),
    lines: (value.lines || []).map((line) => normalizeSourceLine(line)),
    requisitionId: normalizeId(
      value.requisitionId,
      'sourcingAi.source.requisitionId',
    ),
  };
}

function normalizePolicy(
  value: FdmProcurementSourcingGenerationApi.Policy,
): FdmProcurementSourcingGenerationApi.Policy {
  return {
    ...value,
    id: normalizeId(value.id, 'sourcingAi.policy.id'),
    trustedRateProviders: [...(value.trustedRateProviders || [])],
  };
}

function normalizeCandidate(
  value: FdmProcurementSourcingGenerationApi.Candidate,
): FdmProcurementSourcingGenerationApi.Candidate {
  return {
    ...value,
    eliminationCodes: [...(value.eliminationCodes || [])],
    evidenceCodes: [...(value.evidenceCodes || [])],
    performanceSnapshotId: normalizeNullableId(
      value.performanceSnapshotId,
      'sourcingAi.candidate.performanceSnapshotId',
    ),
    quoteTierId: normalizeNullableId(
      value.quoteTierId,
      'sourcingAi.candidate.quoteTierId',
    ),
    quoteVersionId: normalizeNullableId(
      value.quoteVersionId,
      'sourcingAi.candidate.quoteVersionId',
    ),
    requisitionItemId: normalizeId(
      value.requisitionItemId,
      'sourcingAi.candidate.requisitionItemId',
    ),
    supplierCompanyId: normalizeNullableId(
      value.supplierCompanyId,
      'sourcingAi.candidate.supplierCompanyId',
    ),
    supplierId: normalizeId(
      value.supplierId,
      'sourcingAi.candidate.supplierId',
    ),
    supplierProductId: normalizeId(
      value.supplierProductId,
      'sourcingAi.candidate.supplierProductId',
    ),
  };
}

function normalizeFacts(
  value: FdmProcurementSourcingGenerationApi.PreparedFacts,
): FdmProcurementSourcingGenerationApi.PreparedFacts {
  return {
    ...value,
    candidates: (value.candidates || []).map((candidate) =>
      normalizeCandidate(candidate),
    ),
    blockers: [...(value.blockers || [])],
    feasiblePlans: (value.feasiblePlans || []).map((plan) => ({
      ...plan,
      allocations: [...(plan.allocations || [])],
      riskCodes: [...(plan.riskCodes || [])],
    })),
    missingData: [...(value.missingData || [])],
    policy: normalizePolicy(value.policy),
    source: normalizeSource(value.source),
    warnings: [...(value.warnings || [])],
  };
}

export function normalizeSourcingGenerationOptions(
  value: FdmProcurementSourcingGenerationApi.Options,
): FdmProcurementSourcingGenerationApi.Options {
  return {
    ...value,
    existingAssessment: value.existingAssessment
      ? {
          ...value.existingAssessment,
          id: normalizeId(
            value.existingAssessment.id,
            'sourcingAi.existingAssessment.id',
          ),
        }
      : value.existingAssessment,
    facts: normalizeFacts(value.facts),
    models: (value.models || []).map((model) => ({
      ...model,
      capabilities: [...(model.capabilities || [])],
      id: normalizeId(model.id, 'sourcingAi.model.id'),
    })),
  };
}

export function normalizeSourcingGenerationJob(
  value: FdmProcurementSourcingGenerationApi.Job,
): FdmProcurementSourcingGenerationApi.Job {
  return {
    ...value,
    facts: value.facts ? normalizeFacts(value.facts) : value.facts,
    id: normalizeId(value.id, 'sourcingAi.job.id'),
    invocationId: value.invocationId,
    missingData: [...(value.missingData || [])],
    modelId: normalizeId(value.modelId, 'sourcingAi.job.modelId'),
    proposal: value.proposal
      ? {
          ...value.proposal,
          alternativePlanTokens: [
            ...(value.proposal.alternativePlanTokens || []),
          ],
          lineExplanations: (value.proposal.lineExplanations || []).map(
            (line) => ({
              ...line,
              candidateTokens: [...(line.candidateTokens || [])],
              highlightedEvidenceCodes: [
                ...(line.highlightedEvidenceCodes || []),
              ],
            }),
          ),
        }
      : value.proposal,
    rules: [...(value.rules || [])],
    sourceId: normalizeId(value.sourceId, 'sourcingAi.job.sourceId'),
    warnings: [...(value.warnings || [])],
  };
}

export async function getSourcingGenerationOptions(
  requisitionId: string,
  expectedRequisitionVersion: number,
) {
  const result =
    await requestClient.get<FdmProcurementSourcingGenerationApi.Options>(
      `${BASE_URL}/generation-options`,
      { params: { expectedRequisitionVersion, requisitionId } },
    );
  return normalizeSourcingGenerationOptions(result);
}

export async function startSourcingGeneration(
  data: FdmProcurementSourcingGenerationApi.StartReq,
) {
  const result =
    await requestClient.post<FdmProcurementSourcingGenerationApi.Job>(
      `${BASE_URL}/generation/start`,
      data,
    );
  return normalizeSourcingGenerationJob(result);
}

export async function getSourcingGenerationJob(id: string) {
  const result =
    await requestClient.get<FdmProcurementSourcingGenerationApi.Job>(
      `${BASE_URL}/generation/job`,
      { params: { id } },
    );
  return normalizeSourcingGenerationJob(result);
}

export async function retrySourcingGeneration(
  data: FdmProcurementSourcingGenerationApi.TransitionReq,
) {
  const result =
    await requestClient.post<FdmProcurementSourcingGenerationApi.Job>(
      `${BASE_URL}/generation/retry`,
      data,
    );
  return normalizeSourcingGenerationJob(result);
}

export async function regenerateSourcingGeneration(
  data: FdmProcurementSourcingGenerationApi.RegenerateReq,
) {
  const result =
    await requestClient.post<FdmProcurementSourcingGenerationApi.Job>(
      `${BASE_URL}/generation/regenerate`,
      data,
    );
  return normalizeSourcingGenerationJob(result);
}

export async function cancelSourcingGeneration(
  data: FdmProcurementSourcingGenerationApi.TransitionReq,
) {
  const result =
    await requestClient.post<FdmProcurementSourcingGenerationApi.Job>(
      `${BASE_URL}/generation/cancel`,
      data,
    );
  return normalizeSourcingGenerationJob(result);
}

export async function materializeSourcingGeneration(
  data: FdmProcurementSourcingGenerationApi.MaterializeReq,
) {
  const result =
    await requestClient.post<FdmProcurementSourcingGenerationApi.MaterializeResult>(
      `${BASE_URL}/materialize-from-generation`,
      data,
    );
  return {
    ...result,
    assessment: normalizeSourcingAssessment(result.assessment),
  };
}
