import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  evaluateProcurementSourcing,
  getProcurementSourcingAssessment,
  selectProcurementSourcing,
} from './index';

const requestMocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
}));

vi.mock('#/api/request', () => ({ requestClient: requestMocks }));

describe('fdmprocurement sourcing API contract', () => {
  beforeEach(() => vi.clearAllMocks());

  it('evaluates, reads and human-selects through domain endpoints', async () => {
    const rawAssessment = {
      allocations: [
        {
          allocatedQty: '10',
          allocationRole: 'RECOMMENDED',
          candidateId: 501,
          id: 601,
          requisitionItemId: 201,
          selectedBy: 164,
        },
      ],
      candidates: [
        {
          eligibilityStatus: 'ELIGIBLE',
          eliminationCodes: [],
          id: 501,
          performanceSnapshotId: 801,
          requisitionItemId: 201,
          supplierId: 301,
          supplierProductId: 401,
          totalScore: null,
        },
      ],
      companyId: 1,
      comparableCostComplete: true,
      eligibleCandidateCount: 1,
      evaluatedBy: 164,
      id: 701,
      inputHash: 'a'.repeat(64),
      policyId: 901,
      policyVersion: 3,
      requisitionId: 101,
      requisitionVersion: 7,
      ruleVersion: 'v1',
      status: 'READY',
    };
    requestMocks.post.mockResolvedValueOnce(rawAssessment);
    requestMocks.get.mockResolvedValueOnce(rawAssessment);
    requestMocks.post.mockResolvedValueOnce(rawAssessment);

    const evaluated = await evaluateProcurementSourcing({
      expectedRequisitionVersion: 7,
      requisitionId: '9007199254740993',
    });
    await getProcurementSourcingAssessment('9007199254740995');
    await selectProcurementSourcing({
      allocations: [{ candidateId: '9007199254740997', quantity: '12.500000' }],
      assessmentId: '9007199254740995',
      reason: '满足硬规则并保留交期余量',
    });

    expect(requestMocks.post).toHaveBeenNthCalledWith(
      1,
      '/fdmprocurement/sourcing/evaluate',
      {
        expectedRequisitionVersion: 7,
        requisitionId: '9007199254740993',
      },
    );
    expect(requestMocks.get).toHaveBeenCalledWith(
      '/fdmprocurement/sourcing/get',
      { params: { id: '9007199254740995' } },
    );
    expect(requestMocks.post).toHaveBeenNthCalledWith(
      2,
      '/fdmprocurement/sourcing/select',
      {
        allocations: [
          { candidateId: '9007199254740997', quantity: '12.500000' },
        ],
        assessmentId: '9007199254740995',
        reason: '满足硬规则并保留交期余量',
      },
    );
    expect(evaluated.id).toBe('701');
    expect(evaluated.companyId).toBe('1');
    expect(evaluated.candidates[0]?.id).toBe('501');
    expect(evaluated.candidates[0]?.performanceSnapshotId).toBe('801');
    expect(evaluated.candidates[0]?.totalScore).toBeNull();
    expect(evaluated.allocations[0]?.candidateId).toBe('501');
    expect(evaluated.allocations[0]?.selectedBy).toBe('164');
    expect(evaluated.policyId).toBe('901');
  });
});
