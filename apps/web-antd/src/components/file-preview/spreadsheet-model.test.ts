import { describe, expect, it } from 'vitest';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { utils, write } from 'xlsx';

import { columnLabel, offsetIndex, SPREADSHEET_LIMITS } from './spreadsheet-grid';
import { SpreadsheetModel, validateSpreadsheetBuffer } from './spreadsheet-model';

function fixture(extension: 'xlsx' | 'xls' | 'ods' = 'xlsx') {
  const workbook = utils.book_new();
  const sheet = utils.aoa_to_sheet([['采购明细', '', '金额'], ['中文产品', 0.25, 1234.5], ['<img src=x onerror=alert(1)>', 2, 9]]);
  sheet['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 1 } }];
  sheet.B2!.z = '0.00%';
  sheet.B2!.w = '25.00%';
  sheet.C2!.z = '#,##0.00';
  sheet.C2!.w = '1,234.50';
  sheet.C3!.f = 'SUM(4,5)';
  utils.book_append_sheet(workbook, sheet, '采购');
  utils.book_append_sheet(workbook, utils.aoa_to_sheet([['第二张表']]), '汇总');
  return write(workbook, { type: 'array', bookType: extension }) as ArrayBuffer;
}

const viewport = { type: 'viewport' as const, id: 1, sheet: 0, firstRow: 0, lastRow: 5, firstColumn: 0, lastColumn: 5 };

describe('spreadsheet worker model', () => {
  it.each(['xlsx', 'xls', 'ods'] as const)('reads %s sheets, merges, Chinese and formatted numbers', (extension) => {
    const model = new SpreadsheetModel(fixture(extension));
    expect(model.sheets.map((sheet) => sheet.name)).toEqual(['采购', '汇总']);
    const cells = model.viewport(viewport);
    expect(cells.find((cell) => cell.row === 0 && cell.column === 0)).toMatchObject({ text: '采购明细', endColumn: 1 });
    expect(cells.find((cell) => cell.row === 0 && cell.column === 1)).toBeUndefined();
    expect(cells.find((cell) => cell.row === 1 && cell.column === 1)?.text).toBe('25.00%');
    expect(cells.find((cell) => cell.row === 1 && cell.column === 2)?.text).toBe('1,234.50');
    expect(cells.find((cell) => cell.row === 2 && cell.column === 0)?.text).toBe('<img src=x onerror=alert(1)>');
    expect(model.viewport({ ...viewport, sheet: 1 })[0]?.text).toBe('第二张表');
  });

  it('preserves cached formula results and marks formulas without cached values', () => {
    const model = new SpreadsheetModel(fixture());
    expect(model.viewport(viewport).find((cell) => cell.row === 2 && cell.column === 2)).toMatchObject({ text: '9', formula: 'SUM(4,5)' });
    model.workbook.Sheets['采购']!.C3 = { t: 'n', f: 'SUM(A2:A3)' };
    expect(model.viewport(viewport).find((cell) => cell.row === 2 && cell.column === 2)?.text).toBe('（公式无缓存值）');
  });

  it('reads UTF-8 and GB18030 CSV without changing identifiers into dates or numbers', () => {
    const model = new SpreadsheetModel(new TextEncoder().encode('名称,编号\n中文,00123').buffer, 'test.csv');
    expect(model.viewport(viewport).map((cell) => cell.text)).toEqual(['名称', '编号', '中文', '00123']);
    const gb = new Uint8Array([0xd6, 0xd0, 0xce, 0xc4, 0x2c, 0x31]);
    expect(new SpreadsheetModel(gb.buffer, 'test.csv').viewport(viewport)[0]?.text).toBe('中文');
  });

  it('honors hidden rows and columns without hiding other cells', () => {
    const workbook = utils.book_new();
    const sheet = utils.aoa_to_sheet([['A', 'hidden', 'C'], ['hidden'], ['visible']]);
    sheet['!rows'] = [{}, { hidden: true }];
    sheet['!cols'] = [{}, { hidden: true }];
    utils.book_append_sheet(workbook, sheet, '隐藏');
    const model = new SpreadsheetModel(write(workbook, { type: 'array', bookType: 'xlsx', cellStyles: true }));
    expect(model.sheets[0]?.rowOffsets[1]).toBe(model.sheets[0]?.rowOffsets[2]);
    expect(model.sheets[0]?.columnOffsets[1]).toBe(model.sheets[0]?.columnOffsets[2]);
    expect(model.viewport(viewport).map((cell) => cell.text)).not.toContain('hidden');
    expect(model.viewport(viewport).map((cell) => cell.text)).toContain('visible');
  });

  it('returns a merged anchor even when the viewport starts inside the merge', () => {
    const model = new SpreadsheetModel(fixture());
    expect(model.viewport({ ...viewport, firstColumn: 1, lastColumn: 1, lastRow: 0 })).toEqual([expect.objectContaining({ column: 0, endColumn: 1, text: '采购明细' })]);
  });

  it('renders only viewport cells for a tall sparse sheet and keeps distant content accessible', () => {
    const workbook = utils.book_new();
    utils.book_append_sheet(workbook, { A1: { t: 's', v: 'start' }, T100000: { t: 's', v: 'end' }, '!ref': 'A1:T100000' }, '大表');
    const model = new SpreadsheetModel(write(workbook, { type: 'array', bookType: 'xlsx' }));
    expect(model.sheets[0]?.rows).toBe(100000);
    expect(model.viewport(viewport)).toHaveLength(36);
    expect(model.viewport({ ...viewport, firstRow: 99999, lastRow: 99999, firstColumn: 19, lastColumn: 19 })[0]?.text).toBe('end');
  });

  it('rejects excessive dimensions instead of silently dropping rows', () => {
    const workbook = utils.book_new();
    utils.book_append_sheet(workbook, { A1: { t: 'n', v: 1 }, '!ref': 'A1:A200001' }, '超限');
    expect(() => new SpreadsheetModel(write(workbook, { type: 'array', bookType: 'xlsx' }))).toThrow('超出快速预览容量');
  });

  it('checks expanded ZIP sizes before parsing a compressed workbook', () => {
    const buffer = fixture();
    const view = new DataView(buffer);
    for (let offset = 0; offset < buffer.byteLength - 46; offset++) {
      if (view.getUint32(offset, true) === 0x02014b50) { view.setUint32(offset + 24, SPREADSHEET_LIMITS.expandedBytes + 1, true); break; }
    }
    expect(() => validateSpreadsheetBuffer(buffer)).toThrow('超出快速预览容量');
  });

  it('rejects a forged local expanded size even when the central directory is small', () => {
    const buffer = fixture();
    new DataView(buffer).setUint32(22, SPREADSHEET_LIMITS.expandedBytes + 1, true);
    expect(() => validateSpreadsheetBuffer(buffer)).toThrow('超出快速预览容量');
  });

  it('rejects inconsistent local compressed lengths before the parser allocates memory', () => {
    const buffer = fixture();
    new DataView(buffer).setUint32(18, 0x7fffffff, true);
    expect(() => validateSpreadsheetBuffer(buffer)).toThrow('压缩头与目录不一致');
  });

  it('counts visible cells instead of hidden coordinates in the viewport budget', () => {
    const workbook = utils.book_new();
    const sheet = utils.aoa_to_sheet([['第一行']]);
    sheet.A20001 = { t: 's', v: '最后一行' };
    sheet['!ref'] = 'A1:A20001';
    sheet['!rows'] = Array.from({ length: 20001 }, (_, index) => ({ hidden: index > 0 && index < 20000 }));
    utils.book_append_sheet(workbook, sheet, '筛选结果');
    const model = new SpreadsheetModel(write(workbook, { type: 'array', bookType: 'xlsx', cellStyles: true }));
    expect(model.viewport({ ...viewport, firstRow: 0, lastRow: 20000 }).map((cell) => cell.text)).toEqual(['第一行', '最后一行']);
  });

  it('rejects a canvas exceeding browser scroll limits instead of making the last rows unreachable', () => {
    const workbook = utils.book_new();
    const sheet = utils.aoa_to_sheet([['第一行']]);
    sheet['!ref'] = 'A1:A60000';
    sheet['!rows'] = Array.from({ length: 60000 }, () => ({ hpt: 200 }));
    utils.book_append_sheet(workbook, sheet, '超高行');
    expect(() => new SpreadsheetModel(write(workbook, { type: 'array', bookType: 'xlsx', cellStyles: true }))).toThrow('超出快速预览容量');
  });

  it('preserves XLSX font, alignment, fill and borders', () => {
    const entries = unzipSync(new Uint8Array(fixture()));
    entries['xl/styles.xml'] = strToU8(`<?xml version="1.0"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="1"><font><b/><sz val="16"/><color rgb="FF225588"/></font></fonts><fills count="1"><fill><patternFill patternType="solid"><fgColor rgb="FFDDFFDD"/></patternFill></fill></fills><borders count="1"><border><bottom style="thin"><color rgb="FF112233"/></bottom></border></borders><cellXfs count="1"><xf fontId="0" fillId="0" borderId="0" numFmtId="0"><alignment horizontal="center" wrapText="1"/></xf></cellXfs></styleSheet>`);
    entries['xl/worksheets/sheet1.xml'] = strToU8(strFromU8(entries['xl/worksheets/sheet1.xml']!).replace('<c r="A1"', '<c s="0" r="A1"'));
    const model = new SpreadsheetModel(zipSync(entries).buffer as ArrayBuffer);
    expect(model.viewport(viewport)[0]?.style).toMatchObject({ fontWeight: '700', color: '#225588', backgroundColor: '#DDFFDD', textAlign: 'center', whiteSpace: 'pre-wrap', borderBottom: '1px solid #112233' });
  });
});

describe('spreadsheet viewport coordinates', () => {
  it('finds positions using offsets including hidden columns', () => {
    const offsets = new Float64Array([0, 100, 100, 250, 350]);
    expect(offsetIndex(offsets, 0)).toBe(0);
    expect(offsetIndex(offsets, 100)).toBe(2);
    expect(offsetIndex(offsets, 249)).toBe(2);
    expect(offsetIndex(offsets, 999)).toBe(3);
  });
  it('labels Excel columns after Z', () => {
    expect([0, 25, 26, 701, 702].map(columnLabel)).toEqual(['A', 'Z', 'AA', 'ZZ', 'AAA']);
  });
});
