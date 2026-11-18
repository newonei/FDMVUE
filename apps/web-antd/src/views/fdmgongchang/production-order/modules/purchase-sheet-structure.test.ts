import type { FdmgongchangProductionOrderApi as Api } from '#/api/fdmgongchang/production-order';

import { describe, expect, it } from 'vitest';

import { purchaseSheetImageIds, purchaseSheetStructure } from './purchase-sheet-structure';

const line: Api.PurchaseSheet['order']['lines'][number] = {
  id: 'line-1', quantity: 100, colorMode: 'SINGLE', colorCode: 'OLD', colorCodeLabel: '旧色',
  frontColor: 'OLD', frontColorLabel: '旧色', backColor: 'OLD', backColorLabel: '旧色',
  textureFront: 'OLD-TEXTURE', textureFrontLabel: '旧纹路', weight: '800g±50g',
  size: '183*61*0.6cm', constructionType: 'SINGLE_LAYER',
};
const options = { colors: [{ label: '紫色', value: 'ZI' }, { label: '蓝色', value: 'LAN' }], textures: [{ label: '波浪纹', value: 'WAVE' }], materials: [], patterns: [] };

describe('factory purchase requirements', () => {
  it('uses per-line purchasing colors, textures and weight ahead of snapshot values without changing dimensions or structure', () => {
    expect(purchaseSheetStructure(line, { colorMode: 'DUAL', frontColor: 'ZI', backColor: 'LAN', textureFront: '', textureBack: 'WAVE', weight: '900g±100g' }, options)).toMatchObject({
      colorMode: 'DUAL', frontColor: 'ZI', frontColorLabel: '紫色', backColor: 'LAN', backColorLabel: '蓝色',
      textureFront: '', textureFrontLabel: undefined, textureBack: 'WAVE', textureBackLabel: '波浪纹', weight: '900g±100g', size: line.size, constructionType: 'SINGLE_LAYER',
    });
    expect(line.frontColor).toBe('OLD');
  });
  it('uses one purchasing color for both sides in single-color products and keeps snapshot weight when omitted', () => {
    expect(purchaseSheetStructure(line, { colorMode: 'SINGLE', frontColor: 'ZI' }, options)).toMatchObject({
      colorCode: 'ZI', colorCodeLabel: '紫色', frontColor: 'ZI', backColor: 'ZI', weight: '800g±50g',
    });
  });
  it('clears the old single-color snapshot when purchasing explicitly clears colors or changes color mode', () => {
    expect(purchaseSheetStructure(line, { colorMode: 'UNKNOWN', frontColor: '', backColor: '' }, options)).toMatchObject({ colorMode: 'UNKNOWN', colorCode: '', colorCodeLabel: undefined, frontColor: '', backColor: '' });
    expect(purchaseSheetStructure(line, { colorMode: 'SINGLE', frontColor: '' }, options)).toMatchObject({ colorMode: 'SINGLE', colorCode: '', colorCodeLabel: undefined, frontColor: '', backColor: '' });
    expect(purchaseSheetStructure(line, { colorMode: 'DUAL', frontColor: 'ZI', backColor: 'LAN' }, options)).toMatchObject({ colorCode: '', colorCodeLabel: undefined });
  });
  it('fetches supplier color images independently from product images and deduplicates repeated image references', () => {
    expect(purchaseSheetImageIds({ lineExtras: { a: { imageId: 'product', colorImageId: 'supplier' }, b: { colorImageId: 'supplier' } }, packagingSteps: [{ title: '包装', imageIds: ['package'] }] })).toEqual(['package', 'product', 'supplier']);
  });
});
