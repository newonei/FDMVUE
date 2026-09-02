import type { FdmWaimaoShipmentApi } from './index';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  cancelShipmentDraft,
  confirmShipment,
  createShipmentDraft,
  getShipment,
  getShipmentPage,
  getShipmentReadinessGenerationJob,
  getShipmentReadinessGenerationOptions,
  materializeShipmentReadinessGeneration,
  normalizeReadinessMaterializeResult,
  recoverShipmentWarehouseHandoff,
  regenerateShipmentReadinessGeneration,
  releaseShipmentStockReservation,
  reserveShipmentStock,
  startShipmentReadinessGeneration,
  updateShipmentDraft,
} from './index';
import { readinessGenerationJobFixture } from './readiness-job.fixture';

const requestMocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
}));

vi.mock('#/api/request', () => ({ requestClient: requestMocks }));

describe('fdmwaimao shipment API contract', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('keeps Java Long identifiers as strings at the browser boundary', async () => {
    const publicationSequence: FdmWaimaoShipmentApi.ReadinessWarehouseEvidence['sourceSequence'] =
      '9223372036854775800';
    await getShipmentPage({
      companyId: '9223372036854775801',
      pageNo: 1,
      pageSize: 20,
    });
    await getShipment('9223372036854775802');

    expect(requestMocks.get).toHaveBeenNthCalledWith(
      1,
      '/fdmwaimao/shipment/page',
      {
        params: {
          companyId: '9223372036854775801',
          pageNo: 1,
          pageSize: 20,
        },
      },
    );
    expect(requestMocks.get).toHaveBeenNthCalledWith(
      2,
      '/fdmwaimao/shipment/get',
      { params: { id: '9223372036854775802' } },
    );
    expect(publicationSequence).toBe('9223372036854775800');
  });

  it('creates only a shipment header shell without browser quantities or WAREHOUSE evidence', async () => {
    const request = {
      attachmentIds: ['9223372036854775801'],
      contractOrderId: '9223372036854775803',
      etd: '2026-09-02',
      expectedContractOrderVersion: 7,
      expectedFulfillmentPlanVersion: 5,
      fulfillmentPlanId: '9223372036854775804',
      idempotencyKey: 'shipment-draft:550e8400-e29b-41d4-a716-446655440000',
      transportMode: 'SEA' as const,
    };

    await createShipmentDraft(request);

    expect(requestMocks.post).toHaveBeenCalledWith(
      '/fdmwaimao/shipment/create-draft',
      request,
    );
    expect(request).not.toHaveProperty('lines');
    expect(request).not.toHaveProperty('warehouseId');
    expect(request).not.toHaveProperty('plannedQuantity');
    expect(request).not.toHaveProperty('evidenceHash');
    expect(request).not.toHaveProperty('generationRunId');
  });

  it('uses optimistic versions for update and cancellation', async () => {
    await updateShipmentDraft({
      carrierName: '承运商 A',
      expectedVersion: 8,
      id: '9223372036854775805',
    });
    await cancelShipmentDraft({
      expectedVersion: 9,
      id: '9223372036854775805',
      reason: '客户要求重新安排发货批次',
    });

    expect(requestMocks.put).toHaveBeenNthCalledWith(
      1,
      '/fdmwaimao/shipment/update-draft',
      {
        carrierName: '承运商 A',
        expectedVersion: 8,
        id: '9223372036854775805',
      },
    );
    expect(requestMocks.put).toHaveBeenNthCalledWith(
      2,
      '/fdmwaimao/shipment/cancel-draft',
      {
        expectedVersion: 9,
        id: '9223372036854775805',
        reason: '客户要求重新安排发货批次',
      },
    );
  });

  it('uses shipment-owned structured generation endpoints and string identities', async () => {
    await getShipmentReadinessGenerationOptions('9223372036854775806', 3);
    await startShipmentReadinessGeneration({
      expectedShipmentVersion: 3,
      idempotencyKey: 'shipment-readiness:run-1',
      instruction: '优先整单发货',
      modelId: '9223372036854775807',
      shipmentId: '9223372036854775806',
      warehouseId: '9223372036854775808',
    });
    await getShipmentReadinessGenerationJob('9223372036854775809');

    expect(requestMocks.get).toHaveBeenNthCalledWith(
      1,
      '/fdmwaimao/shipment/readiness-generation/options',
      {
        params: {
          expectedShipmentVersion: 3,
          shipmentId: '9223372036854775806',
        },
      },
    );
    expect(requestMocks.post).toHaveBeenCalledWith(
      '/fdmwaimao/shipment/readiness-generation/start',
      {
        expectedShipmentVersion: 3,
        idempotencyKey: 'shipment-readiness:run-1',
        instruction: '优先整单发货',
        modelId: '9223372036854775807',
        shipmentId: '9223372036854775806',
        warehouseId: '9223372036854775808',
      },
    );
    expect(requestMocks.get).toHaveBeenNthCalledWith(
      2,
      '/fdmwaimao/shipment/readiness-generation/job',
      { params: { id: '9223372036854775809' } },
    );
  });

  it('regeneration accepts no product quantity or evidence facts from the browser', async () => {
    const request = {
      expectedVersion: '7',
      id: '9223372036854775810',
      idempotencyKey: 'shipment-readiness:regenerate-1',
      modelId: '9223372036854775811',
      warehouseId: '9223372036854775812',
    };

    await regenerateShipmentReadinessGeneration(request);

    expect(requestMocks.post).toHaveBeenCalledWith(
      '/fdmwaimao/shipment/readiness-generation/regenerate',
      request,
    );
    expect(request).not.toHaveProperty('lineSelections');
    expect(request).not.toHaveProperty('shipQuantity');
    expect(request).not.toHaveProperty('warehouseEvidence');
    expect(request).not.toHaveProperty('authorityHash');
  });

  it('models the real normalized proposal with nested authority evidence and string Long values', async () => {
    requestMocks.get.mockResolvedValueOnce(readinessGenerationJobFixture);

    const result = await getShipmentReadinessGenerationJob(
      readinessGenerationJobFixture.id,
    );
    const proposal = result.proposal;
    expect(proposal).toBeDefined();
    const line = proposal!.lineSelections[0]!;
    const warehouse = line.warehouseEvidence;
    const authority = warehouse.warehouseAuthorityEvidence;

    expect(line).not.toHaveProperty('warehouseAuthorityEvidence');
    expect(warehouse.sourceVersion).toBe('warehouse-stock-v12');
    expect(warehouse.sourceSequence).toBe('9223372036854775798');
    expect(warehouse.sourcePayloadHash).toMatch(/^[0-9a-f]{64}$/);
    expect(authority.authorityVersion).toBe(6);
    expect(authority.authorityHash).toMatch(/^[0-9a-f]{64}$/);
    expect(authority.evidenceRef).toBe(
      'WAREHOUSE_COMPANY_WAREHOUSE_AUTHORITY:9223372036854775799:V6',
    );
    expect(authority.effectiveFrom).toBe('2026-08-01T00:00:00+08:00');
    expect(authority.effectiveTo).toBe('2026-09-03T00:00:01+08:00');

    const javaLongValues = [
      result.id,
      result.modelId,
      result.sourceId,
      result.version,
      proposal!.sourceShipmentId,
      proposal!.sourceContractOrderId,
      proposal!.sourceFulfillmentPlanId,
      line.sourceContractOrderItemId,
      line.sourceFulfillmentPlanLineId,
      line.productId,
      line.skuId,
      line.warehouseId,
      warehouse.resolvedWarehouseId,
      warehouse.sourceSequence,
      authority.mappingId,
      authority.tenantId,
      authority.companyId,
      authority.warehouseId,
    ];
    expect(javaLongValues.every((value) => typeof value === 'string')).toBe(
      true,
    );
    expect(javaLongValues.every((value) => /^\d+$/.test(value))).toBe(true);
  });

  it('materializes with identity and CAS only, never browser business facts', async () => {
    const request: FdmWaimaoShipmentApi.ReadinessMaterializeReq = {
      expectedRunVersion: '9223372036854775713',
      expectedShipmentVersion: 2,
      expectedSourceSnapshotHash: '7'.repeat(64),
      generationRunId: '9223372036854775801',
      proposalVersion: 1,
      shipmentId: '9223372036854775712',
    };

    requestMocks.post.mockResolvedValueOnce({
      confirmAvailable: false,
      materializedNow: true,
      nextRequiredAction: 'RESERVATION_AND_WAREHOUSE_HANDOFF_NOT_IMPLEMENTED',
      readinessMaterialized: true,
      readinessSnapshotHash: '8'.repeat(64),
      shipmentId: request.shipmentId,
      shipmentVersion: 3,
    });

    const result = await materializeShipmentReadinessGeneration(request);

    expect(requestMocks.post).toHaveBeenCalledWith(
      '/fdmwaimao/shipment/readiness-generation/materialize',
      request,
    );
    expect(Object.keys(request).toSorted()).toEqual([
      'expectedRunVersion',
      'expectedShipmentVersion',
      'expectedSourceSnapshotHash',
      'generationRunId',
      'proposalVersion',
      'shipmentId',
    ]);
    for (const forbidden of [
      'lineSelections',
      'productId',
      'quantity',
      'shipQuantity',
      'warehouseId',
      'warehouseEvidence',
      'authorityHash',
      'evidence',
    ]) {
      expect(request).not.toHaveProperty(forbidden);
    }
    expect(typeof request.shipmentId).toBe('string');
    expect(typeof request.generationRunId).toBe('string');
    expect(typeof request.expectedRunVersion).toBe('string');
    expect(result.nextRequiredAction).toBe('RESERVE_WAREHOUSE_STOCK');
  });

  it('normalizes both rolling materialize response variants to the reservation action', () => {
    const base = {
      confirmAvailable: false as const,
      materializedNow: true,
      readinessMaterialized: true as const,
      readinessSnapshotHash: '8'.repeat(64),
      shipmentId: '9223372036854775712',
      shipmentVersion: 3,
    };

    expect(
      normalizeReadinessMaterializeResult({
        ...base,
        nextRequiredAction: 'RESERVATION_AND_WAREHOUSE_HANDOFF_NOT_IMPLEMENTED',
      }).nextRequiredAction,
    ).toBe('RESERVE_WAREHOUSE_STOCK');
    expect(
      normalizeReadinessMaterializeResult({
        ...base,
        nextRequiredAction: 'RESERVE_WAREHOUSE_STOCK',
      }).nextRequiredAction,
    ).toBe('RESERVE_WAREHOUSE_STOCK');
  });

  it('reserves and releases with identity-only commands and stable string shipment IDs', async () => {
    const reserveRequest: FdmWaimaoShipmentApi.ReserveStockReq = {
      expectedVersion: 9,
      id: '9223372036854775806',
      idempotencyKey: 'shipment-reservation:reserve:stable-key',
    };
    const releaseRequest: FdmWaimaoShipmentApi.ReleaseStockReservationReq = {
      expectedVersion: 10,
      id: '9223372036854775806',
      idempotencyKey: 'shipment-reservation:release:stable-key',
      reason: '运输计划调整，释放后重新评估',
    };

    await reserveShipmentStock(reserveRequest);
    await releaseShipmentStockReservation(releaseRequest);

    expect(requestMocks.post).toHaveBeenNthCalledWith(
      1,
      '/fdmwaimao/shipment/reserve',
      reserveRequest,
    );
    expect(requestMocks.post).toHaveBeenNthCalledWith(
      2,
      '/fdmwaimao/shipment/release-reservation',
      releaseRequest,
    );
    expect(Object.keys(reserveRequest).toSorted()).toEqual([
      'expectedVersion',
      'id',
      'idempotencyKey',
    ]);
    expect(Object.keys(releaseRequest).toSorted()).toEqual([
      'expectedVersion',
      'id',
      'idempotencyKey',
      'reason',
    ]);
    for (const request of [reserveRequest, releaseRequest]) {
      expect(typeof request.id).toBe('string');
      for (const forbidden of [
        'authorityHash',
        'evidence',
        'lines',
        'productId',
        'quantity',
        'skuId',
        'warehouseId',
      ]) {
        expect(request).not.toHaveProperty(forbidden);
      }
    }
  });

  it('confirms with identity and CAS only and never sends shipment facts', async () => {
    const request: FdmWaimaoShipmentApi.ConfirmReq = {
      expectedVersion: 10,
      id: '9223372036854775806',
      idempotencyKey: 'shipment-confirm:stable-key-1',
    };

    await confirmShipment(request);

    expect(requestMocks.post).toHaveBeenCalledWith(
      '/fdmwaimao/shipment/confirm',
      request,
    );
    expect(Object.keys(request).toSorted()).toEqual([
      'expectedVersion',
      'id',
      'idempotencyKey',
    ]);
    for (const forbidden of [
      'companyId',
      'evidence',
      'lines',
      'productId',
      'quantity',
      'reservationId',
      'skuId',
      'warehouseId',
    ]) {
      expect(request).not.toHaveProperty(forbidden);
    }
  });

  it('redrives only the original handoff identity with an audited reason', async () => {
    const request: FdmWaimaoShipmentApi.HandoffRecoveryReq = {
      expectedShipmentVersion: 11,
      id: '9223372036854775806',
      idempotencyKey: 'shipment-handoff-recovery:stable-key-1',
      reason: 'WAREHOUSE 临时故障已恢复，重新投递原交接事件',
    };

    await recoverShipmentWarehouseHandoff(request);

    expect(requestMocks.post).toHaveBeenCalledWith(
      '/fdmwaimao/shipment/recover-warehouse-handoff',
      request,
    );
    expect(Object.keys(request).toSorted()).toEqual([
      'expectedShipmentVersion',
      'id',
      'idempotencyKey',
      'reason',
    ]);
    for (const forbidden of [
      'eventId',
      'outboxId',
      'payloadHash',
      'payloadJson',
      'reservationId',
      'warehouseCommandIdempotencyKey',
    ]) {
      expect(request).not.toHaveProperty(forbidden);
    }
  });

  it('models reservation receipt and detail identities without Long precision loss', () => {
    const receipt = {
      confirmAvailable: false,
      created: true,
      expiresAt: '2026-08-31T12:30:00',
      idempotencyKey: 'shipment-reservation:reserve:stable-key',
      nextRequiredAction: 'SHIPMENT_CONFIRMATION',
      requestHash: 'f'.repeat(64),
      reservationAttemptNo: 1,
      reservationId: '9223372036854775807',
      reservationSourceVersion: 9,
      reservationVersion: 1,
      reservedAt: '2026-08-31T12:00:00',
      shipmentId: '9223372036854775806',
      shipmentVersion: 10,
      status: 'ACTIVE',
    } satisfies FdmWaimaoShipmentApi.ReservationResult;
    const detailReservation = {
      reservationId: receipt.reservationId,
      shipmentId: receipt.shipmentId,
    } satisfies {
      reservationId: FdmWaimaoShipmentApi.JavaLongString;
      shipmentId: FdmWaimaoShipmentApi.JavaLongString;
    };

    expect(typeof receipt.reservationId).toBe('string');
    expect(typeof receipt.shipmentId).toBe('string');
    expect(detailReservation.reservationId).toBe('9223372036854775807');
  });

  it('models the WAREHOUSE consumed acknowledgement without deriving actual quantities', () => {
    const completion = {
      actualOutboundQuantity: '80.000000',
      warehouseCompletionInboxId: '9223372036854775701',
      warehouseCompletionOutboxId: '9223372036854775702',
      warehouseCompletionPayloadHash: 'a'.repeat(64),
      warehouseConsumedAt: '2026-08-31T15:30:00',
      warehouseConsumedInventoryCount: 1,
      warehouseConsumedLineCount: 1,
      warehouseConsumedOrderCount: 1,
      warehouseConsumptionEventId: 'WAREHOUSE-SHIPMENT-RESERVATION:81:A1:CONSUMED:V4',
      warehouseConsumptionPlanHash: 'b'.repeat(64),
      warehouseConsumptionRequestHash: 'c'.repeat(64),
    } satisfies Pick<
      FdmWaimaoShipmentApi.Detail,
      | 'warehouseCompletionInboxId'
      | 'warehouseCompletionOutboxId'
      | 'warehouseCompletionPayloadHash'
      | 'warehouseConsumedAt'
      | 'warehouseConsumedInventoryCount'
      | 'warehouseConsumedLineCount'
      | 'warehouseConsumedOrderCount'
      | 'warehouseConsumptionEventId'
      | 'warehouseConsumptionPlanHash'
      | 'warehouseConsumptionRequestHash'
    > & {
      actualOutboundQuantity: FdmWaimaoShipmentApi.DecimalValue;
    };

    expect(typeof completion.warehouseCompletionInboxId).toBe('string');
    expect(typeof completion.warehouseCompletionOutboxId).toBe('string');
    expect(completion.actualOutboundQuantity).toBe('80.000000');
    expect(completion.warehouseConsumedLineCount).toBe(1);
    expect(completion).not.toHaveProperty('inventoryDeltas');
  });

  it('models materialized source WAREHOUSE and warehouse authority provenance as string Longs', () => {
    const source = {
      authorityPoolKey: 'WAREHOUSE_STOCK:T1:C2:W3',
      evidenceExpiresAt: '2026-09-03T00:00:01+08:00',
      evidenceHash: 'a'.repeat(64),
      evidenceObservedAt: '2026-08-31T10:00:00+08:00',
      evidenceRef: 'WAREHOUSE_STOCK_AVAILABILITY_PROJECTION:stock-request-1',
      evidenceType: 'WAREHOUSE_STOCK_AVAILABILITY_PROJECTION',
      evidenceVersion: 'warehouse-stock-v12',
      id: '9223372036854775700',
      plannedQuantity: '80',
      readinessStatus: 'READY',
      sequenceNo: 1,
      sourcePayloadHash: 'b'.repeat(64),
      sourceRequestId: 'stock-request-1',
      sourceSequence: '9223372036854775798',
      sourceSystem: 'FDM_WAREHOUSE',
      sourceType: 'WAREHOUSE',
      sourceVersion: 'warehouse-stock-v12',
      warehouseAuthorityEffectiveFrom: '2026-08-01T00:00:00+08:00',
      warehouseAuthorityEffectiveTo: '2026-09-03T00:00:01+08:00',
      warehouseAuthorityEvidenceRef:
        'WAREHOUSE_COMPANY_WAREHOUSE_AUTHORITY:9223372036854775799:V6',
      warehouseAuthorityEvidenceType: 'WAREHOUSE_COMPANY_WAREHOUSE_AUTHORITY',
      warehouseAuthorityHash: 'c'.repeat(64),
      warehouseAuthorityMappingId: '9223372036854775799',
      warehouseAuthorityVersion: 6,
      warehouseId: '9223372036854775703',
    } satisfies FdmWaimaoShipmentApi.Source;

    expect(typeof source.id).toBe('string');
    expect(typeof source.warehouseId).toBe('string');
    expect(typeof source.sourceSequence).toBe('string');
    expect(typeof source.warehouseAuthorityMappingId).toBe('string');
  });
});
