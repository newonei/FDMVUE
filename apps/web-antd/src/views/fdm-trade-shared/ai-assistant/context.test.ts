import { describe, expect, it } from 'vitest';

import { sanitizeFdmWaimaoAiContext } from './context';

describe('fdmwaimao AI page context sanitizer', () => {
  it('limits rows, long strings and circular references before transport', () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    const result = sanitizeFdmWaimaoAiContext({
      circular,
      email: 'buyer@example.com',
      accessToken: 'must-not-leak',
      clientSecret: 'must-not-leak',
      phone: '',
      rows: Array.from({ length: 30 }, (_, index) => ({ id: String(index) })),
      text: 'x'.repeat(2000),
    });

    expect((result.rows as unknown[]).length).toBe(25);
    expect(String(result.text)).toHaveLength(1000);
    expect(result.circular).toEqual({ self: '[已省略循环引用]' });
    expect(result.email).toBe('已提供');
    expect(result.phone).toBe('未提供');
    expect(result).not.toHaveProperty('accessToken');
    expect(result).not.toHaveProperty('clientSecret');
  });

  it('replaces an oversized payload with a non-sensitive summary', () => {
    const oversized = Object.fromEntries(
      Array.from({ length: 48 }, (_, index) => [
        `field${index}`,
        `${index}-${'x'.repeat(1000)}`,
      ]),
    );
    const result = sanitizeFdmWaimaoAiContext(oversized);

    expect(result._contextTruncated).toBe(true);
    expect(result).not.toHaveProperty('field0');
  });

  it('drops every credential key and never sends raw contact channels', () => {
    const result = sanitizeFdmWaimaoAiContext({
      authorization: 'Bearer should-not-leak',
      credential: 'should-not-leak',
      customerEmail: 'buyer@example.com',
      linkedin: 'https://linkedin.example/buyer',
      mobile: '13800138000',
      password: 'should-not-leak',
      secret: 'should-not-leak',
      tel: null,
      token: 'should-not-leak',
      wechat: 'buyer-wechat',
      whatsapp: '+1 555 0100',
    });

    expect(result).not.toHaveProperty('authorization');
    expect(result).not.toHaveProperty('credential');
    expect(result).not.toHaveProperty('password');
    expect(result).not.toHaveProperty('secret');
    expect(result).not.toHaveProperty('token');
    expect(result.customerEmail).toBe('已提供');
    expect(result.linkedin).toBe('已提供');
    expect(result.mobile).toBe('已提供');
    expect(result.tel).toBe('未提供');
    expect(result.wechat).toBe('已提供');
    expect(result.whatsapp).toBe('已提供');
  });
});
