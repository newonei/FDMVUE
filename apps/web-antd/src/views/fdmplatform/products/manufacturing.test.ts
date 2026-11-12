import { describe, expect, it } from 'vitest';

import {
  colorModeText,
  manufacturingError,
  manufacturingPayload,
} from './manufacturing';

describe('颜色与独立制造结构', () => {
  it('旧记录不根据相同颜色推断已核实模式', () => {
    expect(colorModeText({ frontColor: 'P', backColor: 'P' })).toBe('待核实');
    expect(
      manufacturingPayload({ frontColor: 'P', backColor: 'G' }),
    ).toMatchObject({
      colorMode: 'UNKNOWN',
      constructionType: 'UNKNOWN',
      frontColor: 'P',
      backColor: 'G',
    });
  });
  it('单色一次选择规范化三颜色，同色双层保留不等厚两层', () => {
    const source = {
      colorMode: 'SINGLE' as const,
      colorCode: 'P',
      constructionType: 'DOUBLE_LAYER' as const,
      finishedThicknessMm: 6,
      frontThicknessMm: 2,
      backThicknessMm: 4,
    };
    expect(manufacturingError(source)).toBe('');
    expect(manufacturingPayload(source)).toMatchObject({
      colorCode: 'P',
      frontColor: 'P',
      backColor: 'P',
      frontThicknessMm: 2,
      backThicknessMm: 4,
    });
  });
  it('双色要求两种颜色，双层厚度必须相加匹配，单层规范单面厚度', () => {
    expect(
      manufacturingError({
        colorMode: 'DUAL',
        frontColor: 'P',
        backColor: 'P',
      }),
    ).toContain('必须不同');
    expect(
      manufacturingError({
        constructionType: 'DOUBLE_LAYER',
        finishedThicknessMm: 6,
        frontThicknessMm: 2,
        backThicknessMm: 3,
      }),
    ).toContain('之和');
    expect(
      manufacturingPayload({
        colorMode: 'DUAL',
        colorCode: 'OLD',
        frontColor: 'P',
        backColor: 'G',
        constructionType: 'SINGLE_LAYER',
        finishedThicknessMm: 6.5,
        backThicknessMm: 3,
      }),
    ).toMatchObject({
      colorCode: '',
      frontThicknessMm: 6.5,
      backThicknessMm: null,
    });
  });
});
