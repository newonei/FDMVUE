import type { SourcingGenerationSelectionDraft } from './generation-concurrency';
import type { SelectionCandidateFacts } from './selection-model';

import type { FdmProcurementRequisitionApi } from '#/api/fdmprocurement/requisition';
import type { FdmProcurementSourcingGenerationApi } from '#/api/fdmprocurement/sourcing/generation';

import { proposalTokenIssues, sourcingPlanByToken } from './generation-adapter';
import { buildSourcingSelectionIntent } from './selection-model';

export interface GenerationSelectionResult {
  allocations: FdmProcurementSourcingGenerationApi.MaterializeAllocation[];
  issues: string[];
  reason: null | string;
  selectedPlanToken: null | string;
  selectionMode: FdmProcurementSourcingGenerationApi.SelectionMode;
}

export function selectionCandidateFactsFromPrepared(
  candidate: FdmProcurementSourcingGenerationApi.Candidate,
): SelectionCandidateFacts {
  return {
    candidateKey: candidate.candidateToken,
    eligibilityStatus: candidate.eligibilityStatus,
    maxAllocatableQty: candidate.maxAllocatableQty,
    minOrderQty: candidate.minOrderQty,
    packageMultiple: candidate.packageMultiple,
    quoteTierMaxQty: candidate.quoteTierMaxQty,
    quoteTierMinQty: candidate.quoteTierMinQty,
    requisitionItemId: candidate.requisitionItemId,
    supplierId: candidate.supplierId,
    unitConversionFactor: candidate.unitConversionFactor,
  };
}

export function generationCandidateQuantitiesById(
  facts: FdmProcurementSourcingGenerationApi.PreparedFacts,
  quantitiesByToken: Record<string, string | undefined>,
) {
  const result: Record<string, string> = {};
  facts.candidates.forEach((candidate) => {
    const quantity = quantitiesByToken[candidate.candidateToken];
    if (quantity !== undefined) result[candidate.candidateToken] = quantity;
  });
  return result;
}

function commonIssues(
  facts: FdmProcurementSourcingGenerationApi.PreparedFacts,
  requisition: FdmProcurementRequisitionApi.Requisition,
) {
  const issues: string[] = [];
  if (String(requisition.id) !== String(facts.source.requisitionId)) {
    issues.push('当前采购申请与生成事实来源不一致');
  }
  if (requisition.version !== facts.source.version) {
    issues.push('采购申请版本已变化，请重新读取生成选项');
  }
  return issues;
}

export function validateSourcingGenerationSelection(options: {
  draft: SourcingGenerationSelectionDraft;
  facts: FdmProcurementSourcingGenerationApi.PreparedFacts;
  proposal?: FdmProcurementSourcingGenerationApi.Proposal | null;
  requisition: FdmProcurementRequisitionApi.Requisition;
}): GenerationSelectionResult {
  const { draft, facts, proposal, requisition } = options;
  const issues = commonIssues(facts, requisition);
  const reason = draft.reason.trim();
  if (reason.length > 2000) issues.push('人工确认说明不能超过 2000 字');

  if (draft.selectionMode === 'AI_PLAN') {
    if (proposal) {
      issues.push(...proposalTokenIssues(proposal, facts));
      if (draft.selectedPlanToken !== proposal.recommendedPlanToken) {
        issues.push('AI_PLAN 必须采用当前 Proposal 的推荐 PLAN token');
      }
    } else {
      issues.push('当前任务没有可采用的 AI Proposal');
    }
    return {
      allocations: [],
      issues,
      reason: reason || null,
      selectedPlanToken: draft.selectedPlanToken || null,
      selectionMode: draft.selectionMode,
    };
  }

  if (draft.selectionMode === 'SERVER_PLAN') {
    if (!sourcingPlanByToken(facts, draft.selectedPlanToken)) {
      issues.push('请选择当前服务端返回的确定性可行 PLAN token');
    }
    return {
      allocations: [],
      issues,
      reason: reason || null,
      selectedPlanToken: draft.selectedPlanToken || null,
      selectionMode: draft.selectionMode,
    };
  }

  const candidateByToken = new Map(
    facts.candidates.map((candidate) => [candidate.candidateToken, candidate]),
  );
  const quantitiesByCandidateId: Record<string, string> = {};
  Object.entries(draft.quantities).forEach(([candidateToken, quantity]) => {
    const candidate = candidateByToken.get(candidateToken);
    if (!candidate) {
      if (quantity.trim() && quantity !== '0') {
        issues.push(`候选 Token ${candidateToken} 不属于当前服务端快照`);
      }
      return;
    }
    quantitiesByCandidateId[candidate.candidateToken] = quantity;
  });
  const custom = buildSourcingSelectionIntent(
    facts.candidates.map(selectionCandidateFactsFromPrepared),
    {
      maximumSupplierConcentration: facts.policy.maximumSupplierConcentration,
      maximumSupplierCount: facts.policy.maximumSupplierCount,
      needsConfirmationSelectionAllowed:
        facts.policy.needsConfirmationSelectionAllowed,
      overrideReasonMinLength: facts.policy.overrideReasonMinLength,
    },
    requisition,
    quantitiesByCandidateId,
    reason,
  );
  issues.push(...custom.issues);
  const allocations = (custom.allocations || []).map((allocation) => ({
    candidateToken: allocation.candidateKey,
    quantity: allocation.quantity,
  }));
  return {
    allocations,
    issues,
    reason: reason || null,
    selectedPlanToken: null,
    selectionMode: draft.selectionMode,
  };
}
