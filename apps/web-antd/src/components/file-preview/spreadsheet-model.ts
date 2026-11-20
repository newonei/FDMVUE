import type { CellObject, Range, WorkBook, WorkSheet } from 'xlsx';
import type { PreviewCell, SheetMetadata, ViewportRequest } from './spreadsheet-grid';

import { read, utils } from 'xlsx';

import { SPREADSHEET_LIMITS, spreadsheetFileLimit, visibleIndices } from './spreadsheet-grid';
import { applySpreadsheetStyles } from './spreadsheet-styles';

const limitMessage = '该表格超出快速预览容量，请使用版式预览查看完整内容';

/** Inspect ZIP metadata before decompressing Office/ODS containers. */
export function validateSpreadsheetBuffer(buffer: ArrayBuffer, fileName = '') {
  if (buffer.byteLength > spreadsheetFileLimit(fileName)) throw new Error(limitMessage);
  const view = new DataView(buffer);
  if (buffer.byteLength < 4 || view.getUint32(0, true) !== 0x04034b50) {
    if (buffer.byteLength > SPREADSHEET_LIMITS.fileBytes) throw new Error('仅有效的 XLSX 压缩文件支持大表格预览');
    return;
  }
  let end = -1;
  for (let offset = buffer.byteLength - 22; offset >= Math.max(0, buffer.byteLength - 65_557); offset--) {
    if (view.getUint32(offset, true) === 0x06054b50 && offset + 22 + view.getUint16(offset + 20, true) === buffer.byteLength) {
      end = offset;
      break;
    }
  }
  if (end < 0) throw new Error('表格文件压缩目录损坏，请使用版式预览');
  const count = view.getUint16(end + 10, true);
  let offset = view.getUint32(end + 16, true);
  const centralStart = offset;
  let expanded = 0;
  if (count === 0xffff || offset === 0xffffffff || view.getUint16(end + 4, true) || view.getUint16(end + 6, true) || view.getUint16(end + 8, true) !== count || offset + view.getUint32(end + 12, true) !== end) throw new Error('不支持该表格压缩格式，请使用版式预览');
  for (let index = 0; index < count; index++) {
    if (offset + 46 > end || view.getUint32(offset, true) !== 0x02014b50) throw new Error('表格文件压缩目录无效');
    const uncompressed = view.getUint32(offset + 24, true);
    const compressed = view.getUint32(offset + 20, true);
    const nameLength = view.getUint16(offset + 28, true);
    const flags = view.getUint16(offset + 8, true);
    const method = view.getUint16(offset + 10, true);
    const local = view.getUint32(offset + 42, true);
    if (local + 30 > centralStart || view.getUint32(local, true) !== 0x04034b50 || (flags & 1) || ![0, 8].includes(method)) throw new Error('表格文件压缩头无效或文件已加密');
    const localCompressed = view.getUint32(local + 18, true);
    const localExpanded = view.getUint32(local + 22, true);
    const localNameLength = view.getUint16(local + 26, true);
    const dataStart = local + 30 + localNameLength + view.getUint16(local + 28, true);
    if (localExpanded > SPREADSHEET_LIMITS.expandedBytes || uncompressed > SPREADSHEET_LIMITS.expandedBytes) throw new Error(limitMessage);
    const descriptor = Boolean(flags & 8);
    if (flags !== view.getUint16(local + 6, true) || method !== view.getUint16(local + 8, true) || nameLength !== localNameLength || dataStart > centralStart || dataStart + compressed > centralStart || offset + 46 + nameLength > end || (localExpanded !== uncompressed && !(descriptor && localExpanded === 0)) || (localCompressed !== compressed && !(descriptor && localCompressed === 0))) throw new Error('表格压缩头与目录不一致，请使用版式预览');
    for (let byte = 0; byte < nameLength; byte++) if (view.getUint8(local + 30 + byte) !== view.getUint8(offset + 46 + byte)) throw new Error('表格压缩目录名称不一致');
    for (const [extraStart, extraLength] of [[local + 30 + localNameLength, view.getUint16(local + 28, true)], [offset + 46 + nameLength, view.getUint16(offset + 30, true)]] as const) {
      const extraEnd = extraStart + extraLength;
      if (extraEnd > end) throw new Error('表格压缩目录无效');
      for (let extra = extraStart; extra < extraEnd;) {
        if (extra + 4 > extraEnd) throw new Error('表格压缩扩展目录无效');
        if (view.getUint16(extra, true) === 1) throw new Error('ZIP64 表格请使用版式预览');
        extra += 4 + view.getUint16(extra + 2, true);
        if (extra > extraEnd) throw new Error('表格压缩扩展目录无效');
      }
    }
    expanded += uncompressed;
    if (expanded > SPREADSHEET_LIMITS.expandedBytes) throw new Error(limitMessage);
    offset += 46 + view.getUint16(offset + 28, true) + view.getUint16(offset + 30, true) + view.getUint16(offset + 32, true);
    if (offset > end) throw new Error('表格文件压缩目录无效');
  }
}

function makeOffsets(length: number, size: (index: number) => number) {
  const offsets = new Float64Array(length + 1);
  for (let index = 0; index < length; index++) offsets[index + 1] = offsets[index]! + size(index);
  return offsets;
}

export class SpreadsheetModel {
  readonly workbook: WorkBook;
  readonly sheets: SheetMetadata[];

