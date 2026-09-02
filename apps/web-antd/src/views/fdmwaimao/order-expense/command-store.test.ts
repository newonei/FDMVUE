import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  clearActiveExpenseGeneration,
  clearExpenseCommand,
  getOrCreateExpenseCommand,
  loadActiveExpenseGeneration,
  saveActiveExpenseGeneration,
} from './command-store';

function materializeFingerprint(attachmentIds: string[]) {
  return `7:2:${'a'.repeat(64)}:${attachmentIds.toSorted().join(',')}`;
}

describe('订单费用命令身份', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue(
      '11111111-1111-4111-8111-111111111111',
    );
  });

  it('同一业务身份和请求摘要在超时重试时复用相同幂等键', async () => {
    const first = await getOrCreateExpenseCommand(
      'update:9:0',
      'hash-a',
      'expense',
    );
    const second = await getOrCreateExpenseCommand(
      'update:9:0',
      'hash-a',
      'expense',
    );

    expect(first).toBe(second);
  });

  it('请求事实改变时创建新键，成功后可清除', async () => {
    vi.mocked(globalThis.crypto.randomUUID)
      .mockReturnValueOnce('22222222-2222-4222-8222-222222222222')
      .mockReturnValueOnce('33333333-3333-4333-8333-333333333333');
    const first = await getOrCreateExpenseCommand(
      'update:9:0',
      'hash-a',
      'expense',
    );
    const second = await getOrCreateExpenseCommand(
      'update:9:0',
      'hash-b',
      'expense',
    );
    expect(second).not.toBe(first);

    clearExpenseCommand('update:9:0');
    expect(window.sessionStorage.length).toBe(0);
  });

  it('附件顺序不改变物化命令身份，但排序后的附件集合变化会创建新键', async () => {
    vi.mocked(globalThis.crypto.randomUUID)
      .mockReturnValueOnce('44444444-4444-4444-8444-444444444444')
      .mockReturnValueOnce('55555555-5555-4555-8555-555555555555');
    const identity = 'materialize:9223372036854775807:2';

    const first = await getOrCreateExpenseCommand(
      identity,
      materializeFingerprint(['9223372036854775805', '9223372036854775804']),
      'expense-materialize',
    );
    const reordered = await getOrCreateExpenseCommand(
      identity,
      materializeFingerprint(['9223372036854775804', '9223372036854775805']),
      'expense-materialize',
    );
    const changed = await getOrCreateExpenseCommand(
      identity,
      materializeFingerprint(['9223372036854775804', '9223372036854775806']),
      'expense-materialize',
    );

    expect(reordered).toBe(first);
    expect(changed).not.toBe(first);
  });

  it('只持久化 SHA-256 摘要，不落金额、描述或币种', async () => {
    const facts = JSON.stringify({
      currency: 'USD',
      description: '敏感运输费用',
      lines: [{ amount: '123456.78' }],
    });

    await getOrCreateExpenseCommand('update:9:0', facts, 'expense');

    const stored = window.sessionStorage.getItem(
      'fdm:waimao:order-expense:command:v1:update%3A9%3A0',
    );
    expect(stored).not.toContain('123456.78');
    expect(stored).not.toContain('敏感运输费用');
    expect(stored).not.toContain('USD');
    expect(JSON.parse(stored ?? '{}').fingerprintDigest).toMatch(
      /^[0-9a-f]{64}$/,
    );
  });

  it('仅保存可恢复轮询所需的运行身份元数据', () => {
    const active = {
      runId: '9223372036854775807',
      runVersion: '7',
      sourceId: '9223372036854775806',
      sourceType: 'FDM_WAIMAO_SHIPMENT' as const,
      sourceVersion: 4,
    };

    saveActiveExpenseGeneration(active);

    expect(loadActiveExpenseGeneration()).toEqual(active);
    const raw = window.sessionStorage.getItem(
      'fdm:waimao:order-expense:active-generation:v1',
    );
    expect(raw).not.toContain('amount');
    expect(raw).not.toContain('instruction');
    clearActiveExpenseGeneration();
    expect(loadActiveExpenseGeneration()).toBeUndefined();
  });
});
