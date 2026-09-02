import type { FdmProcurementRequisitionApi } from '#/api/fdmprocurement/requisition';
import type { FdmProcurementSourcingApi } from '#/api/fdmprocurement/sourcing';

import BigNumber from 'bignumber.js';

import {
  eligibilityPresentation,
  usesNeedsConfirmation,
} from './candidate-presentation';

export interface SelectionBuildResult {
  issues: string[];
  request?: FdmProcurementSourcingApi.SelectionReq;
}

export interface SelectionCandidateFacts {
  candidateKey: string;
  eligibilityStatus?: FdmProcurementSourcingApi.EligibilityStatus | null;
  maxAllocatableQty?: null | number | string;
  minOrderQty?: null | number | string;
  packageMultiple?: null | number | string;
  quoteTierMaxQty?: null | number | string;
  quoteTierMinQty?: null | number | string;
  requisitionItemId: string;
  supplierId: string;
  unitConversionFactor?: null | number | string;
}

export interface FrozenSelectionPolicy {
  maximumSupplierConcentration?: null | number | string;
  maximumSupplierCount?: null | number;
  needsConfirmationSelectionAllowed?: boolean | null;
  overrideReasonMinLength?: null | number;
}

export interface SelectionIntentBuildResult {
  allocations?: Array<{ candidateKey: string; quantity: string }>;
  issues: string[];
  reason: null | string;
}

export interface LineQuantitySummary {
  allocatedBase?: string;
  balanced: boolean;
  complete: boolean;
  requiredBase?: string;
}

function decimal(value: null | number | string | undefined) {
  const result = new BigNumber(value ?? Number.NaN);
  return result.isFinite() ? result : undefined;
}

function plainDecimal(value: BigNumber) {
  return value.toFixed(value.decimalPlaces() ?? 0);
}

export function initialSelectionQuantities(
  assessment: FdmProcurementSourcingApi.Assessment,
) {
  const result: Record<string, string> = {};
  const selectedAllocations = assessment.allocations.filter(
    (allocation) => allocation.selected === true,
  );
  const visibleAllocations =
    selectedAllocations.length > 0
      ? selectedAllocations
      : assessment.allocations.filter(
          (allocation) => allocation.selected !== true,
        );
  visibleAllocations.forEach((allocation) => {
    const value = decimal(allocation.allocatedQty);
    if (value?.isGreaterThan(0)) {
      result[String(allocation.candidateId)] = plainDecimal(value);
    }
  });
  return result;
}

export function sourcingLineQuantitySummary(
  assessment: FdmProcurementSourcingApi.Assessment,
  item: FdmProcurementRequisitionApi.Requisition['items'][number],
  quantities: Record<string, string | undefined>,
): LineQuantitySummary {
  return sourcingLineQuantitySummaryFromCandidates(
    assessment.candidates.map(selectionCandidateFacts),
    item,
    quantities,
  );
}

export function sourcingLineQuantitySummaryFromCandidates(
  candidates: readonly SelectionCandidateFacts[],
  item: FdmProcurementRequisitionApi.Requisition['items'][number],
  quantities: Record<string, string | undefined>,
): LineQuantitySummary {
  const requested = decimal(item.requestedQty);
  const requisitionFactor = decimal(item.unitConversionFactor);
  const required =
    requested && requisitionFactor?.isGreaterThan(0)
      ? requested.multipliedBy(requisitionFactor)
      : undefined;
  let complete = Boolean(required);
  let allocated = new BigNumber(0);
  for (const candidate of candidates) {
    if (String(candidate.requisitionItemId) !== String(item.id)) continue;
    const quantity = decimal(quantities[candidate.candidateKey]);
    if (!quantity || quantity.isZero()) continue;
    const factor = decimal(candidate.unitConversionFactor);
    if (!factor?.isGreaterThan(0)) {
      complete = false;
      continue;
    }
    allocated = allocated.plus(quantity.multipliedBy(factor));
  }

  return {
    allocatedBase: complete ? plainDecimal(allocated) : undefined,
    balanced: Boolean(complete && required?.isEqualTo(allocated)),
    complete,
    requiredBase: required ? plainDecimal(required) : undefined,
  };
}

