import { describe, expect, it } from 'vitest';

import {
  FDM_PRODUCT_AI_SURFACE,
  isFdmProductAiPath,
  resolveFdmProductAiSurface,
} from './product-surfaces';

describe('fdmproduct AI surface routes', () => {
  it.each([
    ['/fdmbase/product-center', 'list', undefined],
    ['/fdmbase/product-center/create', 'form', undefined],
    [
      '/fdmbase/product-center/edit/9007199254740993',
      'form',
      '9007199254740993',
    ],
    [
      '/fdmbase/product-center/detail/9007199254740994',
      'detail',
      '9007199254740994',
    ],
  ] as const)('resolves %s', (path, mode, businessId) => {
    expect(resolveFdmProductAiSurface(path)).toMatchObject({
      businessId,
      contextMode: mode,
      pageKey: 'product',
      queryPermission: 'fdmproduct:product:query',
      sessionSurfaceKey: 'product',
      surface: { availability: 'enabled', key: 'product' },
    });
  });

  it('does not appear on unrelated or product root routes', () => {
    expect(resolveFdmProductAiSurface('/fdmbase')).toBeUndefined();
    expect(resolveFdmProductAiSurface('/fdmwaimao/customer')).toBeUndefined();
    expect(isFdmProductAiPath('/fdmbase/product-center')).toBe(true);
    expect(isFdmProductAiPath('/system/user')).toBe(false);
  });

  it('provides real-model questions and a read-only boundary', () => {
    expect(FDM_PRODUCT_AI_SURFACE.questions).toHaveLength(4);
    expect(FDM_PRODUCT_AI_SURFACE.readOnlyNotice).toContain('不会');
  });
});
