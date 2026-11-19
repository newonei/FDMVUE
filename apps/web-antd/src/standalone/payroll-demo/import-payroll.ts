import type { CellObject, WorkSheet } from 'xlsx';

import type { Field, NumberField, PayrollRow } from './model';

import {
  deductionFields,
  employeesKey,
  fields,
  groupSum,
  incomeGroups,
  labels,
  statisticFields,
  textFields,
} from './model';

const normalize = (text: string) =>
  text.normalize('NFKC').replaceAll(/\s+/g, '');
const text = (cell?: CellObject) =>
  cell?.v === undefined || cell?.v === null ? '' : String(cell.v).trim();
const amountFields = fields.filter(([key]) => !textFields.has(key));

export type ImportPreview = {
  errors: string[];
  rows: PayrollRow[];
  sheet: string;
};

export async function parsePayroll(
  file: File,
  month: string,
): Promise<ImportPreview> {
  if (!/\.xlsx$/i.test(file.name) || file.size > 5 * 1024 * 1024) {
    throw new Error('请选择 5 MB 以内的 .xlsx 工资表。');
  }
  const { read, utils } = await import('xlsx');
  const book = read(await file.arrayBuffer(), {
    cellDates: true,
    sheetRows: 5004,
    sheetStubs: true,
  });
  const rows: PayrollRow[] = [];
  const errors: string[] = [];
  const matchingSheets: { name: string; sheet: WorkSheet }[] = [];
  for (const name of book.SheetNames) {
    const sheet = book.Sheets[name];
    if (!sheet) continue;
    if (
      fields.every(
        ([, label], column) =>
          normalize(text(sheet[utils.encode_cell({ c: column, r: 2 })])) ===
          normalize(label),
      )
    ) {
      matchingSheets.push({ name, sheet });
    }
  }
  if (matchingSheets.length !== 1)
    throw new Error(
      matchingSheets.length > 1
        ? '工作簿包含多个工资表，请保留本次需要导入的工作表。'
        : '未找到工资表模板的第 3 行表头。请保留原始列及顺序。',
    );
  const { name, sheet } = matchingSheets[0]!;
  const period = /(20\d{2})\s*年\s*(\d{1,2})\s*月/.exec(text(sheet.A1));
  if (period && `${period[1]}-${period[2]!.padStart(2, '0')}` !== month) {
    throw new Error('表格标题中的月份与导入月份不一致。请调整月份后重试。');
  }
  const end = utils.decode_range(sheet['!fullref'] ?? sheet['!ref'] ?? 'A1').e
    .r;
  if (end > 5002) throw new Error('单次支持最多 5,000 行表格，请精简后导入。');

  const seen = new Set<string>();
  for (let rowIndex = 3; rowIndex <= end; rowIndex++) {
    const cells = Object.fromEntries(
      fields.map(([key], c) => [
        key,
        sheet[utils.encode_cell({ c, r: rowIndex })],
      ]),
    ) as Partial<Record<Field, CellObject>>;
    const company = text(cells.company);
    const department = text(cells.department);
    const person = text(cells.name);
    // The source template ends with totals in column B and empty C/D.
    if (
      !person &&
      !department &&
      (/(?:小计|合计|汇总|总计)$/.test(company) ||
        (!company && !text(cells.gross) && !text(cells.net)))
    )
      continue;
    const location = `第 ${rowIndex + 1} 行`;
    if (!company || !department || !person) {
      errors.push(`${location}缺少所属公司、部门或姓名。`);
      continue;
    }
    const date = (cell?: CellObject) =>
      cell?.v instanceof Date ? cell.v.toISOString().slice(0, 10) : text(cell);
    const identity = {
      company,
      department,
      name: person,
      joined: date(cells.joined),
      left: date(cells.left),
    };
    const id = employeesKey(identity);
    if (seen.has(id)) {
      errors.push(`${location}有同公司、同部门、同名记录，请先核对。`);
      continue;
    }
    seen.add(id);
    const numbers: Partial<Record<NumberField, number>> = {};
    const invalid: string[] = [];
    for (const [field] of amountFields) {
      const key = field as NumberField;
      const cell = cells[key];
      const raw = text(cell);
      const cleaned = raw.replaceAll(/[¥￥,，\s]/g, '');
      const value =
        raw.endsWith('%') && key === 'performanceFactor'
          ? Number(cleaned.slice(0, -1)) / 100
          : Number(cleaned);
      const required = key === 'gross' || key === 'net' || Boolean(cell?.f);
      if (
        cell?.t === 'e' ||
        cell?.t === 'd' ||
        cell?.t === 'b' ||
        (!cleaned && (required || raw)) ||
        !Number.isFinite(value) ||
        Math.abs(value) > 1e9
      ) {
        invalid.push(labels[key]);
      } else {
        numbers[key] = statisticFields.has(key)
          ? value
          : Math.round(Math.abs(value) * 100 + 1e-6) * Math.sign(value);
      }
    }
    if (invalid.length > 0) {
      errors.push(
        `${location}的「${invalid.join('、')}」缺少有效数值。请在 Excel 中重新计算并保存。`,
      );
      continue;
    }
    const row = { ...identity, ...numbers, id } as PayrollRow;
    const gross = incomeGroups.reduce(
      (total, { keys }) => total + groupSum([row], keys),
      0,
    );
    if (Math.abs(row.gross - gross) > 5) {
      errors.push(`${location}的应发合计与工资项目不一致。`);
      continue;
    }
    if (Math.abs(row.gross - groupSum([row], deductionFields) - row.net) > 2) {
      errors.push(`${location}的应发合计、扣减项目与实发数不一致。`);
      continue;
    }
    rows.push(row);
  }
  if (rows.length === 0 && errors.length === 0)
    errors.push('表格里没有可导入的员工明细。');
  return { rows, errors, sheet: name };
}

export async function downloadTemplate(month: string) {
  const { utils, writeFile } = await import('xlsx');
  const book = utils.book_new();
  const title = `工资核算表 · ${month.slice(0, 4)}年${Number(month.slice(5))}月`;
  const sheet = utils.aoa_to_sheet([
    [title],
    [],
    fields.map(([, label]) => label),
  ]);
  sheet['!merges'] = [utils.decode_range('A1:AH2')];
  sheet['!cols'] = fields.map(([, label]) => ({
    wch: Math.max(13, label.length * 2 + 2),
  }));
  utils.book_append_sheet(book, sheet, '工资核算表');
  writeFile(book, '工资表空白模板.xlsx');
}