function selectionCandidateFacts(
  candidate: FdmProcurementSourcingApi.Candidate,
): SelectionCandidateFacts {
  return {
    candidateKey: String(candidate.id),
    eligibilityStatus: candidate.eligibilityStatus,
    maxAllocatableQty: candidate.maxAllocatableQty,
    minOrderQty: candidate.minOrderQty,
    packageMultiple: candidate.packageMultiple,
    quoteTierMaxQty: candidate.quoteTierMaxQty,
    quoteTierMinQty: candidate.quoteTierMinQty,
    requisitionItemId: String(candidate.requisitionItemId),
    supplierId: String(candidate.supplierId),
    unitConversionFactor: candidate.unitConversionFactor,
  };
}

export function buildSourcingSelection(
  assessment: FdmProcurementSourcingApi.Assessment,
  requisition: FdmProcurementRequisitionApi.Requisition,
  quantities: Record<string, string | undefined>,
  overrideReason: string,
): SelectionBuildResult {
  const result = buildSourcingSelectionIntent(
    assessment.candidates.map(selectionCandidateFacts),
    {
      maximumSupplierConcentration: assessment.maximumSupplierConcentration,
      maximumSupplierCount: assessment.maximumSupplierCount,
      needsConfirmationSelectionAllowed:
        assessment.needsConfirmationSelectionAllowed,
      overrideReasonMinLength: assessment.overrideReasonMinLength,
    },
    requisition,
    quantities,
    overrideReason,
  );
  return result.allocations
    ? {
        issues: result.issues,
        request: {
          allocations: result.allocations.map((allocation) => ({
            candidateId: allocation.candidateKey,
            quantity: allocation.quantity,
          })),
          assessmentId: String(assessment.id),
          reason: result.reason,
        },
      }
    : { issues: result.issues };
}

