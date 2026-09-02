import type { FdmProcurementSourcingGenerationApi } from '#/api/fdmprocurement/sourcing/generation';

import { describe, expect, it } from 'vitest';

import {
  adaptSourcingGenerationJob,
  adaptSourcingGenerationRules,
  proposalTokenIssues,
  sourcingPlanByToken,
} from './generation-adapter';

function facts() {
  return {
    blockers: [],
    candidateCounts: {
      eligible: 1,
      ineligible: 0,
      needsConfirmation: 0,
      unknown: 0,
    },
    candidates: [],
    comparableCostComplete: false,
    evidenceDate: '2026-08-30',
    feasiblePlans: [
      {
        allocations: [],
        planHash: 'hash',
        planToken: 'PLAN-001',
        riskCodes: [],
      },
    ],
    fullCandidateSetHash: 'a',
    inputHash: 'input',
    missingData: [],
    policy: {
      hash: 'policy',
      id: '9',
      trustedRateProviders: [],
      version: 1,
    },
    source: {
      companyId: '1',
      lines: [],
      requisitionId: '1',
      requisitionNo: 'PR-1',
      requirementSetHash: 'requirements',
      status: 'READY',
      validationStatus: 'PASSED',
      version: 2,
    },
    warnings: [],
  } satisfies FdmProcurementSourcingGenerationApi.PreparedFacts;
}

describe('sourcing generation adapter', () => {
  it('maps polling stages and preserves run CAS values', () => {
    const adapted = adaptSourcingGenerationJob({
      generationType: 'REQUISITION_TO_SOURCING_PLAN',
      id: '701',
      missingData: [],
      modelId: '11',
      rules: [],
      sourceId: '101',
      sourceSnapshotHash: 'hash',
      sourceType: 'PROCUREMENT_REQUISITION',
      sourceVersion: 4,
      status: 'CONTEXT_BUILDING',
      version: 8,
      warnings: [],
    });
    expect(adapted).toMatchObject({
      id: '701',
      sourceVersion: 4,
      stage: 'EVIDENCE',
      status: 'CONTEXT_BUILDING',
      version: 8,
    });
  });

  it('adapts controlled rules without hiding blockers', () => {
    expect(
      adaptSourcingGenerationRules([
        {
          message: '成本证据不完整',
          passed: false,
          ruleCode: 'COMPARABLE_COST_COMPLETE',
          severity: 'WARNING',
        },
        {
          message: '来源已变化',
          passed: false,
          ruleCode: 'SOURCE_REQUISITION_CURRENT',
          severity: 'BLOCKER',
        },
      ]),
    ).toEqual([
      expect.objectContaining({ severity: 'WARNING' }),
      expect.objectContaining({ severity: 'BLOCKER' }),
    ]);
  });

  it('accepts only server feasible PLAN tokens', () => {
    expect(sourcingPlanByToken(facts(), 'PLAN-001')?.planHash).toBe('hash');
    expect(sourcingPlanByToken(facts(), 'NO_AUTOMATIC_PLAN')).toBeUndefined();
    expect(
      proposalTokenIssues(
        {
          alternativePlanTokens: ['PLAN-404'],
          lineExplanations: [],
          planReason: '',
          recommendedPlanToken: 'PLAN-001',
          summary: '',
        },
        facts(),
      ),
    ).toHaveLength(1);
  });
});
