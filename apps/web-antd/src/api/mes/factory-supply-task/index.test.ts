import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  getFactorySupplyTask,
  getFactorySupplyTaskPage,
  getFactoryTaskGeneration,
  materializeFactoryTaskGeneration,
  regenerateFactoryTaskGeneration,
  retryFactoryTaskGeneration,
  searchFactoryTaskAiModels,
  startFactoryTaskGeneration,
} from './index';

const requestMocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
}));
const aiMocks = vi.hoisted(() => ({ search: vi.fn() }));

vi.mock('#/api/request', () => ({ requestClient: requestMocks }));
vi.mock('#/api/fdmai', () => ({ searchFdmAiModels: aiMocks.search }));

function rawDetail() {
  return {
    batchNo: 'FSB-1',
    companyId: 1,
    contractOrderId: 2,
    contractOrderVersion: 3,
    createdByUserId: 4,
    customerId: 5,
    fulfillmentConstraints: {
      certificationRequirements: ['CE'],
      countryComplianceRequirements: [],
      customerComplianceRequirements: [],
      packagingRequirements: ['CARTON'],
    },
    generationModelId: 6,
    generationProposalId: 7,
    generationProposalVersion: 1,
    generationRunId: 8,
    id: 9,
    sourcePlanId: 10,
    sourcePlanVersion: 4,
    status: 'DRAFT',
    tasks: [
      {
        factoryId: 11,
        factoryVersion: 2,
        id: 12,
        lines: [
          {
            allocationEvidenceSourceRefId: 'ATP-SNAPSHOT-1',
            allocationEvidenceSourceSystem: 'WMS',
            allocationEvidenceStatus: 'VERIFIED',
            atpProductVersionToken: 'PRODUCT-V3',
            atpSourcePayloadHash: 'e'.repeat(64),
            atpSourceSequence: '90071992547409931234',
            atpUnitCode: 'PCS',
            capacityQuantity: '10',
            capacityUnit: 'PCS',
            confidence: 'HIGH',
            factoryCapabilityAuthorityHash: 'f'.repeat(64),
            factoryCapabilityDecisionCode: 'CAPABILITY_ELIGIBLE',
            factoryCapabilityId: 20,
            factoryCapabilitySnapshot: {
              authority: {
                authorityHash: 'f'.repeat(64),
                capabilityId: 20,
                directShipSupported: true,
                evidenceByUserId: 4,
                evidenceMode: 'HUMAN_CONFIRMED',
                evidenceNote: '现场复核',
                evidenceTime: '2026-08-31T10:00:00+08:00',
                evidenceValidUntil: '2026-09-30T23:59:59+08:00',
                productSkuId: 16,
                productVersionToken: 'PRODUCT-V3',
                status: 'ELIGIBLE',
                supportedCertificationRequirements: ['CE'],
                supportedCountryComplianceRequirements: [],
                supportedCustomerComplianceRequirements: [],
                supportedPackagingRequirements: ['CARTON'],
                validFrom: '2026-08-01',
                version: 3,
              },
              coverage: {
                certificationRequired: ['CE'],
                certificationSupported: ['CE'],
                countryComplianceRequired: [],
                countryComplianceSupported: [],
                customerComplianceRequired: [],
                customerComplianceSupported: [],
                directShipRequired: true,
                directShipSupported: true,
                packagingRequired: ['CARTON'],
                packagingSupported: ['CARTON'],
                passed: true,
              },
              decisionCode: 'CAPABILITY_ELIGIBLE',
            },
            factoryCapabilityStatus: 'ELIGIBLE',
            factoryCapabilityVersion: 3,
            id: 13,
            lineNo: 1,
            mesItemId: 14,
            productId: 15,
            quantity: '10',
            requiredDate: '2026-09-10',
            riskCodes: [],
            skuId: 16,
            sourceAllocationId: 17,
            sourceOrderLineId: 18,
            sourcePlanLineId: 19,
          },
        ],
        requiredDate: '2026-09-10',
        status: 'DRAFT',
        taskNo: 'FST-1',
        version: 1,
      },
    ],
    version: 1,
  };
}

