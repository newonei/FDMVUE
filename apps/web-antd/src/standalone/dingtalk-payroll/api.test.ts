import { describe, expect, it, vi } from 'vitest';

import { createPayrollApi } from './api';
import { parseSlipId } from './model';

const id = '683a8785-4c76-47df-a381-c48382c716e5';
const serverNow = new Date('2026-11-18T10:00:00Z').getTime();
const slip = {
  month: '2026-10',
  name: '测试员工',
  company: '测试公司',
  department: '综合部',
  net: 1_234_500,
  sections: [
    {
      title: '应发项目',
      items: [{ label: '基础工资', value: 1_234_500 }],
      total: 1_234_500,
    },
  ],
};

function response(data: unknown, code = 0) {
  return Response.json(
    { code, data },
    {
      headers: { Date: new Date(serverNow).toUTCString() },
    },
  );
}

describe('payroll DingTalk detail contract', () => {
  it('fails closed for duplicate or invalid link IDs', () => {
    expect(parseSlipId(`?id=${id.toUpperCase()}`)).toBe(id);
    expect(parseSlipId(`?id=${id}&id=${id}`)).toBeUndefined();
    expect(parseSlipId('?id=123')).toBeUndefined();
  });

  it('requests an authenticated, uncached record and uses the server deadline', async () => {
    const fetcher = vi.fn().mockResolvedValue(
      response({
        status: 'AVAILABLE',
        serverNow,
        expiresAt: serverNow + 30 * 60_000,
        slip,
      }),
    );
    const result = await createPayrollApi('/admin-api/', fetcher).detail(
      8,
      'test-bearer',
      id,
      new AbortController().signal,
    );
    expect(fetcher).toHaveBeenCalledWith(
      `/admin-api/fdmplatform/payroll/my-slip?id=${id}`,
      expect.objectContaining({
        cache: 'no-store',
        credentials: 'omit',
        redirect: 'error',
        headers: expect.objectContaining({
          Authorization: 'Bearer test-bearer',
          'tenant-id': '8',
        }),
      }),
    );
    expect(result).toEqual({
      status: 'AVAILABLE',
      remainingMs: 1_800_000,
      slip,
    });
  });

  it('never returns a salary payload for expired or unauthorized requests', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(response({ status: 'EXPIRED', slip }))
      .mockResolvedValueOnce(
        response({ status: 'AVAILABLE', expiresAt: serverNow, slip }),
      )
      .mockResolvedValueOnce(response({ status: 'AVAILABLE', slip }, 403));
    const api = createPayrollApi('/admin-api', fetcher);
    const load = () => api.detail(8, 'token', id, new AbortController().signal);
    await expect(load()).resolves.toEqual({ status: 'EXPIRED' });
    await expect(load()).resolves.toEqual({ status: 'EXPIRED' });
    await expect(load()).rejects.toMatchObject({ code: 403 });
  });
});
