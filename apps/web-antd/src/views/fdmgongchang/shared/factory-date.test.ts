import { describe, expect, it } from 'vitest';

import { factoryHour, factoryToday, factoryTodayText } from './factory-date';

describe('factory date', () => {
  // 美国东部 11-04 晚上 10 点 = 北京 11-05 上午 11 点
  const usEvening = new Date('2026-11-05T03:00:00Z');

  it('uses the factory (China) calendar day, not the browser one', () => {
    expect(factoryTodayText(usEvening)).toBe('2026-11-05');
    expect(factoryToday(usEvening).format('YYYY-MM-DD')).toBe('2026-11-05');
  });

  it('reports the factory hour', () => {
    expect(factoryHour(usEvening)).toBe(11);
    expect(factoryHour(new Date('2026-11-05T16:30:00Z'))).toBe(0);
  });
});
