import type { ProductColorRepairRow } from '#/api/fdmplatform/product-color-repair';

import { describe, expect, it } from 'vitest';

import {
  colorRepairDraft,
  colorRepairError,
  colorRepairItem,
} from './color-repair';

const colors = [
  { value: 'P', label: '紫色' },
  { value: 'G', label: '灰色' },
];
const source: ProductColorRepairRow = {
  productId: 'p',
  version: 7,
  code: 'SKU',
  name: '垫',
  active: true,
  current: {},
  suggested: { colorMode: 'DUAL', frontColor: 'P', backColor: 'G' },
  status: 'READY',
  reasons: [],
  canApply: true,
};
describe('历史颜色补录人工确认', () => {
  it('rEADY不默认勾选，确认提交可信产品ID版本与reviewed', () => {
    const row = colorRepairDraft(source);
    expect(row.selected).toBe(false);
    expect(colorRepairError(row, colors)).toBe('');
    expect(colorRepairItem(row)).toEqual({
      productId: 'p',
      expectedVersion: 7,
      colorMode: 'DUAL',
      colorCode: undefined,
      frontColor: 'P',
      backColor: 'G',
      reviewed: true,
    });
  });
  it('不存在的5036/5035不能作为字典颜色写入，不覆盖已有不一致颜色', () => {
    const row = colorRepairDraft({
      ...source,
      status: 'NEEDS_COLOR',
      suggested: { colorMode: 'DUAL', frontColor: '5036', backColor: '5035' },
    });
    expect(colorRepairError(row, colors)).toContain('已有字典');
    row.edited = { colorMode: 'DUAL', frontColor: 'P', backColor: 'G' };
    row.current.frontColor = 'G';
    expect(colorRepairError(row, colors)).toContain('冲突');
  });
  it('模糊方向必须人工选择，单色不要求重复填两面', () => {
    const row = colorRepairDraft({
      ...source,
      status: 'NEEDS_DIRECTION',
      suggested: {},
    });
    expect(colorRepairError(row, colors)).toContain('确认单色或双色');
    row.edited = { colorMode: 'SINGLE', colorCode: 'P' };
    expect(colorRepairError(row, colors)).toBe('');
  });
});
