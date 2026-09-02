import { beforeEach, describe, expect, it, vi } from 'vitest';

import generationContract from './fixtures/generation-contract.json';
import {
  cancelSourcingGeneration,
  getSourcingGenerationJob,
  getSourcingGenerationOptions,
  materializeSourcingGeneration,
  regenerateSourcingGeneration,
  retrySourcingGeneration,
  startSourcingGeneration,
} from './generation';

const requestMocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
}));

vi.mock('#/api/request', () => ({ requestClient: requestMocks }));

function rawFacts() {
  return {
    blockers: [],
    candidateCounts: {
      eligible: 1,
      ineligible: 0,
      needsConfirmation: 0,
      unknown: 0,
    },
    candidates: [
      {
        candidateToken: 'CANDIDATE-001-001',
        eliminationCodes: [],
        eligibilityStatus: 'ELIGIBLE',
        evidenceCodes: ['PERFORMANCE_EVIDENCE_COMPLETE'],
        lineToken: 'LINE-001',
        performanceSnapshotId: 801,
        requisitionItemId: 201,
        supplierId: 301,
        supplierProductId: 401,
        totalScore: null,
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
        objectiveRank: 1,
        planHash: 'c'.repeat(64),
        planToken: 'PLAN-001',
        riskCodes: ['QUANTITY_CONSERVED'],
      },
    ],
    fullCandidateSetHash: 'b'.repeat(64),
    inputHash: 'd'.repeat(64),
    missingData: [],
    policy: {
      hash: 'e'.repeat(64),
      id: 901,
      trustedRateProviders: ['PBOC'],
      version: 3,
    },
    source: {
      companyId: 1,
      lines: [
        {
          lineNo: 1,
          itemVersion: 2,
          lineHash: 'f'.repeat(64),
          lineToken: 'LINE-001',
          productId: 601,
          productName: '产品',
          purchaseUnit: 'PCS',
          requestedQty: '10',
          requiredBaseQty: '10',
          requisitionItemId: 201,
          skuId: 701,
          unitConversionFactor: '1',
        },
      ],
      requisitionId: 101,
      requisitionNo: 'PR-101',
      requirementSetHash: 'f'.repeat(64),
      status: 'READY',
      validationStatus: 'PASSED',
      version: 4,
    },
    warnings: ['COMPARABLE_COST_INCOMPLETE'],
  };
}

function rawOptions() {
  return {
    existingAssessment: {
      id: 1001,
      inputHash: 'd'.repeat(64),
      status: 'READY',
    },
    facts: rawFacts(),
    generationType: 'REQUISITION_TO_SOURCING_PLAN',
    models: [
      {
        capabilities: ['STRUCTURED_OUTPUT'],
        code: 'model',
        enabled: true,
        id: 11,
        name: '模型',
      },
    ],
    routeKey: 'fdmprocurement.requisition-to-sourcing-plan',
    sourceSnapshotHash: 'a'.repeat(64),
  };
}

function rawJob() {
  return {
    facts: rawFacts(),
    generationType: 'REQUISITION_TO_SOURCING_PLAN',
    id: 922,
    invocationId: 'provider-invocation-923',
    missingData: [],
    modelId: 11,
    proposal: {
      alternativePlanTokens: [],
      lineExplanations: [],
      planReason: '交期证据完整',
      recommendedPlanToken: 'PLAN-001',
      summary: '建议采用方案一',
    },
    proposalVersion: 2,
    rules: [],
    sourceId: 101,
    sourceSnapshotHash: 'a'.repeat(64),
    sourceType: 'PROCUREMENT_REQUISITION',
    sourceVersion: 4,
    status: 'READY',
    version: 8,
    warnings: [],
  };
}

