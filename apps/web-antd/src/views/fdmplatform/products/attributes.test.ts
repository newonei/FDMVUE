import { describe, expect, it } from 'vitest';

import { productAttributesText, productStageValue } from './attributes';

describe('产品属性摘要', () => {
  it('只读展示历史关联阶段，不改变档案值，明确维护的阶段始终优先', () => {
    const legacy = {
      productStage: null,
      resolvedProductStage: 'BOARD',
      resolvedProductStageLabel: '发泡板材',
    };
    expect(productStageValue(legacy)).toBe('BOARD');
    expect(productAttributesText(legacy)).toBe('生产分类：发泡板材');
    expect(legacy.productStage).toBeNull();
    expect(productStageValue({ ...legacy, productStage: 'CUT' })).toBe('CUT');
    expect(
      productAttributesText({
        ...legacy,
        productStage: 'CUT',
        productStageLabel: '立切片材',
      }),
    ).toBe('生产分类：立切片材');
  });
  it('优先使用字典标签，保留未知代码，兼容工厂 DTO 的空值', () => {
    expect(
      productAttributesText({
        productStage: 'SHEET',
        productStageLabel: '开片板材',
        colorCode: 'P',
        colorCodeLabel: '紫色',
        textureFront: null,
        textureBack: 'OLD',
      }),
    ).toBe('生产分类：开片板材 · 单色：紫色 · 反面压花：OLD');
  });
  it('没有结构颜色时继续显示历史颜色，双面颜色存在时不重复显示颜色原文', () => {
    expect(productAttributesText({ color: '紫灰双色', colorCode: null })).toBe(
      '颜色：紫灰双色',
    );
    expect(
      productAttributesText({
        color: '紫灰双色',
        frontColor: 'P',
        backColor: 'G',
      }),
    ).toBe('正面颜色：P · 反面颜色：G');
  });
});
