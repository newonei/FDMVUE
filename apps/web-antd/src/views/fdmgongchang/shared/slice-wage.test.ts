import { describe, expect, it } from 'vitest';

import { sliceParticipantError, sliceVolume, sliceWageAllocation } from './slice-wage';

describe('slice volume wages', () => {
  it('sums cubic metres across actual good output specifications', () => {
    expect(sliceVolume([
      { attrs: { length: 198, width: 190, thickness: 4.5 }, goodQuantity: 2 },
      { attrs: { length: 190, width: 132, thickness: 4.5 }, goodQuantity: 1 },
      { attrs: { length: 190, width: 132, thickness: 4.5 }, goodQuantity: 0 },
    ])).toBe('0.45144');
  });

  it('keeps the batch total unchanged as participants are added and allocates cents by user ID', () => {
    const one = sliceWageAllocation(0.45144, 27, [7]);
    const three = sliceWageAllocation(0.45144, 27, [7, 2, 5]);
    expect(one).toEqual({ amount: 12.19, shares: [{ userId: 7, amount: 12.19 }] });
    expect(three).toEqual({ amount: 12.19, shares: [
      { userId: 2, amount: 4.07 }, { userId: 5, amount: 4.06 }, { userId: 7, amount: 4.06 },
    ] });
    expect(three.shares.reduce((total, share) => total + Math.round(share.amount * 100), 0)).toBe(1219);
  });

  it('prices the exact physical volume without intermediate rounding', () => {
    const volume = sliceVolume([{ attrs: { length: 155.25, width: 65.3, thickness: 3.42 }, goodQuantity: 71 }]);
    expect(volume).toBe('2.4616666665');
    expect(sliceWageAllocation(volume, 27, [7]).amount).toBe(66.46);
  });

  it('rounds the batch total once and rejects missing or repeated participants', () => {
    expect(sliceWageAllocation(1.005, 1, [2, 7])).toEqual({ amount: 1.01, shares: [
      { userId: 2, amount: 0.51 }, { userId: 7, amount: 0.5 },
    ] });
    expect(sliceParticipantError([2, undefined])).toContain('请选择');
    expect(sliceParticipantError([2, 2])).toContain('重复');
    expect(sliceParticipantError([2, 7])).toBe('');
  });
});
