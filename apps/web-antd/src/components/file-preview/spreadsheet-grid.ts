export interface SheetMetadata {
  name: string;
  rows: number;
  columns: number;
  rowOffsets: Float64Array;
  columnOffsets: Float64Array;
  hidden: boolean;
}

export interface PreviewCell {
  row: number;
  column: number;
  endRow: number;
  endColumn: number;
  text: string;
  formula?: string;
  numeric: boolean;
  background?: string;
  style?: Record<string, string>;
}

export interface ViewportRequest {
  type: 'viewport';
  id: number;
  sheet: number;
  firstRow: number;
  lastRow: number;
  firstColumn: number;
  lastColumn: number;
}

/** Find the visible coordinate without walking through a large worksheet. */
export function offsetIndex(offsets: Float64Array, position: number) {
  let low = 0;
  let high = Math.max(0, offsets.length - 2);
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if ((offsets[middle] ?? 0) <= position) low = middle;
    else high = middle - 1;
  }
  return low;
}

export function columnLabel(column: number) {
  let result = '';
  for (let value = column + 1; value > 0; value = Math.floor((value - 1) / 26)) {
    result = String.fromCharCode(65 + ((value - 1) % 26)) + result;
  }
  return result;
}

export function visibleIndices(offsets: Float64Array, first: number, last: number) {
  const result: number[] = [];
  for (let index = first; index <= last; index++) {
    if (offsets[index] !== offsets[index + 1]) result.push(index);
  }
  return result;
}

export const SPREADSHEET_LIMITS = {
  fileBytes: 25 * 1024 * 1024,
  xlsxFileBytes: 50 * 1024 * 1024,
  expandedBytes: 128 * 1024 * 1024,
  cells: 1_000_000,
  rows: 200_000,
  columns: 2048,
  sheets: 100,
  totalRows: 500_000,
  merges: 20_000,
  canvasPixels: 8_000_000,
  parseMilliseconds: 15_000,
} as const;

export function spreadsheetFileLimit(fileName: string) {
  return /\.xlsx$/i.test(fileName)
    ? SPREADSHEET_LIMITS.xlsxFileBytes
    : SPREADSHEET_LIMITS.fileBytes;
}
