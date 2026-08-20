import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getFdmNeimaoCrmModuleStatus } from '#/api/fdmneimaocrm';
import { getFdmProductModuleStatus } from '#/api/fdmproduct';
import { getFdmWaimaoCrmModuleStatus } from '#/api/fdmwaimaocrm';

const requestGet = vi.hoisted(() => vi.fn());

vi.mock('#/api/request', () => ({
  requestClient: {
    get: requestGet,
  },
}));

describe('foundation CRM module-status APIs', () => {
  beforeEach(() => {
    requestGet.mockReset();
  });

  it.each([
    ['/fdmproduct/module-status', getFdmProductModuleStatus],
    ['/fdmwaimaocrm/module-status', getFdmWaimaoCrmModuleStatus],
    ['/fdmneimaocrm/module-status', getFdmNeimaoCrmModuleStatus],
  ] as const)('requests only the frozen endpoint %s', async (url, request) => {
    const response = { moduleKey: url };
    requestGet.mockResolvedValueOnce(response);

    await expect(request()).resolves.toBe(response);
    expect(requestGet).toHaveBeenCalledOnce();
    expect(requestGet).toHaveBeenCalledWith(url);
  });
});
