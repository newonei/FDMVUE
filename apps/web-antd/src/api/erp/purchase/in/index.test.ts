import { beforeEach, describe, expect, it, vi } from 'vitest';

import { updatePurchaseInStatus } from './index';

const requestMocks = vi.hoisted(() => ({ put: vi.fn() }));

vi.mock('#/api/request', () => ({ requestClient: requestMocks }));

describe('eRP purchase-in status API', () => {
  beforeEach(() => vi.clearAllMocks());

  it('sends the trimmed audit reason when reversing to PROCESS/10', async () => {
    requestMocks.put.mockResolvedValueOnce(undefined);

    await updatePurchaseInStatus(81, 10, '质检退回，撤销本次入库');

    expect(requestMocks.put).toHaveBeenCalledWith(
      '/erp/purchase-in/update-status',
      null,
      {
        params: {
          id: 81,
          reason: '质检退回，撤销本次入库',
          status: 10,
        },
      },
    );
  });

  it('never carries a reason when posting to APPROVE/20', async () => {
    requestMocks.put.mockResolvedValueOnce(undefined);

    await updatePurchaseInStatus(81, 20, '调用方误传的原因');

    expect(requestMocks.put).toHaveBeenCalledWith(
      '/erp/purchase-in/update-status',
      null,
      { params: { id: 81, status: 20 } },
    );
  });
});
