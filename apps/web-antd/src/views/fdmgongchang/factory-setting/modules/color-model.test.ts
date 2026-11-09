import { describe, expect, it } from 'vitest';

import { colorPreview, colorProblem, filterColors } from './color-model';

const list = [
  { code: 'MB', name: '米白', dictLinked: true, hex: '#F5F0E6', itemCount: 2 },
  { code: '2206', imageUrl: 'https://x/2206.jpg', itemCount: 0 },
  { code: '崔先生7632', remark: '客户专用', status: 1 },
];

describe('颜色配置', () => {
  it('prefers the photo, then the swatch', () => {
    expect(colorPreview(list[1]!)).toEqual({
      kind: 'image',
      value: 'https://x/2206.jpg',
    });
    expect(colorPreview(list[0]!).kind).toBe('swatch');
    expect(colorPreview(list[2]!).kind).toBe('none');
    expect(colorPreview({ code: 'X', hex: 'red' }).kind).toBe('none');
  });

  it('searches code, name and remark and filters', () => {
    expect(filterColors(list, '米', 'all').map((c) => c.code)).toEqual(['MB']);
    expect(filterColors(list, '客户', 'all').map((c) => c.code)).toEqual([
      '崔先生7632',
    ]);
    expect(filterColors(list, '', 'noPreview').map((c) => c.code)).toEqual([
      '崔先生7632',
    ]);
    expect(filterColors(list, '', 'used').map((c) => c.code)).toEqual(['MB']);
    expect(filterColors(list, '', 'disabled')).toHaveLength(1);
  });

  it('checks code and hex before saving', () => {
    expect(colorProblem({ code: ' ' })).not.toBe('');
    expect(colorProblem({ code: '8C', hex: '2e6b4f' })).not.toBe('');
    expect(colorProblem({ code: '8C', hex: '#2e6b4f' })).toBe('');
  });
});
