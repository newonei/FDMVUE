import type { FdmProductApi } from '#/api/fdmproduct/product';

import { describe, expect, it } from 'vitest';

import {
  buildProductSavePayload,
  buildProductUpdatePayload,
  createEmptyProductForm,
  hydrateProductForm,
  validateProductForm,
} from './form-model';

describe('fdmproduct authoritative form model', () => {
  it('builds only backend VO fields with string IDs and decimals', () => {
    const form = createEmptyProductForm('9007199254740001');
    form.categoryId = '9007199254740002';
    form.productCode = 'MAT-01';
    form.productName = 'Yoga Mat';
    const sku = form.skus[0]!;
    sku.skuCode = 'MAT-BLUE';
    sku.skuName = 'Blue';
    sku.referencePrice = '19.990000';
    sku.netWeightKg = '1.2500';
    sku.exportDisplayName = 'Blue Export';
    sku.exportReferencePrice = '21.000000';
    expect(buildProductSavePayload(form)).toEqual(
      expect.objectContaining({
        companyId: '9007199254740001',
        categoryId: '9007199254740002',
        productCode: 'MAT-01',
        productName: 'Yoga Mat',
        status: 0,
        skus: [
          expect.objectContaining({
            skuCode: 'MAT-BLUE',
            skuName: 'Blue',
            referencePrice: '19.99',
            netWeightKg: '1.25',
            exportReferencePrice: '21',
            exportStatus: 0,
          }),
        ],
      }),
    );
  });

  it('hydrates and returns SPU/SKU/EXPORT optimistic versions', () => {
    const detail: FdmProductApi.ProductDetail = {
      baseUnit: 'PCS',
      categoryId: '2',
      companyId: '1',
      exportEnabledSkuCount: 1,
      id: '3',
      productCode: 'P1',
      productName: 'Product',
      skuCount: 1,
      status: 0,
      version: 7,
      skus: [
        {
          id: '4',
          version: 8,
          skuCode: 'S1',
          skuName: 'SKU',
          status: 0,
          exportProfileId: '5',
          exportVersion: 9,
          exportStatus: 0,
        },
      ],
    };
    const update = buildProductUpdatePayload(hydrateProductForm(detail));
    expect(update).toMatchObject({
      companyId: '1',
      id: '3',
      expectedVersion: 7,
      skus: [
        {
          id: '4',
          expectedVersion: 8,
          exportProfileId: '5',
          expectedExportVersion: 9,
        },
      ],
    });
  });

  it('omits default currencies while optional prices are empty on create', () => {
    const form = createEmptyProductForm('1');
    form.categoryId = '2';
    form.productCode = 'P1';
    form.productName = 'Product';
    form.skus[0]!.skuCode = 'S1';
    form.skus[0]!.skuName = 'SKU';

    const [sku] = buildProductSavePayload(form).skus;

    expect(sku).toMatchObject({ skuCode: 'S1', skuName: 'SKU' });
    expect(sku?.referencePrice).toBeUndefined();
    expect(sku?.referenceCurrency).toBeUndefined();
    expect(sku?.exportReferencePrice).toBeUndefined();
    expect(sku?.exportReferenceCurrency).toBeUndefined();
  });

  it('does not invent currencies when editing a product with empty prices', () => {
    const detail: FdmProductApi.ProductDetail = {
      baseUnit: 'PCS',
      categoryId: '2',
      companyId: '1',
      exportEnabledSkuCount: 0,
      id: '3',
      productCode: 'P1',
      productName: 'Product',
      skuCount: 1,
      status: 0,
      version: 7,
      skus: [{ id: '4', version: 8, skuCode: 'S1', skuName: 'SKU', status: 0 }],
    };

    const [sku] = buildProductUpdatePayload(hydrateProductForm(detail)).skus;

    expect(sku?.referenceCurrency).toBeUndefined();
    expect(sku?.exportReferenceCurrency).toBeUndefined();
  });

  it('rejects missing company/category and duplicate or malformed SKU codes', () => {
    const form = createEmptyProductForm();
    form.productCode = 'bad code';
    form.productName = 'P';
    form.skus[0]!.skuCode = 'SKU-1';
    form.skus[0]!.skuName = 'A';
    form.skus.push({ ...form.skus[0]!, rowKey: 'second', skuName: 'B' });
    const messages = validateProductForm(form).map((item) => item.message);
    expect(messages).toContain('请选择所属公司');
    expect(messages).toContain('请选择产品分类');
    expect(messages.some((item) => item.includes('产品编码只能'))).toBe(true);
    expect(messages.some((item) => item.includes('SKU 编码重复'))).toBe(true);
  });

  it('reports deterministic decimal, currency and weight errors before submit', () => {
    const form = createEmptyProductForm('1');
    form.categoryId = '2';
    form.productCode = 'P1';
    form.productName = 'Product';
    const sku = form.skus[0]!;
    sku.skuCode = 'S1';
    sku.skuName = 'SKU';
    sku.referencePrice = '1.1234567';
    sku.referenceCurrency = '';
    sku.grossWeightKg = '1';
    sku.netWeightKg = '2';

    const messages = validateProductForm(form).map((item) => item.message);

    expect(messages.some((item) => item.includes('参考价格式不正确'))).toBe(
      true,
    );
    expect(
      messages.some((item) => item.includes('参考价币种必须为三位字母')),
    ).toBe(true);
    expect(messages.some((item) => item.includes('净重不能大于毛重'))).toBe(
      true,
    );
  });
});
