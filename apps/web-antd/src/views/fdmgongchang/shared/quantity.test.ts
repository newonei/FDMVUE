import { describe, expect, it } from 'vitest';

import { quantityPrecision } from './quantity';

describe('factory quantity precision', () => {
  it.each(['片', '张', '条', '个', '块', '件', '套', '包', '只', '双', '箱', '袋', '支', ' PCS '])('uses whole counts for %s', (unit) => {
    expect(quantityPrecision(unit)).toBe(0);
  });

  it.each(['kg', '千克', 'm³', 'm3', 'm', '米', '小时', '班', '', null, undefined])('preserves decimal measurements for %s', (unit) => {
    expect(quantityPrecision(unit)).toBe(3);
  });
});