describe('sourcing AI generation API contract', () => {
  beforeEach(() => vi.clearAllMocks());

  it('parses the exact backend JSON fixture without inventing a prepared candidate id', async () => {
    requestMocks.get
      .mockResolvedValueOnce(generationContract.options)
      .mockResolvedValueOnce(generationContract.job);

    const options = await getSourcingGenerationOptions(
      '9223372036854775806',
      4,
    );
    const queuedJob = await getSourcingGenerationJob('9223372036854775794');

    expect(options.models[0]).toMatchObject({ enabled: true });
    expect(options.facts.candidates[0]).toMatchObject({
      candidateToken: 'CANDIDATE-001-001',
      performanceSnapshotId: '9223372036854775796',
      rateRetrievedAt: 1_788_057_600_000,
      requisitionItemId: '9223372036854775805',
      supplierId: '9223372036854775801',
      supplierProductId: '9223372036854775799',
    });
    expect(options.facts.candidates[0]).not.toHaveProperty('id');
    expect(options.facts.feasiblePlans[0]?.allocations[0]).toEqual({
      allocatedBaseQty: '1000.00000000',
      allocationRole: 'RECOMMENDED',
      candidateToken: 'CANDIDATE-001-001',
      lineToken: 'LINE-001',
      quantity: '10.00000000',
    });
    expect(queuedJob).toMatchObject({
      facts: null,
      invocationId: 'provider-invocation-01HXYZ',
      requestedAt: 1_788_057_600_000,
      sourceStale: false,
      sourceVersion: 4,
      status: 'QUEUED',
      traceId: 'trace-01HXYZ',
    });
  });

  it('loads route-scoped options and keeps every Long ID as string', async () => {
    requestMocks.get.mockResolvedValueOnce(rawOptions());
    const result = await getSourcingGenerationOptions('9223372036854775806', 4);

    expect(requestMocks.get).toHaveBeenCalledWith(
      '/fdmprocurement/sourcing/generation-options',
      {
        params: {
          expectedRequisitionVersion: 4,
          requisitionId: '9223372036854775806',
        },
      },
    );
    expect(result.facts.source.requisitionId).toBe('101');
    expect(result.facts.source.companyId).toBe('1');
    expect(result.facts.source.lines[0]?.requisitionItemId).toBe('201');
    expect(result.facts.source.lines[0]?.productId).toBe('601');
    expect(result.models[0]?.id).toBe('11');
    expect(result.facts.policy.id).toBe('901');
    expect(result.facts.candidates[0]?.performanceSnapshotId).toBe('801');
    expect(result.facts.candidates[0]?.supplierId).toBe('301');
    expect(result.facts.candidates[0]?.totalScore).toBeNull();
    expect(result.existingAssessment?.id).toBe('1001');
  });

  it('uses only the documented start/job/retry/regenerate/cancel endpoints', async () => {
    requestMocks.post.mockResolvedValue(rawJob());
    requestMocks.get.mockResolvedValue(rawJob());

    await startSourcingGeneration({
      expectedRequisitionVersion: 4,
      idempotencyKey: 'start-1',
      instruction: '优先交期证据',
      modelId: '11',
      requisitionId: '101',
    });
    const job = await getSourcingGenerationJob('922');
    await retrySourcingGeneration({ expectedVersion: 8, id: '922' });
    await regenerateSourcingGeneration({
      expectedVersion: 9,
      id: '922',
      idempotencyKey: 'regenerate-1',
      modelId: '11',
    });
    await cancelSourcingGeneration({ expectedVersion: 10, id: '922' });

    expect(requestMocks.post).toHaveBeenNthCalledWith(
      1,
      '/fdmprocurement/sourcing/generation/start',
      expect.objectContaining({ requisitionId: '101' }),
    );
    expect(requestMocks.get).toHaveBeenCalledWith(
      '/fdmprocurement/sourcing/generation/job',
      { params: { id: '922' } },
    );
    expect(requestMocks.post).toHaveBeenNthCalledWith(
      2,
      '/fdmprocurement/sourcing/generation/retry',
      { expectedVersion: 8, id: '922' },
    );
    expect(requestMocks.post).toHaveBeenNthCalledWith(
      3,
      '/fdmprocurement/sourcing/generation/regenerate',
      expect.objectContaining({ expectedVersion: 9, id: '922' }),
    );
    expect(requestMocks.post).toHaveBeenNthCalledWith(
      4,
      '/fdmprocurement/sourcing/generation/cancel',
      { expectedVersion: 10, id: '922' },
    );
    expect(job.id).toBe('922');
    expect(job.invocationId).toBe('provider-invocation-923');
    expect(job.sourceId).toBe('101');
    expect(job.facts?.candidates[0]?.supplierId).toBe('301');
  });

  it('materializes intent separately without posting authority facts', async () => {
    requestMocks.post.mockResolvedValueOnce({
      assessment: {
        allocations: [],
        candidates: [],
        companyId: 1,
        comparableCostComplete: false,
        eligibleCandidateCount: 1,
        id: 1001,
        inputHash: 'd'.repeat(64),
        requisitionId: 101,
        requisitionVersion: 4,
        ruleVersion: 'v1',
        status: 'SELECTED',
      },
      created: true,
    });

    const result = await materializeSourcingGeneration({
      allocations: [{ candidateToken: 'CANDIDATE-001-001', quantity: '10' }],
      expectedRequisitionVersion: 4,
      expectedRunVersion: 8,
      generationRunId: '922',
      idempotencyKey: 'materialize-1',
      proposalVersion: 2,
      reason: '人工核对证据后确认',
      requisitionId: '101',
      selectedPlanToken: null,
      selectionMode: 'CUSTOM',
    });

    expect(requestMocks.post).toHaveBeenCalledWith(
      '/fdmprocurement/sourcing/materialize-from-generation',
      expect.objectContaining({
        allocations: [{ candidateToken: 'CANDIDATE-001-001', quantity: '10' }],
        selectionMode: 'CUSTOM',
      }),
    );
    expect(result.assessment.id).toBe('1001');
    expect(result.assessment.requisitionId).toBe('101');
  });
});
