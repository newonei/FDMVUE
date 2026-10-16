import { describe, expect, it } from 'vitest';

import {
  beginWorkNotificationAttempt,
  buildWorkNotificationPayload,
  isValidWorkNotificationUrl,
  restoreWorkNotificationAttempt,
  summarizeWorkNotificationResult,
} from './work-notification-model';

const form = {
  systemUserId: 164,
  detailMode: 'lightweight' as const,
  title: '通知标题',
  description: '通知说明',
  buttonTitle: '查看明细',
  coverUrl: '',
  detailUrl: 'https://example.com/order?id=1#detail',
};

describe('work notification send boundaries', () => {
  it('builds a dedicated lightweight record without a fabricated detail ID or recipient default', () => {
    expect(buildWorkNotificationPayload(form, 'uuid')).toEqual({
      mode: 'lightweight',
      data: {
        systemUserId: 164,
        requestKey: 'uuid',
        title: '通知标题',
        description: '通知说明',
        buttonTitle: '查看明细',
      },
    });
    expect(() =>
      buildWorkNotificationPayload(
        { ...form, systemUserId: undefined },
        'uuid',
      ),
    ).toThrow('选择');
  });
  it('keeps a business deep link and sends only one actual selected system user', () => {
    expect(
      buildWorkNotificationPayload({ ...form, detailMode: 'link' }, 'uuid'),
    ).toEqual({
      mode: 'link',
      data: {
        systemUserIds: [164],
        card: {
          title: '通知标题',
          description: '通知说明',
          buttonTitle: '查看明细',
          detailUrl: form.detailUrl,
        },
      },
    });
  });
  it.each([
    'javascript:alert(1)',
    '//example.com',
    'https://user:password@example.com',
    String.raw`https://example.com\path`,
    'https://example.com/a(b)',
    'https://example.com/<a>',
    'https://example.com/a b',
    'http:example.com',
  ])('rejects unsafe detail and image URLs: %s', (url) => {
    expect(isValidWorkNotificationUrl(url)).toBe(false);
    expect(() =>
      buildWorkNotificationPayload(
        { ...form, detailMode: 'link', detailUrl: url },
        'uuid',
      ),
    ).toThrow('详情链接');
    expect(() =>
      buildWorkNotificationPayload({ ...form, coverUrl: url }, 'uuid'),
    ).toThrow('封面');
  });
  it('rejects control characters and validates text lengths without rendering Markdown', () => {
    for (let code = 0; code < 32; code++)
      expect(
        isValidWorkNotificationUrl(
          `https://example.com/a${String.fromCodePoint(code)}b`,
        ),
      ).toBe(false);
    expect(() =>
      buildWorkNotificationPayload({ ...form, title: 'a\nb' }, 'uuid'),
    ).toThrow('标题');
    expect(() =>
      buildWorkNotificationPayload(
        { ...form, description: 'x'.repeat(601) },
        'uuid',
      ),
    ).toThrow('说明');
    expect(() =>
      buildWorkNotificationPayload(
        { ...form, buttonTitle: 'x'.repeat(21) },
        'uuid',
      ),
    ).toThrow('按钮');
    const raw = '![image](https://example.com)\n**bold**';
    expect(
      buildWorkNotificationPayload({ ...form, description: raw }, 'uuid').data,
    ).toHaveProperty('description', raw);
  });
  it.each(['accepted', 'failed', 'sending', 'unknown'] as const)(
    'locks an existing %s attempt against any implicit retry',
    (phase) => {
      const attempt = {
        ...beginWorkNotificationAttempt(undefined, '指定用户', '通知', 'uuid'),
        phase,
      };
      expect(() =>
        beginWorkNotificationAttempt(attempt, '指定用户', '通知', 'another'),
      ).toThrow('锁定');
    },
  );
  it('restores an interrupted request as unknown, preserving its task ID exactly', () => {
    const attempt = beginWorkNotificationAttempt(
      undefined,
      '指定用户',
      '通知',
      'uuid',
    );
    expect(restoreWorkNotificationAttempt(JSON.stringify(attempt))?.phase).toBe(
      'unknown',
    );
    expect(
      restoreWorkNotificationAttempt(
        JSON.stringify({
          ...attempt,
          phase: 'accepted',
          taskId: '9223372036854775807',
        }),
      )?.taskId,
    ).toBe('9223372036854775807');
    expect(restoreWorkNotificationAttempt('{bad')).toBeUndefined();
  });
});

describe('work notification delivery evidence', () => {
  it.each([{}, { read_user_id_list: [], unread_user_id_list: [] }])(
    'does not treat an empty result as success: %s',
    (value) => {
      expect(summarizeWorkNotificationResult(value).state).toBe('pending');
    },
  );
  it('distinguishes unread from read without guessing which system user a DingTalk ID represents', () => {
    const summary = summarizeWorkNotificationResult({
      read_user_id_list: ['d1'],
      unread_user_id_list: ['d2'],
    });
    expect(summary.state).toBe('reported');
    expect(summary.counts.read_user_id_list).toBe(1);
    expect(summary.counts.unread_user_id_list).toBe(1);
  });
  it.each([
    'failed_user_id_list',
    'invalid_user_id_list',
    'invalid_dept_id_list',
    'forbidden_user_id_list',
    'forbidden_list',
  ])('reports a failure or restriction in %s', (field) => {
    expect(summarizeWorkNotificationResult({ [field]: ['d1'] }).state).toBe(
      'issues',
    );
  });
  it('counts forbidden entries separately instead of adding them to user counts', () => {
    const summary = summarizeWorkNotificationResult({
      forbidden_list: [{ userid: 'd1', code: 1, count: 3 }],
      forbidden_user_id_list: ['d1'],
    });
    expect(summary.counts.forbidden_list).toBe(1);
    expect(summary.counts.forbidden_user_id_list).toBe(1);
  });
  it('treats malformed or missing response data as unverified', () => {
    expect(summarizeWorkNotificationResult(null).state).toBe('invalid');
    expect(
      summarizeWorkNotificationResult({
        unread_user_id_list: 'd1' as unknown as unknown[],
      }).state,
    ).toBe('invalid');
  });
});
