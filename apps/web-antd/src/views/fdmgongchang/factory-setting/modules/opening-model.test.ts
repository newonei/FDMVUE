import { describe, expect, it } from 'vitest';

import { parseCsv, toOpeningRows } from './opening-model';

const defaults = { material: 'TPE', recipeCode: 'REC-001', thickness: 4.5 };

describe('期初导入', () => {
  it('parses quoted csv fields and a BOM', () => {
    expect(parseCsv('﻿a,b\r\n"x, y","say ""hi"""\n\n')).toEqual([
      ['a', 'b'],
      ['x, y', 'say "hi"'],
    ]);
  });

  it('maps rows by header, applies defaults and skips zero stock', () => {
    const table = parseCsv(
      [
        '色号,长cm,宽cm,厚cm,配方,数量,备注',
        '2206,190,132,,,3,B区 · A01-4',
        '高弹2502,190,132,,REC-003,1,',
        '8C,198,190,,,0,',
      ].join('\n'),
    );
    const parsed = toOpeningRows(table, defaults);
    expect(parsed.errors).toEqual([]);
    expect(parsed.total).toBe(4);
    expect(parsed.rows).toEqual([
      {
        attrs: { length: 190, material: 'TPE', recipeCode: 'REC-001', thickness: 4.5, width: 132 },
        colorCode: '2206',
        quantity: 3,
        remark: 'B区 · A01-4',
      },
      {
        attrs: { length: 190, material: 'TPE', recipeCode: 'REC-003', thickness: 4.5, width: 132 },
        colorCode: '高弹2502',
        quantity: 1,
        remark: undefined,
      },
    ]);
  });

  it('reports missing columns and bad rows', () => {
    expect(toOpeningRows(parseCsv('色号,数量\nA,1'), defaults).errors).toEqual([
      '缺少「长cm」列',
      '缺少「宽cm」列',
    ]);
    const parsed = toOpeningRows(
      parseCsv('色号,长cm,宽cm,数量\n,190,x,2'),
      defaults,
    );
    expect(parsed.errors).toEqual(['第 2 行：色号为空、宽不对']);
    expect(parsed.rows).toEqual([]);
  });
});