function rawRun() {
  return {
    attempts: [],
    companyId: 1,
    currentAttemptNo: 1,
    generationType: 'DEMAND_TO_FACTORY_TASK',
    modelId: 2,
    proposal: {
      evidence: {
        authorityHash: 'a'.repeat(64),
        candidateLines: [
          {
            candidates: [
              {
                atpProductVersionToken: 'PRODUCT-V3',
                atpSourcePayloadHash: 'e'.repeat(64),
                atpSourceSequence: '90071992547409931234',
                atpUnit: 'PCS',
                factoryCapabilityAuthorityHash: 'f'.repeat(64),
                factoryCapabilityDecisionCode: 'CAPABILITY_ELIGIBLE',
                factoryCapabilityEvidence: {
                  authorityHash: 'f'.repeat(64),
                  capabilityId: 20,
                  directShipSupported: true,
                  evidenceByUserId: 7,
                  evidenceMode: 'HUMAN_CONFIRMED',
                  evidenceNote: '现场复核',
                  evidenceTime: '2026-08-31T10:00:00+08:00',
                  evidenceValidUntil: '2026-09-30T23:59:59+08:00',
                  productSkuId: 16,
                  productVersionToken: 'PRODUCT-V3',
                  status: 'ELIGIBLE',
                  supportedCertificationRequirements: ['CE'],
                  supportedCountryComplianceRequirements: ['CN'],
                  supportedCustomerComplianceRequirements: [],
                  supportedPackagingRequirements: ['CARTON'],
                  validFrom: '2026-08-01',
                  version: 3,
                },
                factoryCapabilityStatus: 'ELIGIBLE',
                factoryCapabilityVersion: 3,
                factoryId: 3,
                factoryToken: 'FACTORY-001',
                factoryVersion: 1,
                selectable: true,
              },
              {
                factoryCapabilityDecisionCode: 'CAPABILITY_UNKNOWN',
                factoryCapabilityEvidence: {
                  reason: 'MISSING_AUTHORITY',
                  status: 'UNKNOWN',
                },
                factoryCapabilityStatus: 'UNKNOWN',
                factoryCapabilityVersion: null,
                factoryId: 30,
                factoryToken: 'FACTORY-002',
                factoryVersion: 1,
                selectable: false,
              },
            ],
            lineToken: 'LINE-001',
            capacityQuantity: '10',
            capacityUnit: 'PCS',
            mesItemId: 4,
            quantity: '10',
            requiredDate: '2026-09-10',
            sourcePlanLineId: 5,
          },
        ],
      },
      hash: 'b'.repeat(64),
      id: 6,
      missingData: [],
      normalizedJson: '{}',
      schemaVersion: '1.0',
      source: 'AI',
      version: 1,
      warnings: [],
    },
    requestedBy: 7,
    rules: [],
    runId: 8,
    source: { id: 9, type: 'FULFILLMENT_PLAN', version: '4' },
    sourceSnapshotHash: 'c'.repeat(64),
    status: 'READY',
    target: null,
    targetDocumentType: 'FACTORY_SUPPLY_BATCH',
    version: 3,
  };
}

