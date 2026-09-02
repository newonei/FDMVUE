import type { ProductSelectionDetail } from './product-selection';

import { describe, expect, it } from 'vitest';

import { toProductSelectionValue } from './product-selection';

describe('shared product selection value', () => {
  it('returns the contract-safe editable snapshot with required company/SKU identity', () => {
    const detail: ProductSelectionDetail = {
      category: 'Yoga Mat',
      code: 'MAT-BLUE',
      companyId: '9007199254740001',
      currency: 'USD',
      exportProfile: { id: '9007199254740004', version: 3 },
      imageUrl: 'https://cdn.test/blue.png',
      name: 'Blue Yoga Mat',
      productCode: 'MAT-01',
      productId: '9007199254740002',
      productName: 'Yoga Mat',
      referencePrice: '19.990000',
      skuCode: 'MAT-BLUE',
      skuId: '9007199254740003',
      skuName: 'Blue',
      unit: 'PCS',
      versionToken: 'sku-v3',
    };

    expect(toProductSelectionValue(detail)).toEqual({
      category: 'Yoga Mat',
      code: 'MAT-BLUE',
      companyId: '9007199254740001',
      currency: 'USD',
      exportProfile: { id: '9007199254740004', version: 3 },
      imageUrl: 'https://cdn.test/blue.png',
      name: 'Blue Yoga Mat',
      productCode: 'MAT-01',
      productId: '9007199254740002',
      productName: 'Yoga Mat',
      referencePrice: '19.990000',
      skuCode: 'MAT-BLUE',
      skuId: '9007199254740003',
      skuName: 'Blue',
      unit: 'PCS',
      versionToken: 'sku-v3',
    });
  });
});
