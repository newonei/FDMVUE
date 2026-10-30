import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  getDingTalkWorkNotificationDetailResult,
  getDingTalkWorkNotificationResult,
  sendDingTalkWorkNotification,
  sendDingTalkWorkNotificationDetail,
} from './index';

const { post, get, globalPost, access } = vi.hoisted(() => ({
  post: vi.fn(),
  get: vi.fn(),
  globalPost: vi.fn(),
  access: { accessToken: 'test-token' },
}));
vi.mock('@vben/stores', () => ({
  useAccessStore: () => access,
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
    access.accessToken = 'test-token';
  });
  const card = {
    title: '通知',
    description: '说明',
    detailUrl: 'https://example.com',
    buttonTitle: '详情',
  };
  it('waits for GET authentication and uses the token refreshed by that GET', async () => {
    let authenticate: (() => void) | undefined;
    get.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          authenticate = () => {
            access.accessToken = 'refreshed-token';
            resolve();
          };
        }),
    );
    post.mockResolvedValue({ data: '{"code":0,"data":123}' });
    const sending = sendDingTalkWorkNotification({
      systemUserIds: [164],
      card,
    });
    expect(get).toHaveBeenCalledWith('/system/auth/get-permission-info', {
      silent: true,
    });
    expect(post).not.toHaveBeenCalled();
    authenticate?.();
    await expect(sending).resolves.toBe('123');
    expect(post).toHaveBeenCalledTimes(1);
    expect(post.mock.calls[0]?.[2].headers.Authorization).toBe(
      'Bearer refreshed-token',
    );
  });
  it('does not send either notification type when GET authentication fails', async () => {
    get.mockRejectedValue(new Error('authentication failed'));
    await expect(
      sendDingTalkWorkNotification({ systemUserIds: [164], card }),
    ).rejects.toThrow('authentication failed');
    await expect(
      sendDingTalkWorkNotificationDetail({
        requestKey: 'uuid',
        systemUserId: 164,
        title: '通知',
        description: '说明',
        buttonTitle: '详情',
      }),
    ).rejects.toThrow('authentication failed');
    expect(post).not.toHaveBeenCalled();
    expect(globalPost).not.toHaveBeenCalled();
  });
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
  it.each([new Error('request failed'), { response: { status: 401 } }])(
    'does not replay a POST after it fails: %s',
    async (error) => {
      post.mockRejectedValue(error);
      await expect(
        sendDingTalkWorkNotification({ systemUserIds: [164], card }),
      ).rejects.toBe(error);
      expect(get).toHaveBeenCalledTimes(1);
      expect(post).toHaveBeenCalledTimes(1);
      expect(globalPost).not.toHaveBeenCalled();
    },
  );
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
