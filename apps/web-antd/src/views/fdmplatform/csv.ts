export interface ImportRow {
  type: string;
  name: string;
  code: string;
  externalId: string;
  specification?: string;
  unit?: string;
}

/** Parse CSV quotes and embedded line breaks without altering source identifiers. */
export function parseMasterCsv(input: string): ImportRow[] {
  const source = input.replace(/^\uFEFF/, '');
  const matrix: string[][] = [];
  let row: string[] = [];
  let value = '';
  let quoted = false;
  let closedQuote = false;
  const pushValue = () => {
    row.push(value);
    value = '';
    closedQuote = false;
  };
  const pushRow = () => {
    pushValue();
    if (row.some((entry) => entry.trim())) matrix.push(row);
    row = [];
  };
  for (let index = 0; index < source.length; index++) {
    const char = source[index];
    if (quoted) {
      if (char === '"') {
        if (source[index + 1] === '"') {
          value += '"';
          index++;
        } else {
          quoted = false;
          closedQuote = true;
        }
      } else value += char;
    } else if (char === '"') {
      if (value || closedQuote)
        throw new Error('CSV 引号位置不正确，请从原系统重新导出');
      quoted = true;
    } else if (char === ',') pushValue();
    else if (char === '\n' || char === '\r') {
      if (char === '\r' && source[index + 1] === '\n') index++;
      pushRow();
    } else {
      if (closedQuote) {
        if (char?.trim()) throw new Error('CSV 引号闭合后存在无效字符');
      } else value += char;
    }
  }
  if (quoted) throw new Error('CSV 存在未闭合引号');
  if (row.length > 0 || value) pushRow();
  const headers = matrix.shift()?.map((header) => header.trim());
  if (!headers) throw new Error('文件为空');
  const allowedHeaders = new Set([
    'code',
    'externalId',
    'name',
    'specification',
    'type',
    'unit',
  ]);
  if (
    new Set(headers).size !== headers.length ||
    headers.some((header) => !allowedHeaders.has(header))
  )
    throw new Error('表头重复或不支持，请使用页面提供的标准表头');
  if (
    ['type', 'name', 'code', 'externalId'].some((key) => !headers.includes(key))
  )
    throw new Error('CSV 必须包含 type、name、code、externalId 四个表头');
  if (matrix.length === 0 || matrix.length > 200)
    throw new Error('每批需包含 1 至 200 条主数据记录');
  return matrix.map((cells, index) => {
    if (cells.length !== headers.length)
      throw new Error(`第 ${index + 2} 行字段数量与表头不一致`);
    const record = Object.fromEntries(
      headers.map((key, column) => [key, cells[column]?.trim() ?? '']),
    );
    for (const key of ['type', 'name', 'code', 'externalId'])
      if (!record[key]) throw new Error(`第 ${index + 2} 行的 ${key} 不能为空`);
    if (record.type === 'CUSTOMER')
      throw new Error(
        '客户请在客户中心创建或从 OKKI 回填，编号由系统生成且国家 / 地区必填',
      );
    if (!['SKU', 'STOCK_OWNER', 'SUPPLIER', 'WAREHOUSE'].includes(record.type!))
      throw new Error(`第 ${index + 2} 行主数据类型无效`);
    return record as unknown as ImportRow;
  });
}
