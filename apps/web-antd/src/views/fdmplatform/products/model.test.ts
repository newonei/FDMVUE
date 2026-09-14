import type { ContractItem } from '#/api/fdmplatform';

import { describe, expect, it } from 'vitest';

import {
  applyReferencePrices,
  contractCompanyOptions,
  contractHeaderPayload,
  contractLineAmount,
  copyContractLine,
  hasProductVersion,
  invalidateLinePrices,
  mergeProductSelection,
} from './model';

const line = (overrides: Partial<ContractItem> = {}): ContractItem => ({
  id: 'line-a',
  skuId: 'sku-a',
  skuName: '瑜伽垫',
  specVersion: 'spec-1',
  specification: '183 × 61 cm',
  unit: '张',
  quantity: '3',
  unitPrice: '12.50',
  productVersion: 2,
  taxBasis: 'TAX_INCLUDED',
  printing: '客户 LOGO',
  packaging: '独立彩盒',
  attachmentIds: ['artwork-a'],
  requiredDate: '2026-10-01',
  ...overrides,
});

describe('contract product selection and pricing', () => {
  it('accepts initial product version zero and distinguishes null historical snapshots', () => {
    expect(hasProductVersion(line({ productVersion: 0 }))).toBe(true);
    expect(hasProductVersion(line({ productVersion: null }))).toBe(false);
    expect(hasProductVersion(line({ productVersion: undefined }))).toBe(false);
  });
  it('keeps previously selected products when paging and removes an unchecked current-page product', () => {
    const first = [{ id: 'a' }, { id: 'b' }];
    const second = [{ id: 'c' }, { id: 'd' }];
    const selection = mergeProductSelection(first, second, ['a', 'b', 'c']);
    expect(selection.map((product) => product.id)).toEqual(['a', 'b', 'c']);
    expect(
      mergeProductSelection(selection, first, ['b', 'c']).map(
        (product) => product.id,
      ),
    ).toEqual(['b', 'c']);
  });
  it('uses the visible version of a reselected product and does not create duplicate selections', () => {
    expect(
      mergeProductSelection(
        [{ id: 'a', version: 1 }],
        [{ id: 'a', version: 2 }],
        ['a'],
      ),
    ).toEqual([{ id: 'a', version: 2 }]);
  });
  it('distinguishes a missing price from an explicitly free sample', () => {
    expect(contractLineAmount(line({ unitPrice: null }))).toBeUndefined();
    expect(contractLineAmount(line({ unitPrice: undefined }))).toBeUndefined();
    expect(contractLineAmount(line({ unitPrice: '' }))).toBeUndefined();
    expect(contractLineAmount(line({ unitPrice: '0' }))).toBe(0);
    expect(contractLineAmount(line())).toBe(37.5);
  });
  it('copies a customized SKU into an independent contract line without sharing attachment arrays', () => {
    const original = line();
    const copied = copyContractLine(original, 'line-b');
    copied.attachmentIds!.push('other-artwork');
    expect(copied.id).toBe('line-b');
    expect(copied.printing).toBe(original.printing);
    expect(original.attachmentIds).toEqual(['artwork-a']);
  });
  it('clears amount and old price evidence after currency or tax changes while keeping customization', () => {
    const original = line({
      priceSourceId: 'price-cny',
      priceSourceVersion: 4,
    });
    const [updated] = invalidateLinePrices([original], 'TAX_EXCLUDED');
    expect(updated).toMatchObject({
      unitPrice: null,
      taxBasis: 'TAX_EXCLUDED',
      quantity: '3',
      packaging: '独立彩盒',
      requiredDate: '2026-10-01',
    });
    expect(updated?.priceSourceId).toBeUndefined();
    expect(original.unitPrice).toBe('12.50');
  });
  it('reprices duplicate SKU rows without overwriting their different quantities, dates or artwork', () => {
    const first = line();
    const second = line({
      id: 'line-b',
      quantity: '5',
      printing: '另一图案',
      attachmentIds: ['artwork-b'],
    });
    const updated = applyReferencePrices(
      [first, second],
      [line({ unitPrice: '9', priceSourceId: 'price-usd' })],
    );
    expect(updated.map((item) => item.unitPrice)).toEqual(['9', '9']);
    expect(updated.map((item) => item.quantity)).toEqual(['3', '5']);
    expect(updated[1]?.attachmentIds).toEqual(['artwork-b']);
    expect(updated[1]?.printing).toBe('另一图案');
  });
  it('keeps historical SKU rows when repricing has no supported product reference', () => {
    const historical = line({ skuId: 'legacy', productVersion: undefined });
    expect(
      applyReferencePrices([historical], [line({ unitPrice: '9' })]),
    ).toEqual([historical]);
  });
});

describe('order company attribute with shared products', () => {
  it('omits supplied contract numbers on creation and preserves the saved number during edits', () => {
    const form = {
      code: 'typed-by-user',
      companyId: 21,
      name: '新合同',
      taxBasis: 'TAX_INCLUDED',
    };
    expect(contractHeaderPayload(form)).toEqual({
      companyId: 21,
      name: '新合同',
    });
    expect(contractHeaderPayload(form, { code: 'HT-20260907-000001' })).toEqual(
      { companyId: 21, name: '新合同', code: 'HT-20260907-000001' },
    );
    expect(form.code).toBe('typed-by-user');
  });
  it('offers every real company independently of role and excludes shared catalog scope zero', () => {
    const companies = [
      { companyId: 0, companyName: '共用资料', roles: [] },
      { companyId: 21, companyName: '签约甲公司', roles: [] },
      { companyId: 22, companyName: '签约乙公司', roles: ['SALES'] },
    ];
    expect(contractCompanyOptions(companies)).toEqual([
      { value: 21, label: '签约甲公司' },
      { value: 22, label: '签约乙公司' },
    ]);
  });
  it('retains the historical order company when editing after that company leaves the enabled options', () => {
    const current = { companyId: 21, companyName: '历史签约公司' };
    expect(contractCompanyOptions([], current)).toEqual([
      { value: 21, label: '历史签约公司' },
    ]);
    expect(current.companyId).toBe(21);
    expect(contractCompanyOptions([])).toEqual([]);
  });
});