describe('mES factory supply task API contract', () => {
  beforeEach(() => vi.clearAllMocks());

  it('normalizes every business Long ID to string in page and detail', async () => {
    requestMocks.get
      .mockResolvedValueOnce({
        list: [
          {
            ...rawDetail(),
            lineCount: 1,
            quantitySummary: [
              { quantity: '120', unit: 'PCS' },
              { quantity: '8', unit: 'CTN' },
            ],
            taskCount: 1,
          },
        ],
        total: 1,
      })
      .mockResolvedValueOnce(rawDetail());

    const page = await getFactorySupplyTaskPage({ pageNo: 1, pageSize: 20 });
    const detail = await getFactorySupplyTask('9');

    expect(requestMocks.get).toHaveBeenNthCalledWith(
      1,
      '/mes/factory-supply-task/page',
      { params: { pageNo: 1, pageSize: 20 } },
    );
    expect(requestMocks.get).toHaveBeenNthCalledWith(
      2,
      '/mes/factory-supply-task/get',
      { params: { id: '9' } },
    );
    expect(page.list[0]).toMatchObject({
      companyId: '1',
      contractOrderId: '2',
      id: '9',
      sourcePlanId: '10',
    });
    expect(page.list[0]?.quantitySummary).toEqual([
      { quantity: '120', unit: 'PCS' },
      { quantity: '8', unit: 'CTN' },
    ]);
    expect(detail.tasks[0]?.lines[0]).toMatchObject({
      atpProductVersionToken: 'PRODUCT-V3',
      atpSourceSequence: '90071992547409931234',
      capacityQuantity: '10',
      factoryCapabilityDecisionCode: 'CAPABILITY_ELIGIBLE',
      factoryCapabilityId: '20',
      factoryCapabilityStatus: 'ELIGIBLE',
      factoryCapabilityVersion: 3,
      id: '13',
      mesItemId: '14',
      productId: '15',
      skuId: '16',
      sourcePlanLineId: '19',
    });
    expect(
      detail.tasks[0]?.lines[0]?.factoryCapabilitySnapshot?.authority,
    ).toMatchObject({
      capabilityId: '20',
      evidenceByUserId: '4',
      productSkuId: '16',
    });
  });

  it('uses the exact route-scoped model and generic document-generation endpoints', async () => {
    aiMocks.search.mockResolvedValue([
      {
        capabilities: ['CHAT', 'STRUCTURED_OUTPUT'],
        code: 'gpt',
        enabled: true,
        id: 21,
        name: 'GPT',
      },
    ]);
    requestMocks.post.mockResolvedValue({
      created: true,
      runId: 22,
      status: 'QUEUED',
      version: 0,
    });
    requestMocks.get.mockResolvedValue(rawRun());

    const models = await searchFactoryTaskAiModels();
    const ticket = await startFactoryTaskGeneration({
      generationType: 'DEMAND_TO_FACTORY_TASK',
      idempotencyKey: 'factory-start-1',
      modelId: '21',
      options: { instruction: '优先稳定产能' },
      source: { id: '9', type: 'FULFILLMENT_PLAN', version: '4' },
    });
    const run = await getFactoryTaskGeneration('22');
    await retryFactoryTaskGeneration('22', 3);
    await regenerateFactoryTaskGeneration('22', {
      expectedVersion: 4,
      idempotencyKey: 'factory-regenerate-1',
      modelId: '21',
      options: {},
    });

    expect(aiMocks.search).toHaveBeenCalledWith({
      modality: 'TEXT',
      requiredCapabilities: ['CHAT', 'STRUCTURED_OUTPUT'],
      routeKey: 'mes.demand-to-factory-task',
    });
    expect(requestMocks.post).toHaveBeenNthCalledWith(
      1,
      '/fdm-document-generation/runs',
      expect.objectContaining({ generationType: 'DEMAND_TO_FACTORY_TASK' }),
    );
    expect(requestMocks.get).toHaveBeenCalledWith(
      '/fdm-document-generation/runs/22',
    );
    expect(requestMocks.post).toHaveBeenNthCalledWith(
      2,
      '/fdm-document-generation/runs/22/retry',
      { expectedVersion: 3 },
    );
    expect(requestMocks.post).toHaveBeenNthCalledWith(
      3,
      '/fdm-document-generation/runs/22/regenerate',
      expect.objectContaining({ expectedVersion: 4 }),
    );
    expect(models[0]?.id).toBe('21');
    expect(ticket.runId).toBe('22');
    expect(run.proposal?.evidence.candidateLines?.[0]).toMatchObject({
      mesItemId: '4',
      sourcePlanLineId: '5',
    });
    expect(
      run.proposal?.evidence.candidateLines?.[0]?.candidates[0]?.factoryId,
    ).toBe('3');
    expect(
      run.proposal?.evidence.candidateLines?.[0]?.candidates[0]
        ?.atpSourceSequence,
    ).toBe('90071992547409931234');
    expect(
      run.proposal?.evidence.candidateLines?.[0]?.candidates[0],
    ).toMatchObject({
      factoryCapabilityAuthorityHash: 'f'.repeat(64),
      factoryCapabilityDecisionCode: 'CAPABILITY_ELIGIBLE',
      factoryCapabilityStatus: 'ELIGIBLE',
      factoryCapabilityVersion: 3,
    });
    expect(
      run.proposal?.evidence.candidateLines?.[0]?.candidates[0]
        ?.factoryCapabilityEvidence,
    ).toMatchObject({
      capabilityId: '20',
      evidenceByUserId: '7',
      productSkuId: '16',
    });
    expect(
      run.proposal?.evidence.candidateLines?.[0]?.candidates[1],
    ).toMatchObject({
      factoryCapabilityEvidence: {
        reason: 'MISSING_AUTHORITY',
        status: 'UNKNOWN',
      },
      factoryId: '30',
    });
  });

  it('posts only editable intent when materializing a READY proposal', async () => {
    requestMocks.post.mockResolvedValue({ batch: rawDetail(), created: true });
    const result = await materializeFactoryTaskGeneration({
      expectedProposalVersion: 1,
      expectedRunVersion: 3,
      idempotencyKey: 'factory-materialize-1',
      overrideReason: '人工核对后调整了提案',
      runId: '22',
      selections: [
        {
          confidence: 'HIGH',
          factoryToken: 'FACTORY-001',
          lineToken: 'LINE-001',
          reason: 'ATP 充足',
          riskCodes: [],
        },
      ],
      sourcePlanId: '9',
      sourcePlanVersion: 4,
      summary: '人工复核后确认',
    });

    expect(requestMocks.post).toHaveBeenCalledWith(
      '/mes/factory-supply-task/materialize-from-generation',
      expect.objectContaining({
        overrideReason: '人工核对后调整了提案',
      }),
    );
    expect(requestMocks.post.mock.calls[0]?.[1]).not.toHaveProperty(
      'authorityHash',
    );
    expect(result.batch.id).toBe('9');
  });

  it('rejects unsafe numeric identities instead of losing precision', async () => {
    requestMocks.get.mockResolvedValue({
      ...rawRun(),
      runId: Number.MAX_SAFE_INTEGER + 1,
    });
    await expect(getFactoryTaskGeneration('22')).rejects.toThrow(
      'generation.runId',
    );
  });

  it('rejects an unsafe Long nested inside candidate capability evidence', async () => {
    const value = rawRun();
    value.proposal.evidence.candidateLines[0]!.candidates[0]!.factoryCapabilityEvidence.capabilityId =
      Number.MAX_SAFE_INTEGER + 1;
    requestMocks.get.mockResolvedValue(value);

    await expect(getFactoryTaskGeneration('22')).rejects.toThrow(
      'generationCandidate.factoryCapabilityEvidence.capabilityId',
    );
  });
});
