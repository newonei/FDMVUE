import type { SourcingGenerationSelectionDraft } from './generation-concurrency';

import type { FdmProcurementRequisitionApi } from '#/api/fdmprocurement/requisition';
import type { FdmProcurementSourcingGenerationApi } from '#/api/fdmprocurement/sourcing/generation';

import { describe, expect, it } from 'vitest';

import {
  selectionCandidateFactsFromPrepared,
  validateSourcingGenerationSelection,
} from './generation-selection';

function requisition() {
  return {
    companyId: '1',
    id: '101',
    items: [
      {
        id: '201',
        lineNo: 1,
        productName: '产品',
        requestedQty: '10',
        riskCodes: [],
        sourcePlanLineId: '301',
        unitConversionFactor: '1',
        version: 1,
      },
    ],
    ownerUserId: '164',
    requisitionNo: 'PR-101',
    sourceOrderId: '401',
    sourceOrderVersion: 1,
    sourcePlanId: '501',
    sourcePlanVersion: 1,
    sourceSnapshotHash: 'a',
    status: 'READY',
    validationStatus: 'PASSED',
    version: 4,
  } satisfies FdmProcurementRequisitionApi.Requisition;
}

function facts(status: string = 'ELIGIBLE') {
  return {
    blockers: [],
    candidateCounts: {
      eligible: status === 'ELIGIBLE' ? 1 : 0,
      ineligible: status === 'INELIGIBLE' ? 1 : 0,
      needsConfirmation: status === 'NEEDS_CONFIRMATION' ? 1 : 0,
      unknown: status === 'UNKNOWN' ? 1 : 0,
    },
    candidates: [
      {
        candidateToken: 'CANDIDATE-001-001',
        eliminationCodes: [],
        eligibilityStatus: status,
        evidenceCodes: [],
        lineToken: 'LINE-001',
        minOrderQty: '1',
        packageMultiple: '1',
        requisitionItemId: '201',
        supplierId: '701',
        supplierProductId: '801',
        unitConversionFactor: '1',
      },
    ],
    comparableCostComplete: false,
    evidenceDate: '2026-08-30',
    feasiblePlans: [
      {
        allocations: [
          {
            candidateToken: 'CANDIDATE-001-001',
            allocatedBaseQty: '10',
            allocationRole: 'RECOMMENDED',
            lineToken: 'LINE-001',
            quantity: '10',
          },
        ],
        planHash: 'plan',
        planToken: 'PLAN-001',
        riskCodes: [],
      },
    ],
    fullCandidateSetHash: 'candidate',
    inputHash: 'input',
    missingData: [],
    policy: {
      hash: 'policy',
      id: '901',
      needsConfirmationSelectionAllowed: true,
      overrideReasonMinLength: 6,
      trustedRateProviders: [],
      version: 2,
    },
    source: {
      companyId: '1',
      lines: [],
      requisitionId: '101',
      requisitionNo: 'PR-101',
      requirementSetHash: 'requirement',
      status: 'READY',
      validationStatus: 'PASSED',
      version: 4,
    },
    warnings: [],
  } satisfies FdmProcurementSourcingGenerationApi.PreparedFacts;
}

function draft(
  selectionMode: SourcingGenerationSelectionDraft['selectionMode'],
): SourcingGenerationSelectionDraft {
  return {
    bindingKey: '922:2',
    origin: 'HUMAN_EDIT',
    quantities: {},
    reason: '',
    selectedPlanToken: 'PLAN-001',
    selectionMode,
  };
}

const proposal = {
  alternativePlanTokens: [],
  lineExplanations: [],
  planReason: '证据完整',
  recommendedPlanToken: 'PLAN-001',
  summary: '推荐方案一',
};

describe('sourcing AI materialization selection', () => {
  it('indexes a prepared candidate by its authoritative token without inventing an id', () => {
    const candidate = facts().candidates[0]!;
    const selectionFacts = selectionCandidateFactsFromPrepared(candidate);

    expect(candidate).not.toHaveProperty('id');
    expect(selectionFacts).toMatchObject({
      candidateKey: 'CANDIDATE-001-001',
      requisitionItemId: '201',
      supplierId: '701',
    });
    expect(selectionFacts).not.toHaveProperty('id');
  });

  it('allows AI_PLAN and SERVER_PLAN only for current feasible plan tokens', () => {
    expect(
      validateSourcingGenerationSelection({
        draft: draft('AI_PLAN'),
        facts: facts(),
        proposal,
        requisition: requisition(),
      }).issues,
    ).toEqual([]);
    expect(
      validateSourcingGenerationSelection({
        draft: { ...draft('SERVER_PLAN'), selectedPlanToken: 'PLAN-404' },
        facts: facts(),
        proposal,
        requisition: requisition(),
      }).issues,
    ).toContain('请选择当前服务端返回的确定性可行 PLAN token');
  });

  it('converts CUSTOM candidate tokens to intent only after quantity conservation', () => {
    const result = validateSourcingGenerationSelection({
      draft: {
        ...draft('CUSTOM'),
        quantities: { 'CANDIDATE-001-001': '10' },
        selectedPlanToken: undefined,
      },
      facts: facts(),
      proposal,
      requisition: requisition(),
    });
    expect(result.issues).toEqual([]);
    expect(result.allocations).toEqual([
      { candidateToken: 'CANDIDATE-001-001', quantity: '10' },
    ]);
    expect(result).not.toHaveProperty('supplierId');
  });

  it('blocks UNKNOWN and requires the frozen override reason for NEEDS_CONFIRMATION', () => {
    const custom = {
      ...draft('CUSTOM'),
      quantities: { 'CANDIDATE-001-001': '10' },
      selectedPlanToken: undefined,
    };
    expect(
      validateSourcingGenerationSelection({
        draft: custom,
        facts: facts('UNKNOWN'),
        proposal,
        requisition: requisition(),
      }).issues.join(' '),
    ).toContain('禁止选用');
    expect(
      validateSourcingGenerationSelection({
        draft: custom,
        facts: facts('NEEDS_CONFIRMATION'),
        proposal,
        requisition: requisition(),
      }).issues,
    ).toContain('选用了“需人工确认”的候选，请填写例外确认理由');
    expect(
      validateSourcingGenerationSelection({
        draft: { ...custom, reason: '确认无误' },
        facts: facts('NEEDS_CONFIRMATION'),
        proposal,
        requisition: requisition(),
      }).issues,
    ).toContain('例外确认理由至少需要 6 个字符');
  });

  it('rejects unbalanced CUSTOM quantities', () => {
    expect(
      validateSourcingGenerationSelection({
        draft: {
          ...draft('CUSTOM'),
          quantities: { 'CANDIDATE-001-001': '9' },
          selectedPlanToken: undefined,
        },
        facts: facts(),
        proposal,
        requisition: requisition(),
      }).issues.join(' '),
    ).toContain('必须等于申请基础数量 10');
  });
});
