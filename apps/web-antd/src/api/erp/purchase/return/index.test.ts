import { beforeEach, describe, expect, it, vi } from 'vitest';

import { updatePurchaseReturnStatus } from './index';

const requestMocks = vi.hoisted(() => ({ put: vi.fn() }));

vi.mock('#/api/request', () => ({ requestClient: requestMocks }));

describe('eRP purchase-return status API', () => {
  beforeEach(() => vi.clearAllMocks());

  it('sends the audit reason when reversing to PROCESS/10', async () => {
    requestMocks.put.mockResolvedValueOnce(undefined);

    await updatePurchaseReturnStatus(91, 10, '供应商撤回退货，恢复原库存状态');

    expect(requestMocks.put).toHaveBeenCalledWith(
      '/erp/purchase-return/update-status',
      null,
      {
        params: {
          id: 91,
          reason: '供应商撤回退货，恢复原库存状态',
          status: 10,
        },
      },
    );
  });

  it('never carries a reason when posting to APPROVE/20', async () => {
    requestMocks.put.mockResolvedValueOnce(undefined);

    await updatePurchaseReturnStatus(91, 20, '调用方误传的原因');

    expect(requestMocks.put).toHaveBeenCalledWith(
      '/erp/purchase-return/update-status',
      null,
      { params: { id: 91, status: 20 } },
    );
  });
});
