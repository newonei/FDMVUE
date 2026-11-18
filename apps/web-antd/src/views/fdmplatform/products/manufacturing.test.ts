import { describe, expect, it } from 'vitest';

import {
  colorDerivedLayers,
  colorDerivedStage,
  colorModeText,
  configurationMissingFields,
  manufacturingError,
  manufacturingPayload,
  productDimensionsText,
  productNominalLayersText,
  productPatternText,
  productSliceThicknessText,
  productThicknessProcessText,
  usesColorDerivedLayers,
} from './manufacturing';

describe('颜色与独立制造结构', () => {
  it('无显式结构的成品草稿可继续自动推导，中间物料和历史层厚不套用', () => {
    const draft = {
      colorMode: 'DUAL' as const,
      frontColor: 'P',
      backColor: 'G',
      constructionType: 'UNKNOWN' as const,
      finishedThicknessMm: 6,
    };
    expect(usesColorDerivedLayers(draft)).toBe(true);
    expect(manufacturingPayload(draft)).not.toHaveProperty('constructionType');
    for (const productStage of ['', 'FINISHED', 'FOLDED', 'PACKED']) {
      expect(colorDerivedStage({ productStage })).toBe(true);
      expect(usesColorDerivedLayers({ ...draft, productStage })).toBe(true);
    }
    for (const productStage of [
      'RAW',
      'BOARD',
      'SHEET',
      'CUT',
      'LAMINATED',
      'EMBOSSED',
      'PUNCHED',
      'ENGRAVED',
      'AUX',
      'EQUIPMENT',
    ]) {
      expect(usesColorDerivedLayers({ ...draft, productStage })).toBe(false);
      expect(manufacturingPayload({ ...draft, productStage })).toHaveProperty(
        'constructionType',
        'UNKNOWN',
      );
      expect(
        productSliceThicknessText({
          ...draft,
          productStage,
          layerRule: 'COLOR_DERIVED_V1',
        }),
      ).toBe('');
    }
    expect(usesColorDerivedLayers({ ...draft, frontThicknessMm: 2 })).toBe(
      false,
    );
    expect(
      usesColorDerivedLayers({
        ...draft,
        constructionType: 'DOUBLE_LAYER',
        frontThicknessMm: 2,
        backThicknessMm: 4,
      }),
    ).toBe(false);
  });
  it('新规则单色6mm名义单层6，开片6.2；双色名义3+3，开片3.2+3.2', () => {
    const single = {
      colorMode: 'SINGLE' as const,
      finishedThicknessMm: 6,
      layerRule: 'COLOR_DERIVED_V1',
    };
    const dual = { ...single, colorMode: 'DUAL' as const };
    expect(colorDerivedLayers(single)).toEqual({
      constructionType: 'SINGLE_LAYER',
      frontThicknessMm: 6,
      backThicknessMm: null,
    });
    expect(colorDerivedLayers(dual)).toEqual({
      constructionType: 'DOUBLE_LAYER',
      frontThicknessMm: 3,
      backThicknessMm: 3,
    });
    expect(productSliceThicknessText(single)).toBe('单层 6.2 mm');
    expect(productThicknessProcessText(single)).toBe(
      '单色在压花工序缩水至成品厚度',
    );
    expect(productSliceThicknessText(dual)).toBe('正面 3.2 mm + 反面 3.2 mm');
    expect(productThicknessProcessText(dual)).toBe(
      '双色在贴合工序缩水至成品厚度',
    );
    expect(productSliceThicknessText({ ...dual, finishedThicknessMm: 8 })).toBe(
      '正面 4.2 mm + 反面 4.2 mm',
    );
    expect(
      productSliceThicknessText({ ...dual, finishedThicknessMm: undefined }),
    ).toBe('');
  });
  it('新规则payload省略结构和名义层字段，由后端推导，开片余量不写入成品字段', () => {
    const value = {
      colorMode: 'DUAL' as const,
      frontColor: 'P',
      backColor: 'G',
      finishedThicknessMm: 6,
      layerRule: 'COLOR_DERIVED_V1',
      frontThicknessMm: 2,
      backThicknessMm: 4,
    };
    expect(manufacturingError(value)).toBe('');
    const payload = manufacturingPayload(value);
    expect(payload.finishedThicknessMm).toBe(6);
    for (const field of [
      'constructionType',
      'frontThicknessMm',
      'backThicknessMm',
      'layerRule',
    ])
      expect(payload).not.toHaveProperty(field);
    const historical = {
      ...value,
      layerRule: undefined,
      constructionType: 'DOUBLE_LAYER' as const,
    };
    expect(manufacturingPayload(historical)).toMatchObject({
      constructionType: 'DOUBLE_LAYER',
      frontThicknessMm: 2,
      backThicknessMm: 4,
    });
    expect(productNominalLayersText(historical)).toBe('正面 2 mm + 反面 4 mm');
    expect(productSliceThicknessText(historical)).toBe('');
    expect(
      manufacturingError(
        { colorMode: 'SINGLE', colorCode: 'P' },
        { deriveLayers: true },
      ),
    ).toBe('');
  });
  it('保留毫米尺寸和明确图案版本，不把未核实当无雕刻或默认版本', () => {
    expect(
      manufacturingPayload({
        lengthMm: 1830.5,
        widthMm: 610,
        finishedThicknessMm: 6,
      }),
    ).toMatchObject({
      lengthMm: 1830.5,
      widthMm: 610,
      finishedThicknessMm: 6,
      patternMode: 'UNKNOWN',
      patternCode: '',
      patternVersion: '',
    });
    expect(configurationMissingFields({})).toEqual([
      '长度',
      '宽度',
      '厚度',
      '单双色',
      '正面颜色',
      '反面颜色',
      '正面纹路',
      '反面纹路',
      '雕刻方式',
    ]);
    expect(
      productDimensionsText({
        lengthMm: 1830.5,
        widthMm: 610,
        finishedThicknessMm: 6,
      }),
    ).toBe('1830.5 × 610 × 6 mm');
    expect(manufacturingError({ lengthMm: 0 })).toContain('成品长度');
    expect(
      manufacturingError({ patternMode: 'LASER', patternCode: 'FLOWER' }),
    ).toBe('请填写激光图案生产版本');
    expect(
      manufacturingPayload({
        patternMode: 'NONE',
        patternCode: 'OLD',
        patternVersion: 'V1',
      }),
    ).toMatchObject({
      patternMode: 'NONE',
      patternCode: '',
      patternVersion: '',
    });
  });
  it('同一张产品档案配置含有双面纹路和雕刻信息，明确无纹路也视为已维护', () => {
    const value = {
      lengthMm: 1830,
      widthMm: 610,
      finishedThicknessMm: 6,
      colorMode: 'SINGLE' as const,
      colorCode: 'P',
      textureFront: 'NONE',
      textureBack: 'WAVE',
      patternMode: 'LASER' as const,
      patternCode: 'FLOWER',
      patternVersion: '生产版B',
    };
    expect(configurationMissingFields(value)).toEqual([]);
    expect(manufacturingError(value)).toBe('');
    expect(productPatternText(value)).toBe('激光雕刻 · FLOWER · 生产版B');
    expect(productPatternText({})).toBe('雕刻待核实');
    expect(productPatternText({ patternMode: 'NONE' })).toBe('无雕刻');
  });
  it('旧记录不根据相同颜色推断已核实模式', () => {
    expect(colorModeText({ frontColor: 'P', backColor: 'P' })).toBe('待核实');
    expect(
      manufacturingPayload({ frontColor: 'P', backColor: 'G' }),
    ).toMatchObject({
      colorMode: 'UNKNOWN',
      frontColor: 'P',
      backColor: 'G',
    });
    expect(
      manufacturingPayload({ frontColor: 'P', backColor: 'G' }),
    ).not.toHaveProperty('constructionType');
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
