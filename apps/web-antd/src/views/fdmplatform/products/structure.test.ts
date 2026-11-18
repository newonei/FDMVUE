import { createApp, h } from 'vue';

import { describe, expect, it } from 'vitest';

import ProductStructureDetails from './components/ProductStructureDetails.vue';
import {
  productStructure,
  structureDetails,
  structureValue,
} from './structure';

describe('单据产品结构', () => {
  it('新规则区分成品名义层与开片建议，历史显式层厚不套用余量', () => {
    for (const [value, nominal, slice] of [
      [
        {
          colorMode: 'DUAL',
          constructionType: 'DOUBLE_LAYER',
          finishedThicknessMm: 6,
          frontThicknessMm: 3,
          backThicknessMm: 3,
          layerRule: 'COLOR_DERIVED_V1',
        },
        '正面 3 mm + 反面 3 mm',
        '正面 3.2 mm + 反面 3.2 mm',
      ],
      [
        {
          colorMode: 'SINGLE',
          constructionType: 'DOUBLE_LAYER',
          finishedThicknessMm: 6,
          frontThicknessMm: 2,
          backThicknessMm: 4,
        },
        '正面 2 mm + 反面 4 mm',
        '',
      ],
    ] as const) {
      const host = document.createElement('div');
      const app = createApp({
        render: () =>
          h(ProductStructureDetails, {
            expanded: true,
            value: productStructure(value),
          }),
      });
      app.mount(host);
      expect(host.textContent).toContain(nominal);
      expect(host.textContent?.includes('开片厚度')).toBe(slice.length > 0);
      expect(host.textContent).toContain(slice);
      app.unmount();
    }
  });
  it('只保留来源中冻结的毫米尺寸和图案版本，忽略字符串伪数字', () => {
    const value = productStructure({
      lengthMm: 1830.5,
      widthMm: 610,
      finishedThicknessMm: 6,
      patternMode: 'LASER',
      patternCode: 'FLOWER',
      patternVersion: 'V3',
      configurationReady: true,
    });
    expect(value).toMatchObject({
      lengthMm: 1830.5,
      widthMm: 610,
      finishedThicknessMm: 6,
      patternCode: 'FLOWER',
      patternVersion: 'V3',
      configurationReady: true,
    });
    expect(structureDetails(value)).toContainEqual({
      label: '尺寸',
      value: '1830.5 × 610 × 6 mm',
    });
    expect(structureDetails(value)).toContainEqual({
      label: '雕刻 / 图案版本',
      value: '激光雕刻 · FLOWER · V3',
    });
    expect(productStructure({ lengthMm: '1830' }).lengthMm).toBeUndefined();
  });
  it('保留方向编码及标签，非结构化颜色不推测为正反面', () => {
    const structure = productStructure({
      color: '粉色/灰色',
      frontColor: 'PK',
      frontColorLabel: '粉色',
    });
    expect(structureValue(structure, 'frontColor', 'frontColorLabel')).toBe(
      '粉色',
    );
    expect(structureValue(structure, 'backColor', 'backColorLabel')).toBe(
      '未维护',
    );
    expect(structureDetails(structure)).toContainEqual({
      label: '颜色说明',
      value: '粉色/灰色',
    });
    expect(
      productStructure({ resolvedProductStage: 'PACKED' }).productStage,
    ).toBeUndefined();
  });

  it('正反颜色始终可见，展开列出材质、尺寸及正反压花', () => {
    const host = document.createElement('div');
    const app = createApp({
      render: () =>
        h(ProductStructureDetails, {
          expanded: true,
          value: {
            material: 'TPE',
            size: '183*61*0.6cm',
            frontColorLabel: '粉色',
            backColorLabel: '灰色',
            textureFrontLabel: '贝壳纹',
            textureBackLabel: '波浪纹',
            matTypeLabel: '双色垫',
          },
        }),
    });
    app.mount(host);
    expect(host.querySelector('summary')?.textContent).toContain(
      '正面颜色：粉色',
    );
    expect(host.querySelector('summary')?.textContent).toContain(
      '反面颜色：灰色',
    );
    expect(host.textContent).toContain('正面压花：贝壳纹');
    expect(host.textContent).toContain('反面压花：波浪纹');
    expect(host.textContent).toContain('材质：TPE');
    expect(host.textContent).toContain('尺寸：183*61*0.6cm');
    expect(host.querySelector('details')?.open).toBe(true);
    app.unmount();
  });
});
