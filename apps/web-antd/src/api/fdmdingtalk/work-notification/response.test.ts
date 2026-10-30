import { describe, expect, it } from 'vitest';

import {
  normalizeWorkNotificationTaskId,
  parseWorkNotificationDetailReceipt,
  parseWorkNotificationEnvelope,
} from './response';

describe('work notification task ID precision', () => {
  it('preserves a Java Long from the raw JSON response', () => {
    expect(
      parseWorkNotificationEnvelope(
        '{"code":0,"data":9223372036854775807,"msg":""}',
      ),
    ).toBe('9223372036854775807');
    expect(
      parseWorkNotificationEnvelope('{"code":0,"data":"3447025165974"}'),
    ).toBe('3447025165974');
  });
  it.each([
    Number.MAX_SAFE_INTEGER + 1,
    '9223372036854775808',
    '0',
    '-1',
    '1e3',
    '01',
    null,
  ])('rejects an invalid or already rounded task ID: %s', (value) => {
    expect(() => normalizeWorkNotificationTaskId(value)).toThrow('任务编号');
  });
  it('retains the error branch instead of interpreting it as an accepted task', () => {
    expect(() =>
      parseWorkNotificationEnvelope(
        '{"code":401,"data":null,"msg":"登录失效"}',
      ),
    ).toThrow('登录失效');
  });
  it('does not invent a valid task for an incomplete lightweight receipt', () => {
    expect(() =>
      parseWorkNotificationDetailReceipt({
        id: 1,
        status: 'ACCEPTED',
        taskId: null,
        detailUrl: 'https://example.com',
      }),
    ).toThrow('缺少任务编号');
    expect(
      parseWorkNotificationDetailReceipt({
        id: 1,
        status: 'UNKNOWN',
        taskId: null,
        detailUrl: 'https://example.com',
      }).status,
    ).toBe('UNKNOWN');
  });
});
