import type { Contract, ContractItem } from '#/api/fdmplatform';

import { describe, expect, it } from 'vitest';

import {
  applyConfiguredContractItem,
  contractConfigurationFrom,
  contractConfigurationItems,
  contractConfigurationLockReason,
  requestedContractLineIds,
} from './contract-product-configuration';

const item = (overrides: Partial<ContractItem> = {}): ContractItem => ({
  id: 'line1',
  skuId: 'old',
  skuName: '瑜伽垫',
  productVersion: 3,
  specVersion: 'old-spec',
  specification: '标准垫',
  unit: '条',
  quantity: '100',
  unitPrice: '12',
  size: '183*61*0.6cm',
  colorMode: 'SINGLE',
  frontColor: 'BK',
  backColor: 'BK',
  textureFront: 'NONE',
  textureBack: 'WAVE',
  patternMode: 'LASER',
  patternCode: 'P1',
  patternVersion: 'V1',
  ...overrides,
});

describe('contract product SKU configuration', () => {
  it('reads mm fields first and otherwise converts only explicit dimension text without inferring colors or pattern versions', () => {
    expect(contractConfigurationFrom(item())).toMatchObject({
      lengthMm: 1830,
      widthMm: 610,
      finishedThicknessMm: 6,
      patternVersion: 'V1',
    });
    expect(
      contractConfigurationFrom(
        item({
          size: '1900*800*8mm',
          lengthMm: 1850,
          patternMode: null,
          patternVersion: null,
          colorMode: null,
        }),
      ),
    ).toMatchObject({
      lengthMm: 1850,
      widthMm: 800,
      finishedThicknessMm: 8,
      colorMode: 'UNKNOWN',
      patternMode: 'UNKNOWN',
      patternVersion: '',
    });
    expect(
      contractConfigurationFrom(item({ size: '185*61*0.8' })),
    ).toMatchObject({
      lengthMm: null,
      widthMm: null,
      finishedThicknessMm: null,
    });
  });
  it('applies only chosen fields to chosen input lines and preserves their different dimensions and patterns', () => {
    const rows = [
      item(),
      item({ id: 'line2', size: '190*80*0.8cm', patternCode: 'P2' }),
    ];
    const result = contractConfigurationItems(
      rows,
      {
        ...contractConfigurationFrom(rows[0]!),
        textureBack: 'DIAMOND',
        patternCode: 'P3',
        lengthMm: 999,
      },
      ['textureBack'],
    );
    expect(result.map((row) => row.configuration)).toEqual(
      rows.map((row) => ({
        ...contractConfigurationFrom(row),
        textureBack: 'DIAMOND',
      })),
    );
    expect(result[1]).toMatchObject({
      lineId: 'line2',
      sourceProductId: 'old',
      expectedVersion: 3,
    });
    expect(rows[0]!.textureBack).toBe('WAVE');
  });
  it('only fills unknown values and treats NONE as an explicit requirement', () => {
    const source = item({
      textureFront: 'NONE',
      textureBack: '',
      patternMode: 'UNKNOWN',
    });
    expect(
      contractConfigurationItems(
        [source],
        {
          name: '不同名称',
          textureFront: 'WAVE',
          textureBack: 'WAVE',
          patternMode: 'NONE',
        },
        ['name', 'textureFront', 'textureBack', 'patternMode'],
        true,
      )[0]!.configuration,
    ).toMatchObject({
      name: '瑜伽垫',
      textureFront: 'NONE',
      textureBack: 'WAVE',
      patternMode: 'NONE',
      patternCode: '',
      patternVersion: '',
    });
  });
  it('adopts the server SKU snapshot while preserving transactions and contract attachments and dropping old price provenance', () => {
    const original = item({
      priceSourceId: 'price-old',
      priceSourceVersion: 2,
      requiredDate: '2026-12-01',
      printing: '本单LOGO',
      packaging: '本单包装',
      remark: '本行备注',
      attachmentIds: ['artwork'],
      attachmentPurposes: { artwork: 'ARTWORK' },
      productAttachmentRefs: [
        {
          id: 'std-old',
          name: '旧资料',
          productId: 'old',
          sha256: 'a',
          size: 2,
          type: 'pdf',
        },
      ],
    });
    const snapshot = item({
      skuId: 'new',
      productVersion: 7,
      specVersion: 'new-spec',
      quantity: 1,
      unitPrice: 30,
      frontColor: 'PU',
      backColor: 'PU',
      productAttachmentRefs: [],
    });
    const adopted = applyConfiguredContractItem(original, snapshot);
    expect(adopted).toMatchObject({
      id: 'line1',
      skuId: 'new',
      productVersion: 7,
      specVersion: 'new-spec',
      frontColor: 'PU',
      quantity: '100',
      unitPrice: '12',
      requiredDate: '2026-12-01',
      printing: '本单LOGO',
      packaging: '本单包装',
      remark: '本行备注',
      attachmentIds: ['artwork'],
      attachmentPurposes: { artwork: 'ARTWORK' },
      productAttachmentRefs: [],
      priceSourceId: undefined,
      priceSourceVersion: undefined,
    });
    expect(adopted.attachmentIds).not.toBe(original.attachmentIds);
  });
  it('locks old identities and all historical request references consistently with the backend', () => {
    expect(
      contractConfigurationLockReason(item({ productVersion: null })),
    ).toContain('历史明细');
    expect(
      contractConfigurationLockReason(item({ openingShippedQuantity: 1 })),
    ).toContain('锁定');
    const contract = {
      requests: [{ status: 'CANCELLED', items: [{ contractItemId: 'line1' }] }],
    } as unknown as Contract;
    expect(requestedContractLineIds(contract).has('line1')).toBe(true);
    expect(contractConfigurationLockReason(item(), true)).toContain('锁定');
  });
});
