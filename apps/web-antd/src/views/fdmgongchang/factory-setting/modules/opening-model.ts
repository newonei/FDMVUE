import type { FdmgongchangOpeningApi } from '#/api/fdmgongchang/stage-stock';

/** 导入表的列：色号必填；长、宽、厚单位 cm；材质、配方为空时用页面上选的默认值。 */
export const OPENING_COLUMNS = [
  '色号',
  '长cm',
  '宽cm',
  '厚cm',
  '材质',
  '配方',
  '数量',
  '备注',
] as const;

/** 解析 CSV：支持双引号包起来的字段（里面可以有逗号、换行），去掉 BOM。 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  const src = text.replace(/^﻿/, '');
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') {
        quoted = false;
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ',') {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += ch;
    }
  }
  if (cell !== '' || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

export interface OpeningDefaults {
  material: string;
  recipeCode: string;
  thickness: number;
}

export interface OpeningParsed {
  errors: string[];
  rows: FdmgongchangOpeningApi.Row[];
  total: number;
}

function num(value: string | undefined) {
  const v = (value ?? '').trim();
  if (!v) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : Number.NaN;
}

/** 表格行 → 导入行；第一行是表头，按表头名称找列。数量为 0 的行跳过。 */
export function toOpeningRows(
  table: string[][],
  defaults: OpeningDefaults,
): OpeningParsed {
  const errors: string[] = [];
  const rows: FdmgongchangOpeningApi.Row[] = [];
  const [header, ...body] = table;
  if (!header) return { errors: ['文件是空的'], rows, total: 0 };
  const index = Object.fromEntries(
    OPENING_COLUMNS.map((name) => [name, header.findIndex((h) => h.trim() === name)]),
  ) as Record<(typeof OPENING_COLUMNS)[number], number>;
  for (const name of ['色号', '长cm', '宽cm', '数量'] as const) {
    if (index[name] < 0) errors.push(`缺少「${name}」列`);
  }
  if (errors.length > 0) return { errors, rows, total: 0 };
  const cell = (r: string[], name: (typeof OPENING_COLUMNS)[number]) =>
    index[name] < 0 ? '' : (r[index[name]] ?? '').trim();
  let total = 0;
  body.forEach((r, i) => {
    const line = i + 2;
    const quantity = num(cell(r, '数量'));
    if (quantity === 0) return;
    const length = num(cell(r, '长cm'));
    const width = num(cell(r, '宽cm'));
    const thickness = num(cell(r, '厚cm')) ?? defaults.thickness;
    const colorCode = cell(r, '色号');
    const problems = [
      !colorCode && '色号为空',
      !(length && length > 0) && '长不对',
      !(width && width > 0) && '宽不对',
      !(thickness && thickness > 0) && '厚不对',
      !(quantity && quantity > 0) && '数量不对',
    ].filter(Boolean);
    if (problems.length > 0) {
      errors.push(`第 ${line} 行：${problems.join('、')}`);
      return;
    }
    rows.push({
      attrs: {
        length: length!,
        material: cell(r, '材质') || defaults.material,
        recipeCode: cell(r, '配方') || defaults.recipeCode,
        thickness,
        width: width!,
      },
      colorCode,
      quantity: quantity!,
      remark: cell(r, '备注') || undefined,
    });
    total += quantity!;
  });
  return { errors, rows, total };
}
