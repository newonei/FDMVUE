import { describe, expect, it, vi } from 'vitest';

import { CardApiError } from '../dingtalk-card/api';
import { createReportApi } from './api';

const context = { accessToken: 'token', factoryId: 2, tenantId: 1 };

function respond(body: unknown, status = 200) {
  return vi.fn(async () => Response.json(body, { status }));
}

describe('createReportApi', () => {
  it('sends the login, tenant and factory on every call', async () => {
    const fetcher = respond({ code: 0, data: { id: 7 } });
    await createReportApi('/admin-api/', fetcher as typeof fetch).prepare(
      context,
      7,
    );
    const [url, init] = fetcher.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe('/admin-api/fdmgongchang/workbench/task/prepare?id=7');
    expect(init.headers).toMatchObject({
      Authorization: 'Bearer token',
      'factory-id': '2',
      'tenant-id': '1',
    });
    expect(init.credentials).toBe('omit');
  });

  it('posts the report as JSON and the photo as a form', async () => {
    const fetcher = respond({ code: 0, data: 1 });
    const api = createReportApi('', fetcher as typeof fetch);
    await api.report(context, { taskId: 7 } as any);
    await api.upload(context, new Blob(['x']), 'a.jpg');
    const [, reportInit] = fetcher.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(reportInit.body).toBe('{"taskId":7}');
    expect(reportInit.headers).toMatchObject({
      'Content-Type': 'application/json',
    });
    const [uploadUrl, uploadInit] = fetcher.mock.calls[1] as unknown as [
      string,
      RequestInit,
    ];
    expect(uploadUrl).toBe('/infra/file/upload');
    expect((uploadInit.body as FormData).get('directory')).toBe(
      'fdmgongchang/issue-sheet',
    );
    expect(uploadInit.headers).not.toHaveProperty('Content-Type');
  });

  it('keeps the server reason and marks expired logins so the page can log in again', async () => {
    const rejected = createReportApi(
      '',
      respond({ code: 1, msg: '任务不是你的' }) as unknown as typeof fetch,
    );
    await expect(rejected.report(context, {} as any)).rejects.toThrow(
      '任务不是你的',
    );
    const expired = createReportApi(
      '',
      respond({}, 401) as unknown as typeof fetch,
    );
    await expect(expired.my(context)).rejects.toMatchObject({ code: 401 });
    await expect(expired.my(context)).rejects.toBeInstanceOf(CardApiError);
  });

  it('does not expose network details to the worker', async () => {
    const api = createReportApi(
      '',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch https://internal');
      }) as unknown as typeof fetch,
    );
    await expect(api.my(context)).rejects.toThrow('网络不太好，请再试一次');
  });
});
