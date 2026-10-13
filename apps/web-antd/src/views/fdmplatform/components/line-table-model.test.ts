import type { LineColumn } from './line-table-model';

import { describe, expect, it } from 'vitest';

import {
  DEFAULT_WIDTH,
  defaultSetting,
  MAX_WIDTH,
  MIN_WIDTH,
  moveKey,
  normalizeSetting,
  tableWidth,
  visibleColumns,
} from './line-table-model';

const columns: LineColumn[] = [
  { key: 'name', title: '产品名称', width: 220, locked: true },
  { key: 'spec', title: '规格' },
  { key: 'color', title: '颜色', optional: true },
  { key: 'qty', title: '数量', width: 100, align: 'right' },
];

describe('产品明细字段设置', () => {
  it('默认显示非可选字段，锁定列固定在左侧，没写宽度的按默认宽度', () => {
    const shown = visibleColumns(columns, defaultSetting(columns));
    expect(shown.map((item) => item.key)).toEqual(['name', 'spec', 'qty']);
    expect(shown[0]).toMatchObject({ fixed: 'left', width: 220 });
    expect(shown[1]).toMatchObject({ width: DEFAULT_WIDTH, ellipsis: true });
    expect(tableWidth(shown)).toBe(220 + DEFAULT_WIDTH + 100);
  });

  it('保存的顺序和宽度生效，下线字段被丢弃，锁定列总在第一位', () => {
    const setting = normalizeSetting(columns, {
      keys: ['qty', 'gone', 'color', 'qty', 'name'],
      widths: { qty: 10, color: 5000, gone: 90, spec: 'x' },
    });
    expect(setting.keys).toEqual(['name', 'qty', 'color']);
    expect(setting.widths).toEqual({ qty: MIN_WIDTH, color: MAX_WIDTH });
  });

  it('读回的数据损坏时用默认设置', () => {
    expect(normalizeSetting(columns, 'oops')).toEqual(defaultSetting(columns));
    expect(normalizeSetting(columns, { keys: 'x' })).toEqual(
      defaultSetting(columns),
    );
  });

  it('拖动排序不能移动锁定列，也不能挤到锁定列前面', () => {
    const keys = ['name', 'spec', 'color', 'qty'];
    expect(moveKey(keys, 3, 1, 1)).toEqual(['name', 'qty', 'spec', 'color']);
    expect(moveKey(keys, 0, 2, 1)).toBe(keys);
    expect(moveKey(keys, 2, 0, 1)).toBe(keys);
  });
});
