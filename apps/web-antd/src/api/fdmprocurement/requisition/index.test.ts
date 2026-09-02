import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  bindProcurementRequisitionProductSku,
  cancelRequisitionGeneration,
  createRequisitionFromGeneration,
  getProcurementRequisition,
  getProcurementRequisitionApprovalState,
  getProcurementRequisitionList,
  getRequisitionGenerationJob,
  getRequisitionGenerationOptions,
  preValidateProcurementRequisition,
  regenerateRequisitionGeneration,
  retryRequisitionGeneration,
  startRequisitionGeneration,
  submitProcurementRequisition,
  updateProcurementRequisitionDraft,
  withdrawProcurementRequisition,
} from './index';

const requestMocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
}));

vi.mock('#/api/request', () => ({ requestClient: requestMocks }));

describe('fdmprocurement requisition API contract', () => {
  beforeEach(() => vi.clearAllMocks());

  it('reads company-scoped list, detail and approval state without number coercion', async () => {
    requestMocks.get
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce({
        companyId: 1,
        id: 101,
        items: [],
        ownerUserId: 164,
        requisitionNo: 'PR-101',
        sourceOrderId: 201,
        sourceOrderVersion: 1,
        sourcePlanId: 301,
        sourcePlanVersion: 2,
        sourceSnapshotHash: 'a'.repeat(64),
        status: 'READY',
        traceability: {
          shipments: [
            {
              accessible: true,
              documentNo: 'WM-SHP-001',
              documentType: 'SHIPMENT',
              id: 501,
              matchedLineCount: 2,
              status: 'DRAFT',
              version: 1,
            },
          ],
          shipmentQueryAllowed: true,
          sourceContract: {
            accessible: true,
            documentNo: 'DD-201',
            documentType: 'CONTRACT_ORDER',
            id: 201,
            status: 'CONFIRMED',
            version: 1,
          },
          sourceFulfillmentPlan: {
            accessible: true,
            documentNo: 'WM-FUL-301',
            documentType: 'FULFILLMENT_PLAN',
            id: 301,
            status: 'CONFIRMED',
            version: 2,
          },
        },
        validationStatus: 'PASSED',
        version: 4,
      })
      .mockResolvedValueOnce({
        audits: [{ actorUserId: 164, operation: 'SUBMIT' }],
        currentSelectedSourcingAssessmentId: 401,
        currentSelectedSourcingInputHash: 'b'.repeat(64),
        requisitionId: 101,
        status: 'READY',
        submittedBy: 164,
        version: 4,
      });

    await getProcurementRequisitionList('9223372036854775801');
    const detail = await getProcurementRequisition('9223372036854775802');
    const state = await getProcurementRequisitionApprovalState(
      '9223372036854775802',
    );

    expect(requestMocks.get).toHaveBeenNthCalledWith(
      1,
      '/fdmprocurement/requisition/list',
      { params: { companyId: '9223372036854775801' } },
    );
    expect(requestMocks.get).toHaveBeenNthCalledWith(
      2,
      '/fdmprocurement/requisition/get',
      { params: { id: '9223372036854775802' } },
    );
    expect(requestMocks.get).toHaveBeenNthCalledWith(
      3,
      '/fdmprocurement/requisition/approval-state',
      { params: { id: '9223372036854775802' } },
    );
    expect(detail.id).toBe('101');
    expect(detail.companyId).toBe('1');
    expect(detail.ownerUserId).toBe('164');
    expect(detail.traceability?.shipmentQueryAllowed).toBe(true);
    expect(detail.traceability?.sourceContract?.id).toBe('201');
    expect(detail.traceability?.sourceFulfillmentPlan?.id).toBe('301');
    expect(detail.traceability?.shipments?.[0]?.id).toBe('501');
    expect(state.currentSelectedSourcingAssessmentId).toBe('401');
    expect(state.submittedBy).toBe('164');
    expect(state.audits[0]?.actorUserId).toBe('164');
  });

  it('keeps data-scope redacted traceability references unavailable', async () => {
    requestMocks.get.mockResolvedValueOnce({
      companyId: 1,
      id: 101,
      items: [],
      ownerUserId: 164,
      requisitionNo: 'PR-101',
      sourceOrderId: 201,
      sourceOrderVersion: 1,
      sourcePlanId: 301,
      sourcePlanVersion: 2,
      sourceSnapshotHash: 'a'.repeat(64),
      status: 'READY',
      traceability: {
        shipmentQueryAllowed: false,
        shipments: [],
        sourceContract: {
          accessible: false,
          documentNo: null,
          documentType: 'CONTRACT_ORDER',
          id: null,
        },
        sourceFulfillmentPlan: {
          accessible: false,
          documentNo: null,
          documentType: 'FULFILLMENT_PLAN',
          id: null,
        },
      },
      validationStatus: 'PASSED',
      version: 4,
    });

    const detail = await getProcurementRequisition('101');

    expect(detail.traceability?.sourceContract).toEqual(
      expect.objectContaining({ accessible: false, id: null }),
    );
    expect(detail.traceability?.sourceFulfillmentPlan).toEqual(
      expect.objectContaining({ accessible: false, id: null }),
    );
    expect(detail.traceability?.shipmentQueryAllowed).toBe(false);
  });

  it('uses optimistic versions for pre-validation and lifecycle commands', async () => {
    requestMocks.post
      .mockResolvedValueOnce({
        checkedVersion: 3,
        issues: [],
        requisitionId: 101,
        validationStatus: 'PASSED',
      })
      .mockResolvedValueOnce({
        id: 101,
        idempotent: false,
        status: 'SUBMITTED',
        version: 5,
      })
      .mockResolvedValueOnce({
        id: 101,
        idempotent: false,
        status: 'CANCELLED',
        version: 6,
      });

    await preValidateProcurementRequisition({ expectedVersion: 3, id: '101' });
    await submitProcurementRequisition({
      comment: '确认提交',
      expectedAssessmentInputHash: 'a'.repeat(64),
      expectedVersion: 4,
      id: '101',
      idempotencyKey: 'submit-1',
      selectedAssessmentId: '201',
    });
    await withdrawProcurementRequisition({
      expectedVersion: 5,
      id: '101',
      idempotencyKey: 'withdraw-1',
      reason: '报价需要更新',
    });

    expect(requestMocks.post).toHaveBeenNthCalledWith(
      1,
      '/fdmprocurement/requisition/pre-validate',
      { expectedVersion: 3, id: '101' },
    );
    expect(requestMocks.post).toHaveBeenNthCalledWith(
      2,
      '/fdmprocurement/requisition/submit',
      {
        comment: '确认提交',
        expectedAssessmentInputHash: 'a'.repeat(64),
        expectedVersion: 4,
        id: '101',
        idempotencyKey: 'submit-1',
        selectedAssessmentId: '201',
      },
    );
    expect(requestMocks.post).toHaveBeenNthCalledWith(
      3,
      '/fdmprocurement/requisition/withdraw',
      {
        expectedVersion: 5,
        id: '101',
        idempotencyKey: 'withdraw-1',
        reason: '报价需要更新',
      },
    );
  });

  it('binds an unmapped line through the dedicated CAS and idempotent command', async () => {
    requestMocks.post.mockResolvedValueOnce({
      companyId: 1,
      id: 101,
      items: [
        {
          id: 201,
          lineNo: 1,
          productId: 301,
          productMappingStatus: 'MAPPED',
          productName: '产品',
          productVersionToken: 'P1',
          requestedQty: '1',
          riskCodes: [],
          skuId: 401,
          sourcePlanLineId: 501,
          version: 3,
        },
      ],
      ownerUserId: 164,
      requisitionNo: 'PR-101',
      sourceOrderId: 601,
      sourceOrderVersion: 1,
      sourcePlanId: 701,
      sourcePlanVersion: 2,
      sourceSnapshotHash: 'a'.repeat(64),
      status: 'DRAFT',
      validationStatus: 'NOT_CHECKED',
      version: 5,
    });
    const result = await bindProcurementRequisitionProductSku({
      expectedVersion: 4,
      id: '101',
      idempotencyKey: 'bind-product-101-201',
      itemExpectedVersion: 2,
      itemId: '201',
      productId: '301',
      productVersionToken: 'P1',
      reason: '人工核对产品中心 SKU',
      skuId: '401',
    });
    expect(requestMocks.post).toHaveBeenCalledWith(
      '/fdmprocurement/requisition/bind-product-sku',
      {
        expectedVersion: 4,
        id: '101',
        idempotencyKey: 'bind-product-101-201',
        itemExpectedVersion: 2,
        itemId: '201',
        productId: '301',
        productVersionToken: 'P1',
        reason: '人工核对产品中心 SKU',
        skuId: '401',
      },
    );
    expect(result.id).toBe('101');
    expect(result.items[0]).toMatchObject({
      id: '201',
      productId: '301',
      skuId: '401',
    });
  });

  it('uses the requisition generation facade and normalizes every Long ID', async () => {
    requestMocks.get
      .mockResolvedValueOnce({
        generationType: 'FULFILLMENT_TO_REQUISITION',
        missingData: [],
        models: [
          { capabilities: ['STRUCTURED_OUTPUT'], code: 'm', id: 8, name: 'M' },
        ],
        routeKey: 'route',
        source: {
          companyId: 1,
          fulfillmentPlanId: 101,
          lines: [
            {
              externalPurchaseQuantity: '10',
              productId: 201,
              productName: '产品',
              skuId: 301,
              sourceContractLineId: 401,
              sourcePlanLineId: 501,
              unit: 'PCS',
            },
          ],
          orderId: 601,
          sourceSnapshotHash: 'a'.repeat(64),
          status: 'CONFIRMED',
          version: 2,
        },
        sourceSnapshotHash: 'a'.repeat(64),
      })
      .mockResolvedValueOnce({
        generationType: 'FULFILLMENT_TO_REQUISITION',
        id: 701,
        missingData: [],
        modelId: 8,
        proposal: {
          lineSuggestions: [
            { note: '核对', riskCodes: [], sourcePlanLineId: 501 },
          ],
          summary: '摘要',
        },
        rules: [],
        sourceId: 101,
        sourceSnapshotHash: 'a'.repeat(64),
        sourceType: 'FULFILLMENT_PLAN',
        sourceVersion: 2,
        status: 'READY',
        version: 3,
        warnings: [],
      });

    const options = await getRequisitionGenerationOptions('101', 2);
    const job = await getRequisitionGenerationJob('701');

    expect(requestMocks.get).toHaveBeenNthCalledWith(
      1,
      '/fdmprocurement/requisition/generation-options',
      { params: { expectedPlanVersion: 2, fulfillmentPlanId: '101' } },
    );
    expect(requestMocks.get).toHaveBeenNthCalledWith(
      2,
      '/fdmprocurement/requisition/generation/job',
      { params: { id: '701' } },
    );
    expect(options.source.fulfillmentPlanId).toBe('101');
    expect(options.source.lines[0]?.sourcePlanLineId).toBe('501');
    expect(options.source.lines[0]?.productId).toBe('201');
    expect(options.models[0]?.id).toBe('8');
    expect(job.id).toBe('701');
    expect(job.sourceId).toBe('101');
    expect(job.proposal?.lineSuggestions[0]?.sourcePlanLineId).toBe('501');
  });

  it('sends start, retry, regenerate and cancel with numeric run versions', async () => {
    const response = {
      generationType: 'FULFILLMENT_TO_REQUISITION',
      id: 701,
      missingData: [],
      modelId: 8,
      rules: [],
      sourceId: 101,
      sourceSnapshotHash: 'a'.repeat(64),
      sourceType: 'FULFILLMENT_PLAN',
      sourceVersion: 2,
      status: 'QUEUED',
      version: 3,
      warnings: [],
    };
    requestMocks.post.mockResolvedValue(response);

    await startRequisitionGeneration({
      expectedPlanVersion: 2,
      fulfillmentPlanId: '101',
      idempotencyKey: 'start-1',
      instruction: '关注交期',
      modelId: '8',
    });
    await retryRequisitionGeneration({ expectedVersion: 3, id: '701' });
    await regenerateRequisitionGeneration({
      expectedVersion: 4,
      id: '701',
      idempotencyKey: 'regenerate-1',
      modelId: '8',
    });
    await cancelRequisitionGeneration({ expectedVersion: 5, id: '701' });

    expect(requestMocks.post).toHaveBeenNthCalledWith(
      1,
      '/fdmprocurement/requisition/generation/start',
      {
        expectedPlanVersion: 2,
        fulfillmentPlanId: '101',
        idempotencyKey: 'start-1',
        instruction: '关注交期',
        modelId: '8',
      },
    );
    expect(requestMocks.post).toHaveBeenNthCalledWith(
      2,
      '/fdmprocurement/requisition/generation/retry',
      { expectedVersion: 3, id: '701' },
    );
    expect(requestMocks.post).toHaveBeenNthCalledWith(
      3,
      '/fdmprocurement/requisition/generation/regenerate',
      {
        expectedVersion: 4,
        id: '701',
        idempotencyKey: 'regenerate-1',
        modelId: '8',
      },
    );
    expect(requestMocks.post).toHaveBeenNthCalledWith(
      4,
      '/fdmprocurement/requisition/generation/cancel',
      { expectedVersion: 5, id: '701' },
    );
  });

  it('separates materialize and update while carrying all CAS versions', async () => {
    requestMocks.post.mockResolvedValueOnce({
      companyId: 1,
      created: true,
      id: 101,
      requisitionNo: 'PR-101',
      sourcePlanId: 201,
      sourcePlanVersion: 2,
      status: 'DRAFT',
      version: 0,
    });
    requestMocks.put.mockResolvedValueOnce({
      companyId: 1,
      id: 101,
      items: [],
      ownerUserId: 164,
      requisitionNo: 'PR-101',
      sourceOrderId: 301,
      sourceOrderVersion: 1,
      sourcePlanId: 201,
      sourcePlanVersion: 2,
      sourceSnapshotHash: 'a'.repeat(64),
      status: 'DRAFT',
      validationStatus: 'NOT_CHECKED',
      version: 4,
    });
    const draftItem = {
      procurementNote: '',
      productId: '401',
      productVersionToken: 'v1',
      purchaseUnit: 'PCS',
      requestedQty: '10',
      sourceContractLineId: '501',
      sourcePlanLineId: '601',
      unitConversionFactor: '1',
    };

    await createRequisitionFromGeneration({
      draft: { items: [draftItem], remark: '' },
      expectedPlanVersion: 2,
      expectedRunVersion: 3,
      fulfillmentPlanId: '201',
      generationRunId: '701',
      idempotencyKey: 'materialize-1',
      proposalVersion: 1,
    });
    await updateProcurementRequisitionDraft({
      editReason: '人工核对交期',
      expectedVersion: 3,
      id: '101',
      items: [{ ...draftItem, id: '801', itemExpectedVersion: 2 }],
      remark: '',
    });

    expect(requestMocks.post).toHaveBeenCalledWith(
      '/fdmprocurement/requisition/create-from-generation',
      expect.objectContaining({
        draft: { items: [draftItem], remark: '' },
        expectedRunVersion: 3,
      }),
    );
    expect(requestMocks.put).toHaveBeenCalledWith(
      '/fdmprocurement/requisition/update',
      expect.objectContaining({
        editReason: '人工核对交期',
        expectedVersion: 3,
        items: [expect.objectContaining({ id: '801', itemExpectedVersion: 2 })],
        remark: '',
      }),
    );
  });
});
