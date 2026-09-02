import { beforeEach, describe, expect, it, vi } from 'vitest';

import { completeOutboundOrder, getOutboundOrderPage } from './index';

const requestMocks = vi.hoisted(() => ({
  get: vi.fn(),
  put: vi.fn(),
}));

vi.mock('#/api/request', () => ({ requestClient: requestMocks }));

describe('fDM warehouse outbound API', () => {
  beforeEach(() => vi.clearAllMocks());

  it('queries only the FDM warehouse endpoint', async () => {
    requestMocks.get.mockResolvedValueOnce({ list: [], total: 0 });
    await getOutboundOrderPage({ pageNo: 1, pageSize: 10 });
    expect(requestMocks.get).toHaveBeenCalledWith(
      '/fdmwarehouse/outbound-order/page',
      { params: { pageNo: 1, pageSize: 10 } },
    );
  });

  it('uses outbound identity for reservation-backed completion', async () => {
    const command = {
      expectedReservationVersion: 7,
      idempotencyKey: 'outbound:42:7',
      outboundOrderId: '90071992547409942',
    };
    requestMocks.put.mockResolvedValueOnce(undefined);
    await completeOutboundOrder(command);
    expect(requestMocks.put).toHaveBeenCalledWith(
      '/fdmwarehouse/outbound-order/complete',
      command,
    );
  });
});
