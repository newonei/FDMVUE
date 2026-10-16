import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  getDingTalkWorkNotificationDetailResult,
  getDingTalkWorkNotificationResult,
  sendDingTalkWorkNotification,
  sendDingTalkWorkNotificationDetail,
} from './index';

const { post, get, globalPost } = vi.hoisted(() => ({
  post: vi.fn(),
  get: vi.fn(),
  globalPost: vi.fn(),
}));
vi.mock('@vben/stores', () => ({
  useAccessStore: () => ({ accessToken: 'test-token' }),
}));
vi.mock('#/api/request', () => ({
  baseRequestClient: { post },
  requestClient: { get, post: globalPost },
}));

describe('work notification transport does not replay sends', () => {
  beforeEach(() => {
    post.mockReset();
    get.mockReset();
    globalPost.mockReset();
  });
  const card = {
    title: '通知',
    description: '说明',
    detailUrl: 'https://example.com',
    buttonTitle: '详情',
  };
  it('uses the raw base client once and preserves the task ID before JSON number parsing', async () => {
    post.mockResolvedValue({ data: '{"code":0,"data":9223372036854775807}' });
    expect(
      await sendDingTalkWorkNotification({ systemUserIds: [164], card }),
    ).toBe('9223372036854775807');
    expect(post).toHaveBeenCalledTimes(1);
    expect(globalPost).not.toHaveBeenCalled();
    expect(post.mock.calls[0]?.[2]).toMatchObject({
      responseType: 'text',
      responseReturn: 'raw',
      headers: { Authorization: 'Bearer test-token' },
    });
    expect(
      post.mock.calls[0]?.[2].transformResponse[0](
        '{"data":9223372036854775807}',
      ),
    ).toBe('{"data":9223372036854775807}');
  });
  it('does not refresh and replay a send after a 401 or uncertain network failure', async () => {
    post.mockRejectedValue(new Error('request failed'));
    await expect(
      sendDingTalkWorkNotification({ systemUserIds: [164], card }),
    ).rejects.toThrow('request failed');
    expect(post).toHaveBeenCalledTimes(1);
    expect(globalPost).not.toHaveBeenCalled();
  });
  it('uses a dedicated lightweight record endpoint and keeps UNKNOWN as unknown', async () => {
    post.mockResolvedValue({
      data: '{"code":0,"data":{"id":1,"taskId":null,"status":"UNKNOWN","detailUrl":"https://example.com/dingtalk-card.html?type=work-notification&id=1"}}',
    });
    const receipt = await sendDingTalkWorkNotificationDetail({
      requestKey: 'uuid',
      systemUserId: 164,
      title: '通知',
      description: '说明',
      buttonTitle: '详情',
    });
    expect(receipt.status).toBe('UNKNOWN');
    expect(post.mock.calls[0]?.[0]).toBe(
      '/fdmdingtalk/work-notification/send-detail-card',
    );
    expect(post).toHaveBeenCalledTimes(1);
  });
  it('queries the appropriate task or stored application context without converting the task ID to a number', async () => {
    get.mockResolvedValue({ unread_user_id_list: ['d1'] });
    await getDingTalkWorkNotificationResult('9223372036854775807');
    expect(get.mock.calls[0]?.[1]).toMatchObject({
      params: { taskId: '9223372036854775807' },
    });
    await getDingTalkWorkNotificationDetailResult(1);
    expect(get.mock.calls[1]?.[0]).toBe(
      '/fdmdingtalk/work-notification/detail-send-result',
    );
    expect(get.mock.calls[1]?.[1]).toMatchObject({ params: { id: 1 } });
  });
});
