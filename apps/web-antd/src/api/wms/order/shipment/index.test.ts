import type { WmsShipmentOrderApi } from './index';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { completeReservationBackedShipmentOrders } from './index';

const requestMocks = vi.hoisted(() => ({
  put: vi.fn(),
}));

vi.mock('#/api/request', () => ({ requestClient: requestMocks }));

describe('wMS reservation-backed shipment completion API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('submits only order identity, CAS version and idempotency key', async () => {
    const request: WmsShipmentOrderApi.ReservationBackedCompleteReq = {
      expectedReservationVersion: 3,
      idempotencyKey:
        'wms-reservation-completion:550e8400-e29b-41d4-a716-446655440000',
      shipmentOrderId: '9223372036854775807',
    };

    await completeReservationBackedShipmentOrders(request);

    expect(requestMocks.put).toHaveBeenCalledWith(
      '/wms/shipment-order/complete-reservation-backed',
      request,
    );
    expect(request).not.toHaveProperty('warehouseId');
    expect(request).not.toHaveProperty('inventoryId');
    expect(request).not.toHaveProperty('skuId');
    expect(request).not.toHaveProperty('quantity');
    expect(request).not.toHaveProperty('handoffPlanHash');
    expect(request).not.toHaveProperty('consumedAt');
  });

  it('keeps the typed result reservation id as a browser string', () => {
    const receipt: WmsShipmentOrderApi.ReservationBackedCompleteResp = {
      attemptNo: 1,
      consumedAt: '2026-09-01T01:02:03Z',
      inventoryCount: 1,
      lineCount: 1,
      newlyCreated: true,
      orderCount: 1,
      reservationId: '9223372036854775807',
      resultVersion: 4,
    };

    expect(typeof receipt.reservationId).toBe('string');
  });
});
