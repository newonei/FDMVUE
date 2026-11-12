import { describe, expect, it } from 'vitest';

import { attrSummary, makeLabels, sizeText } from '../stage-stock/model';
import { dimensionFromDisplay, dimensionTextInMm, dimensionToDisplay } from './dimensions';

describe('factory millimetre display boundaries', () => {
  it('converts dimensions without changing the stored centimetre attributes or legacy callers', () => {
    const attrs = { length: 132, width: 192, thickness: 4.5 };
    expect(sizeText(attrs, 'mm')).toBe('1320×1920×45 mm');
    expect(attrSummary('BOARD', attrs, makeLabels(), [], 'mm')).toBe('1320×1920×45 mm');
    expect(sizeText(attrs)).toBe('132×192×4.5');
    expect(attrs).toEqual({ length: 132, width: 192, thickness: 4.5 });
    expect(dimensionToDisplay('0.29', 'mm')).toBe(2.9);
    expect(dimensionFromDisplay('3.5', 'mm')).toBe(0.35);
    expect(dimensionFromDisplay('', 'mm')).toBeNull();
    expect(dimensionToDisplay(null, 'mm')).toBeUndefined();
  });

  it('converts labelled legacy specifications while preserving existing mm values and item codes', () => {
    expect(dimensionTextInMm('板材 132*192*4.5cm · TPE')).toBe('板材 1320×1920×45 mm · TPE');
    expect(dimensionTextInMm('185 × 61 × 0.6 cm')).toBe('1850×610×6 mm');
    expect(dimensionTextInMm('板材 ?×132×4.5cm')).toBe('板材 ?×1320×45 mm');
    expect(dimensionTextInMm('1850×610×6 mm · BC-TPE-190X132X4.5')).toBe('1850×610×6 mm · BC-TPE-190X132X4.5');
    expect(dimensionTextInMm('190×132×4.5')).toBe('190×132×4.5');
  });
});
