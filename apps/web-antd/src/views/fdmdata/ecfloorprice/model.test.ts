import { describe, expect, it } from 'vitest';

import {
  buildSpecMatrix,
  defaultRefPrice,
  formatPrice,
  looksLikeItemCode,
  thicknessLabel,
} from './model';

describe('ec floor price model', () => {
  it('computes default reference price like the backend', () => {
    expect(defaultRefPrice(23.9)).toBe(28.68);
    expect(defaultRefPrice('99')).toBe(118.8);
    expect(defaultRefPrice(0)).toBeNull();
    expect(defaultRefPrice(undefined)).toBeNull();
  });

  it('shows unpriced instead of zero', () => {
    expect(formatPrice(53.9)).toBe('53.9');
    expect(formatPrice(120)).toBe('120');
    expect(formatPrice(0)).toBe('未定价');
    expect(formatPrice(null)).toBe('未定价');
  });

  it('arranges specs into size rows and thickness columns', () => {
    const matrix = buildSpecMatrix([
      { id: 1, specKey: '185*80*0.6', materialKey: 'TPE', floorPrice: 59.9 },
      { id: 2, specKey: '185*61*0.8', materialKey: 'TPE', floorPrice: 73.9 },
      { id: 3, specKey: '185*61*0.6', materialKey: 'TPE', floorPrice: 53.9 },
      { id: 4, specKey: '瑜伽砖粉色', materialKey: '', floorPrice: 16.9 },
      { id: 5, specKey: '185*61*0.6', materialKey: 'SUE', floorPrice: 109.9 },
    ]);
    expect(matrix.thicknesses).toEqual(['0.6', '0.8']);
    expect(matrix.rows.map((r) => r.key)).toEqual([
      'SUE|185*61',
      'TPE|185*61',
      'TPE|185*80',
    ]);
    expect(matrix.rows[1]!.cells['0.8']!.id).toBe(2);
    expect(matrix.others.map((r) => r.id)).toEqual([4]);
  });

  it('labels thickness in millimetres', () => {
    expect(thicknessLabel('0.6')).toBe('6mm');
    expect(thicknessLabel('1.5')).toBe('15mm');
    expect(thicknessLabel('0.05')).toBe('0.05cm');
  });

  it('sends item codes to code lookup and everything else to AI', () => {
    expect(looksLikeItemCode('TPE-ZD-NL-16006006')).toBe(true);
    expect(looksLikeItemCode(' 2025162060011 ')).toBe(true);
    expect(looksLikeItemCode('185')).toBe(false);
    expect(looksLikeItemCode('185*61*6mm')).toBe(false);
    expect(looksLikeItemCode('tpe 平铺 185 61 6mm')).toBe(false);
  });
});
