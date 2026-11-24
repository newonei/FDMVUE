import { describe, expect, it } from 'vitest';

import { colorPreview } from '#/components/fdm-color-preview/color-preview';

import { productCatalogColors, productColorPreview } from './color-preview';

describe('产品档案色样', () => {
  it('使用真实色号及工厂维护的照片和色值，即使档案保存的是内部编码', () => {
    const sample = productColorPreview('C001', '101 U 黄', {
      code: '101 U',
      hex: '#112233',
      imageUrl: 'https://example.com/sample.jpg',
    })!;
    expect(sample.code).toBe('101 U');
    expect(sample.name).toBe('黄');
    expect(colorPreview(sample)).toMatchObject({
      kind: 'image',
      value: 'https://example.com/sample.jpg',
    });
    expect(colorPreview({ ...sample, imageUrl: undefined }).value).toBe(
      '#112233',
    );
    expect(colorPreview({ code: sample.code }).value).toBe('#FFF166');
  });

  it('单色只显示一次，双色保持正反面顺序和各自色号', () => {
    expect(
      productCatalogColors({
        backColor: '502C',
        colorCode: '502C',
        colorMode: 'SINGLE',
        frontColor: '502C',
      }),
    ).toMatchObject([{ label: '502C', side: undefined }]);
    expect(
      productCatalogColors({
        backColor: '101U',
        colorMode: 'DUAL',
        frontColor: '6092U',
      }),
    ).toMatchObject([
      { label: '6092U', side: '正' },
      { label: '101U', side: '反' },
    ]);
  });

  it('保留历史颜色原文，只展示可识别的色样', () => {
    const [legacy] = productCatalogColors({ color: '软木原色' });
    expect(legacy?.label).toBe('软木原色');
    expect(colorPreview(legacy!.sample!).kind).toBe('none');
  });
});
