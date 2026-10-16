import { describe, expect, it, vi } from 'vitest';

import {
  buildInteractiveCardSendAttempt,
  cardRecipientOptions,
  cardSendBlockReason,
  cardStatusLabel,
  cloudUpdateStatusLabel,
} from './interactive-card-model';

const settings = {
  enabled: true,
  templateId: 'published-template',
  robotCode: 'robot-code',
  corpId: 'ding-corp',
  streamEnabled: true,
  streamRunning: true,
};
const form = { systemUserId: 164, title: '测试通知', content: '请确认' };

describe('interactive card test sending boundaries', () => {
  it('only offers valid active system users and never preselects a recipient', () => {
    expect(cardRecipientOptions([
      { id: 164, nickname: '陈博文', username: 'chen', status: 0 },
      { id: 165, nickname: '停用', username: 'disabled', status: 1 },
      { id: -1, nickname: '无效', username: 'invalid', status: 0 },
      { nickname: '缺少ID', username: 'missing', status: 0 },
    ])).toEqual([{ value: 164, label: '陈博文（chen）' }]);
  });

  it('reuses an idempotency key for a transport retry of the same notification', () => {
    const key = vi.fn().mockReturnValueOnce('first').mockReturnValueOnce('second');
    const initial = buildInteractiveCardSendAttempt(form, undefined, key);
    expect(buildInteractiveCardSendAttempt({ ...form, title: ' 测试通知 ' }, initial, key)).toEqual(initial);
    expect(key).toHaveBeenCalledTimes(1);
    expect(buildInteractiveCardSendAttempt({ ...form, systemUserId: 165 }, initial, key).requestKey).toBe('second');
  });

  it.each([
    { ...form, systemUserId: undefined },
    { ...form, systemUserId: 0 },
    { ...form, systemUserId: 1.5 },
    { ...form, title: ' ' },
    { ...form, title: 'x'.repeat(101) },
    { ...form, content: ' ' },
    { ...form, content: 'x'.repeat(1001) },
  ])('does not construct a send request with invalid recipient or content: %s', (invalid) => {
    const key = vi.fn();
    expect(() => buildInteractiveCardSendAttempt(invalid, undefined, key)).toThrow();
    expect(key).not.toHaveBeenCalled();
  });

  it.each([
    [undefined, true, false, false],
    [settings, false, false, false],
    [settings, true, true, false],
    [settings, true, false, true],
    [{ ...settings, enabled: false }, true, false, false],
    [{ ...settings, templateId: '' }, true, false, false],
    [{ ...settings, robotCode: '' }, true, false, false],
    [{ ...settings, streamEnabled: false }, true, false, false],
    [{ ...settings, streamRunning: false }, true, false, false],
  ] as const)('blocks sending until the saved app and callback configuration are ready', (config, appEnabled, appDirty, cardDirty) => {
    expect(cardSendBlockReason(config, appEnabled, appDirty, cardDirty)).not.toBe('');
  });

  it('allows a ready saved configuration and distinguishes acceptance from acknowledgement', () => {
    expect(cardSendBlockReason(settings, true, false, false)).toBe('');
    expect(cardStatusLabel('DELIVERED')).toBe('钉钉已接受投放');
    expect(cardStatusLabel('ACKNOWLEDGED')).toBe('用户已确认');
    expect(cloudUpdateStatusLabel('FAILED')).toBe('原卡片更新失败');
  });
});