  constructor(buffer: ArrayBuffer, fileName = '') {
    validateSpreadsheetBuffer(buffer, fileName);
    const isText = /\.(csv|tsv)$/i.test(fileName);
    let input: ArrayBuffer | string = buffer;
    if (isText) {
      const bytes = new Uint8Array(buffer);
      const encoding = bytes[0] === 0xff && bytes[1] === 0xfe ? 'utf-16le' : bytes[0] === 0xfe && bytes[1] === 0xff ? 'utf-16be' : 'utf-8';
      try { input = new TextDecoder(encoding, { fatal: true }).decode(buffer); }
      catch { input = new TextDecoder('gb18030').decode(buffer); }
    }
    this.workbook = read(input, { type: isText ? 'string' : 'array', raw: isText, cellStyles: true, cellFormula: true, cellHTML: false, cellText: true, cellNF: true });
    if (!this.workbook.SheetNames.length) throw new Error('文件没有可显示的工作表');
    if (this.workbook.SheetNames.length > SPREADSHEET_LIMITS.sheets) throw new Error(limitMessage);
    let totalRows = 0;
    let cells = 0;
    this.sheets = this.workbook.SheetNames.map((name, index) => {
      const sheet = this.workbook.Sheets[name]!;
      const range = sheet['!ref'] ? utils.decode_range(sheet['!ref']) : { s: { r: 0, c: 0 }, e: { r: 0, c: 0 } };
      const rows = range.e.r + 1;
      const columns = range.e.c + 1;
      totalRows += rows;
      if (rows > SPREADSHEET_LIMITS.rows || columns > SPREADSHEET_LIMITS.columns || totalRows > SPREADSHEET_LIMITS.totalRows || (sheet['!merges']?.length ?? 0) > SPREADSHEET_LIMITS.merges) throw new Error(limitMessage);
      for (const key in sheet) if (!key.startsWith('!') && ++cells > SPREADSHEET_LIMITS.cells) throw new Error(limitMessage);
      const metadata = {
        name, rows, columns,
        hidden: Boolean(this.workbook.Workbook?.Sheets?.[index]?.Hidden),
        rowOffsets: makeOffsets(rows, (row) => {
          const dimension = sheet['!rows']?.[row];
          return dimension?.hidden ? 0 : Math.min(160, Math.max(28, dimension?.hpx ?? (dimension?.hpt ? dimension.hpt * 4 / 3 : 28)));
        }),
        columnOffsets: makeOffsets(columns, (column) => {
          const dimension = sheet['!cols']?.[column];
          return dimension?.hidden ? 0 : Math.min(420, Math.max(72, dimension?.wpx ?? (dimension?.wch ? dimension.wch * 7 + 12 : 120)));
        }),
      };
      // Keep the complete scroll surface below browser layout limits even at 200% zoom.
      if (metadata.rowOffsets[rows]! > SPREADSHEET_LIMITS.canvasPixels || metadata.columnOffsets[columns]! > SPREADSHEET_LIMITS.canvasPixels) throw new Error(limitMessage);
      return metadata;
    });
    if (!isText) applySpreadsheetStyles(buffer, this.workbook);
  }

  viewport(request: ViewportRequest): PreviewCell[] {
    const meta = this.sheets[request.sheet];
    if (!meta) return [];
    const sheet = this.workbook.Sheets[meta.name]!;
    const firstRow = Math.max(0, request.firstRow);
    const lastRow = Math.min(meta.rows - 1, request.lastRow);
    const firstColumn = Math.max(0, request.firstColumn);
    const lastColumn = Math.min(meta.columns - 1, request.lastColumn);
    const visibleRows = visibleIndices(meta.rowOffsets, firstRow, lastRow);
    const visibleColumns = visibleIndices(meta.columnOffsets, firstColumn, lastColumn);
    if (visibleRows.length * visibleColumns.length > 10_000) throw new Error('显示区域过大，请提高缩放比例');
    const merged = (sheet['!merges'] ?? []).filter((range) => range.e.r >= firstRow && range.s.r <= lastRow && range.e.c >= firstColumn && range.s.c <= lastColumn);
    const covered = new Set<string>();
    const cells: PreviewCell[] = [];
    for (const range of merged) {
      cells.push(this.cell(sheet, range.s.r, range.s.c, range));
      for (const row of visibleRows) {
        if (row < range.s.r || row > range.e.r) continue;
        for (const column of visibleColumns) if (column >= range.s.c && column <= range.e.c) covered.add(`${row}:${column}`);
      }
    }
    for (const row of visibleRows) {
      for (const column of visibleColumns) {
        if (covered.has(`${row}:${column}`)) continue;
        cells.push(this.cell(sheet, row, column));
      }
    }
    return cells;
  }

  private cell(sheet: WorkSheet, row: number, column: number, merge?: Range): PreviewCell {
    const cell = sheet[utils.encode_cell({ r: row, c: column })] as CellObject | undefined;
    const color = cell?.s?.fgColor?.rgb as string | undefined;
    return {
      row, column, endRow: merge?.e.r ?? row, endColumn: merge?.e.c ?? column,
      text: cell?.w ?? (cell?.v === undefined ? (cell?.f ? '（公式无缓存值）' : '') : String(cell.v)),
      formula: cell?.f,
      numeric: cell?.t === 'n',
      background: color && /^(?:[0-9a-f]{6}|[0-9a-f]{8})$/i.test(color) ? `#${color.slice(-6)}` : undefined,
      style: (cell as (CellObject & { previewStyle?: Record<string, string> }) | undefined)?.previewStyle,
    };
  }
}
