import { requestClient } from '#/api/request';

import { normalizeId, normalizeNullableId } from '../id-normalizer';

export namespace FdmProcurementSourcingApi {
  export type DecimalValue = number | string;
  export type EligibilityStatus =
    | 'ELIGIBLE'
    | 'INELIGIBLE'
    | 'NEEDS_CONFIRMATION'
    | 'UNKNOWN'
    | (string & {});

  export interface Candidate {
    capacityScore?: DecimalValue | null;
    comparableUnitCost?: DecimalValue | null;
    confidence?: null | string;
    costScore?: DecimalValue | null;
    currency?: null | string;
    deliveryScore?: DecimalValue | null;
    eligibilityStatus: EligibilityStatus;
    eliminationCodes?: null | string[];
    evidenceHash?: null | string;
    exchangeRateToCny?: DecimalValue | null;
    id: string;
    maxAllocatableQty?: DecimalValue | null;
    minOrderQty?: DecimalValue | null;
    packageMultiple?: DecimalValue | null;
    performanceFactsHash?: null | string;
    performanceSnapshotId?: null | string;
    purchaseUnit?: null | string;
    quoteTierMaxQty?: DecimalValue | null;
    quoteTierMinQty?: DecimalValue | null;
    promisedDate?: null | string;
    qualityScore?: DecimalValue | null;
    quoteTierId?: null | string;
    quoteVersionId?: null | string;
    quotedUnitPrice?: DecimalValue | null;
    requisitionItemId: string;
    rateEffectiveDate?: null | string;
    rateFallbackUsed?: boolean | null;
    rateProvider?: null | string;
    rateRequestedDate?: null | string;
    rateRetrievedAt?: null | number | string;
    resilienceScore?: DecimalValue | null;
    supplierId: string;
    supplierProductId: string;
    termsScore?: DecimalValue | null;
    totalScore?: DecimalValue | null;
    unitConversionFactor?: DecimalValue | null;
  }

  export interface Allocation {
    allocatedQty: DecimalValue;
    allocationRole: 'HUMAN_SELECTED' | 'RECOMMENDED' | string;
    candidateId: string;
    id: string;
    overrideReason?: null | string;
    requisitionItemId: string;
    selected?: boolean | null;
    selectedBy?: null | string;
  }

  export interface Assessment {
    allocations: Allocation[];
    candidates: Candidate[];
    companyId: string;
    comparableCostComplete: boolean;
    eligibleCandidateCount: number;
    evidenceDate?: null | string;
    evaluatedAt?: null | number | string;
    evaluatedBy?: null | string;
    id: string;
    inputHash: string;
    maximumSupplierConcentration?: DecimalValue | null;
    maximumSupplierCount?: null | number;
    needsConfirmationCandidateCount?: null | number;
    needsConfirmationSelectionAllowed?: boolean | null;
    overrideReasonMinLength?: null | number;
    policyHash?: null | string;
    policyId?: null | string;
    policyVersion?: null | number;
    requisitionId: string;
    requisitionVersion: number;
    ruleVersion: string;
    status: 'BLOCKED' | 'READY' | 'REVIEW_REQUIRED' | 'SELECTED' | string;
  }

  export interface SelectionReq {
    allocations: Array<{ candidateId: string; quantity: DecimalValue }>;
    assessmentId: string;
    /**
     * Only mandatory when at least one NEEDS_CONFIRMATION candidate is used.
     * The server validates the frozen policy's minimum override length.
     */
    reason?: null | string;
  }
}

const BASE_URL = '/fdmprocurement/sourcing';

function normalizeCandidate(
  value: FdmProcurementSourcingApi.Candidate,
): FdmProcurementSourcingApi.Candidate {
  return {
    ...value,
    eliminationCodes: Array.isArray(value.eliminationCodes)
      ? value.eliminationCodes.map(String)
      : [],
    id: normalizeId(value.id, 'sourcingCandidate.id'),
    performanceSnapshotId: normalizeNullableId(
      value.performanceSnapshotId,
      'sourcingCandidate.performanceSnapshotId',
    ),
    quoteTierId: normalizeNullableId(
      value.quoteTierId,
      'sourcingCandidate.quoteTierId',
    ),
    quoteVersionId: normalizeNullableId(
      value.quoteVersionId,
      'sourcingCandidate.quoteVersionId',
    ),
    requisitionItemId: normalizeId(
      value.requisitionItemId,
      'sourcingCandidate.requisitionItemId',
    ),
    supplierId: normalizeId(value.supplierId, 'sourcingCandidate.supplierId'),
    supplierProductId: normalizeId(
      value.supplierProductId,
      'sourcingCandidate.supplierProductId',
    ),
  };
}

function normalizeAllocation(
  value: FdmProcurementSourcingApi.Allocation,
): FdmProcurementSourcingApi.Allocation {
  return {
    ...value,
    candidateId: normalizeId(
      value.candidateId,
      'sourcingAllocation.candidateId',
    ),
    id: normalizeId(value.id, 'sourcingAllocation.id'),
    requisitionItemId: normalizeId(
      value.requisitionItemId,
      'sourcingAllocation.requisitionItemId',
    ),
    selectedBy: normalizeNullableId(
      value.selectedBy,
      'sourcingAllocation.selectedBy',
    ),
  };
}

export function normalizeSourcingAssessment(
  value: FdmProcurementSourcingApi.Assessment,
): FdmProcurementSourcingApi.Assessment {
  return {
    ...value,
    allocations: (value.allocations || []).map((allocation) =>
      normalizeAllocation(allocation),
    ),
    candidates: (value.candidates || []).map((candidate) =>
      normalizeCandidate(candidate),
    ),
    companyId: normalizeId(value.companyId, 'sourcingAssessment.companyId'),
    evaluatedBy: normalizeNullableId(
      value.evaluatedBy,
      'sourcingAssessment.evaluatedBy',
    ),
    id: normalizeId(value.id, 'sourcingAssessment.id'),
    policyId: normalizeNullableId(
      value.policyId,
      'sourcingAssessment.policyId',
    ),
    requisitionId: normalizeId(
      value.requisitionId,
      'sourcingAssessment.requisitionId',
    ),
  };
}

export async function evaluateProcurementSourcing(data: {
  expectedRequisitionVersion: number;
  requisitionId: string;
}) {
  const result = await requestClient.post<FdmProcurementSourcingApi.Assessment>(
    `${BASE_URL}/evaluate`,
    data,
  );
  return normalizeSourcingAssessment(result);
}

export async function getProcurementSourcingAssessment(id: string) {
  const result = await requestClient.get<FdmProcurementSourcingApi.Assessment>(
    `${BASE_URL}/get`,
    { params: { id } },
  );
  return normalizeSourcingAssessment(result);
}

export async function selectProcurementSourcing(
  data: FdmProcurementSourcingApi.SelectionReq,
) {
  const result = await requestClient.post<FdmProcurementSourcingApi.Assessment>(
    `${BASE_URL}/select`,
    data,
  );
  return normalizeSourcingAssessment(result);
}