export function buildSourcingSelectionIntent(
  candidates: readonly SelectionCandidateFacts[],
  policy: FrozenSelectionPolicy,
  requisition: FdmProcurementRequisitionApi.Requisition,
  quantities: Record<string, string | undefined>,
  overrideReason: string,
): SelectionIntentBuildResult {
  const issues: string[] = [];
  const allocations: Array<{ candidateKey: string; quantity: string }> = [];
  const candidateById = new Map(
    candidates.map((candidate) => [candidate.candidateKey, candidate]),
  );

  Object.entries(quantities).forEach(([candidateId, rawQuantity]) => {
    const quantity = decimal(rawQuantity);
    if (!quantity || quantity.isZero()) return;
    const candidate = candidateById.get(candidateId);
    if (!candidate) {
      issues.push(`候选 ${candidateId} 不属于当前评估结果`);
      return;
    }
    if (quantity.isNegative()) {
      issues.push(`候选 ${candidateId} 的分配数量不能小于 0`);
      return;
    }
    const eligibility = eligibilityPresentation(candidate.eligibilityStatus);
    if (
      eligibility.status !== 'ELIGIBLE' &&
      eligibility.status !== 'NEEDS_CONFIRMATION'
    ) {
      issues.push(`候选 ${candidateId} 当前为“${eligibility.label}”，禁止选用`);
      return;
    }
    const upperBound = decimal(candidate.maxAllocatableQty);
    if (upperBound && quantity.isGreaterThan(upperBound)) {
      issues.push(
        `候选 ${candidateId} 超过最大可分配数量 ${plainDecimal(upperBound)}`,
      );
      return;
    }
    const factor = decimal(candidate.unitConversionFactor);
    if (!factor?.isGreaterThan(0)) {
      issues.push(`候选 ${candidateId} 缺少有效的采购单位换算系数`);
      return;
    }
    const minimum = decimal(candidate.minOrderQty);
    if (minimum && quantity.isLessThan(minimum)) {
      issues.push(`候选 ${candidateId} 低于最小起订量 ${plainDecimal(minimum)}`);
      return;
    }
    const multiple = decimal(candidate.packageMultiple);
    if (multiple?.isGreaterThan(0) && !quantity.modulo(multiple).isZero()) {
      issues.push(
        `候选 ${candidateId} 必须按 ${plainDecimal(multiple)} 的包装倍数分配`,
      );
      return;
    }
    const tierMinimum = decimal(candidate.quoteTierMinQty);
    const tierMaximum = decimal(candidate.quoteTierMaxQty);
    if (
      (tierMinimum && quantity.isLessThan(tierMinimum)) ||
      (tierMaximum && quantity.isGreaterThan(tierMaximum))
    ) {
      issues.push(`候选 ${candidateId} 的数量不在当前冻结报价阶梯内`);
      return;
    }
    allocations.push({
      candidateKey: candidateId,
      quantity: plainDecimal(quantity),
    });
  });

  const maximumSupplierCount = policy.maximumSupplierCount;
  if (
    maximumSupplierCount !== null &&
    maximumSupplierCount !== undefined &&
    (!Number.isInteger(maximumSupplierCount) || maximumSupplierCount <= 0)
  ) {
    issues.push('冻结策略中的最大供应商数量无效');
  }
  const maximumConcentration = decimal(policy.maximumSupplierConcentration);
  if (
    policy.maximumSupplierConcentration !== null &&
    policy.maximumSupplierConcentration !== undefined &&
    (!maximumConcentration?.isGreaterThan(0) ||
      maximumConcentration.isGreaterThan(1))
  ) {
    issues.push('冻结策略中的单供应商最大集中度无效');
  }

  requisition.items.forEach((item) => {
    const requested = decimal(item.requestedQty);
    const requisitionFactor = decimal(item.unitConversionFactor);
    const expected =
      requested && requisitionFactor?.isGreaterThan(0)
        ? requested.multipliedBy(requisitionFactor)
        : undefined;
    const lineAllocations = allocations.filter(
      (allocation) =>
        String(
          candidateById.get(allocation.candidateKey)?.requisitionItemId,
        ) === String(item.id),
    );
    const baseBySupplier = new Map<string, BigNumber>();
    let actual = new BigNumber(0);
    for (const allocation of lineAllocations) {
      const candidate = candidateById.get(allocation.candidateKey);
      const factor = decimal(candidate?.unitConversionFactor);
      if (!candidate || !factor) continue;
      const allocatedBase = new BigNumber(
        String(allocation.quantity),
      ).multipliedBy(factor);
      const supplierId = String(candidate.supplierId);
      baseBySupplier.set(
        supplierId,
        (baseBySupplier.get(supplierId) || new BigNumber(0)).plus(
          allocatedBase,
        ),
      );
      actual = actual.plus(allocatedBase);
    }
    if (!expected || !actual.isEqualTo(expected)) {
      issues.push(
        `第 ${item.lineNo} 行分配后的基础数量 ${plainDecimal(actual)}，必须等于申请基础数量 ${expected ? plainDecimal(expected) : 'UNKNOWN'}`,
      );
    }
    if (
      maximumSupplierCount !== null &&
      maximumSupplierCount !== undefined &&
      Number.isInteger(maximumSupplierCount) &&
      maximumSupplierCount > 0 &&
      baseBySupplier.size > maximumSupplierCount
    ) {
      issues.push(
        `第 ${item.lineNo} 行选择了 ${baseBySupplier.size} 家供应商，超过冻结策略上限 ${maximumSupplierCount} 家`,
      );
    }
    if (expected?.isGreaterThan(0) && maximumConcentration) {
      baseBySupplier.forEach((allocatedBase, supplierId) => {
        const concentration = allocatedBase.dividedBy(expected);
        if (concentration.isGreaterThan(maximumConcentration)) {
          issues.push(
            `第 ${item.lineNo} 行供应商 ${supplierId} 的基础数量占比 ${concentration.multipliedBy(100).toFixed(2)}%，超过冻结策略上限 ${maximumConcentration.multipliedBy(100).toFixed(2)}%`,
          );
        }
      });
    }
  });

  const normalizedReason = overrideReason.trim();
  const needsOverride = allocations.some((allocation) =>
    usesNeedsConfirmation(
      candidateById.get(allocation.candidateKey)?.eligibilityStatus,
    ),
  );
  if (needsOverride && !normalizedReason) {
    issues.push('选用了“需人工确认”的候选，请填写例外确认理由');
  }
  if (needsOverride && policy.needsConfirmationSelectionAllowed === false) {
    issues.push('当前冻结策略不允许选择“需人工确认”的候选');
  }
  const requiredReasonLength = policy.overrideReasonMinLength;
  if (
    needsOverride &&
    normalizedReason &&
    typeof requiredReasonLength === 'number' &&
    requiredReasonLength > 0 &&
    normalizedReason.length < requiredReasonLength
  ) {
    issues.push(`例外确认理由至少需要 ${requiredReasonLength} 个字符`);
  }
  if (normalizedReason.length > 2000) {
    issues.push('人工选择说明不能超过 2000 字');
  }
  if (allocations.length === 0) issues.push('至少选择一个允许分配的供应候选');

  return {
    allocations: issues.length > 0 ? undefined : allocations,
    issues,
    reason: normalizedReason || null,
  };
}
