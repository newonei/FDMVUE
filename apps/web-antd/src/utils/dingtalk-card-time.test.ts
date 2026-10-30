import { describe, expect, it } from 'vitest';

import { formatDingTalkCardTime } from './dingtalk-card-time';

describe('dingTalk card timestamps', () => {
  it('renders backend Unix milliseconds as business time in China', () => {
    expect(formatDingTalkCardTime(Date.UTC(2026, 9, 15, 8, 30, 0))).toBe(
      '2026/10/15 16:30:00',
    );
  });

  it.each([undefined, '', 'not-a-date'])(
    'handles an absent or invalid timestamp %s',
    (value) => {
      expect(formatDingTalkCardTime(value)).toBe('—');
    },
  );
});
