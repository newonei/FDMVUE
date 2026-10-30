import { describe, expect, it } from 'vitest';

import {
  cardSessionKey,
  createCardSession,
  detailStatusLabel,
  parseCardDetailType,
  parseCardId,
  readCardSession,
} from './model';

describe('standalone card detail identity and session boundaries', () => {
  it('uses separate record types and rejects unknown or ambiguous type parameters', () => {
    expect(parseCardDetailType('?id=1')).toBe('interactive-card');
    expect(parseCardDetailType('?type=work-notification&id=1')).toBe(
      'work-notification',
    );
    for (const value of [
      '?type=unknown',
      '?type=',
      '?type=work-notification&type=work-notification',
    ])
      expect(() => parseCardDetailType(value)).toThrow('类型无效');
    expect(detailStatusLabel('ACCEPTED', 'work-notification')).toBe('已受理');
    expect(detailStatusLabel('ACKNOWLEDGED', 'work-notification')).toBe(
      '工作通知',
    );
  });
  it.each([
    '',
    '?id=',
    '?id=0',
    '?id=-1',
    '?id=1.2',
    '?id=1e2',
    '?id=999999999999999999999',
    '?id=https://evil.example',
  ])('rejects an invalid card link: %s', (search) => {
    expect(() => parseCardId(search)).toThrow(/无效/);
  });

  it('uses only the numeric instance ID and never accepts a URL credential as identity', () => {
    expect(parseCardId('?id=42&token=untrusted&userId=164')).toBe(42);
  });

  it('separates short lived sessions by tenant, enterprise and application', () => {
    const config = { enabled: true, corpId: 'ding1', clientId: 'app1' };
    const base = cardSessionKey(1, config);
    expect(cardSessionKey(2, config)).not.toBe(base);
    expect(cardSessionKey(1, { ...config, corpId: 'ding2' })).not.toBe(base);
    expect(cardSessionKey(1, { ...config, clientId: 'app2' })).not.toBe(base);
  });

  it('caps local token reuse at five minutes and respects a shorter server expiry', () => {
    expect(createCardSession('token', undefined, 1000).expiresAt).toBe(301_000);
    expect(createCardSession('token', 100_000, 1000).expiresAt).toBe(100_000);
    expect(() => createCardSession('', undefined)).toThrow(
      '免登未返回访问凭证',
    );
  });

  it('does not reuse expired, malformed or unexpectedly long sessions', () => {
    const storage = (value: unknown) => ({
      getItem: () => JSON.stringify(value),
    });
    expect(
      readCardSession(
        storage({ accessToken: 'token', expiresAt: 100_000 }),
        'key',
        1000,
      )?.accessToken,
    ).toBe('token');
    expect(
      readCardSession(
        storage({ accessToken: 'token', expiresAt: 30_000 }),
        'key',
        1000,
      ),
    ).toBeUndefined();
    expect(
      readCardSession(
        storage({ accessToken: 'token', expiresAt: 9_999_999 }),
        'key',
        1000,
      ),
    ).toBeUndefined();
    expect(
      readCardSession({ getItem: () => '{bad' }, 'key', 1000),
    ).toBeUndefined();
    expect(
      readCardSession(
        {
          getItem: () => {
            throw new Error('blocked');
          },
        },
        'key',
        1000,
      ),
    ).toBeUndefined();
  });
});
