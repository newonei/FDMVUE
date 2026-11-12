import { createApp, h } from 'vue';

import { describe, expect, it } from 'vitest';

import ProductStructureDetails from './components/ProductStructureDetails.vue';
import {
  productStructure,
  structureDetails,
  structureValue,
} from './structure';

describe('单据产品结构', () => {
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
