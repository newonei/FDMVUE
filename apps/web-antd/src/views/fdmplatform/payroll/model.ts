import type {
  PayrollAmountField,
  PayrollDelivery,
  PayrollDeliveryStatus,
  PayrollStatisticField,
  PayrollTextField,
  PayrollValues,
} from '#/api/fdmplatform/payroll';

export const fields = [
  ['seq', '序号'],
  ['region', '所属区域'],
  ['company', '所属公司'],
  ['department', '部门'],
  ['name', '姓名'],
  ['joined', '入职时间'],
  ['left', '中止时间'],
  ['tenure', '工龄（年）'],
  ['base', '基础工资'],
  ['grade', '职级工资'],
  ['tenurePay', '工龄奖'],
  ['performanceBase', '绩效基数'],
  ['performanceFactor', '绩效系数'],
  ['performance', '绩效工资'],
  ['shiftAllowance', '岗位工时补贴'],
  ['otherAllowance', '其他补贴'],
  ['attendanceDays', '应出勤天数'],
  ['sickDays', '病假天数'],
  ['deductionDays', '扣款天数'],
  ['attendanceDeduction', '考勤扣款'],
  ['adjustment', '异动差额'],
  ['beeAward', '蜜蜂奖'],
  ['otherAddition', '其他应加'],
  ['bonus', '奖金'],
  ['commission', '提成'],
  ['priorBonus', '前期奖金'],
  ['employerSocial', '社保-公司部分'],
  ['employerFund', '公积金-公司部分'],
  ['gross', '应发合计'],
  ['priorPaid', '前期已发'],
  ['personalSocial', '社保-个人部分'],
  ['personalFund', '公积金-个人部分'],
  ['tax', '个税'],
  ['otherDeduction', '其他扣款'],
  ['net', '实发数'],
] as const satisfies ReadonlyArray<readonly [keyof PayrollValues, string]>;

const textFields = new Set<keyof PayrollValues>([
  'company',
  'department',
  'joined',
  'left',
  'name',
] satisfies PayrollTextField[]);
const statisticFields = new Set<keyof PayrollValues>([
  'seq',
  'tenure',
  'performanceFactor',
  'attendanceDays',
  'sickDays',
  'deductionDays',
] satisfies PayrollStatisticField[]);

export const incomeGroups = [
  { title: '固定薪酬', color: '#70435d', keys: ['base', 'grade', 'tenurePay'] },
  {
    title: '绩效与奖金',
    color: '#b38198',
    keys: ['performance', 'beeAward', 'bonus', 'commission', 'priorBonus'],
  },
  {
    title: '津贴及其他',
    color: '#666f8b',
    keys: ['shiftAllowance', 'otherAllowance', 'adjustment', 'otherAddition'],
  },
  {
    title: '单位缴费',
    color: '#a6b4a5',
    keys: ['employerSocial', 'employerFund'],
  },
  { title: '考勤扣款', color: '#b48262', keys: ['attendanceDeduction'] },
] as const satisfies ReadonlyArray<{
  color: string;
  keys: readonly PayrollAmountField[];
  title: string;
}>;

export const deductionFields = [
  'priorPaid',
  'personalSocial',
  'personalFund',
  'tax',
  'otherDeduction',
] as const;

export const statusLabels = {
  ACCEPTED: '钉钉已受理',
  DELIVERED: '钉钉已送达',
  EXPIRED: '已到期',
  FAILED: '发送失败',
  PENDING: '待发送',
  QUEUED: '已排队',
  REVOKED: '已失效',
  SENDING: '发送中',
  UNCERTAIN: '待核实',
  VIEWED: '已查看',
} satisfies Record<'PENDING' | PayrollDeliveryStatus, string>;

const moneyFormat = new Intl.NumberFormat('zh-CN', {
  currency: 'CNY',
  currencyDisplay: 'narrowSymbol',
  style: 'currency',
});

const timeFormat = new Intl.DateTimeFormat('zh-CN', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Asia/Shanghai',
});

export const currency = (cents: number) => moneyFormat.format(cents / 100);
export const shortMonth = (month: string) => `${Number(month.slice(5))}月`;
export const monthLabel = (month: string) =>
  `${month.slice(0, 4)}年${shortMonth(month)}`;
export const validMonth = (month: string) =>
  /^20\d{2}-(0[1-9]|1[0-2])$/.test(month);

export function currentMonth() {
  const date = new Date();
  const parts = new Intl.DateTimeFormat('en', {
    month: '2-digit',
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
  }).formatToParts(date);
  return `${parts.find(({ type }) => type === 'year')!.value}-${
    parts.find(({ type }) => type === 'month')!.value
  }`;
}

export function monthOffset(month: string, offset: number) {
  const date = new Date(`${month}-01T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + offset, 1);
  return date.toISOString().slice(0, 7);
}

export function dateTime(timestamp?: number | string) {
  if (timestamp === undefined || timestamp === null || timestamp === '')
    return '—';
  const value =
    typeof timestamp === 'string' && !/^\d+$/.test(timestamp)
      ? Date.parse(timestamp)
      : Number(timestamp);
  return Number.isFinite(value) ? timeFormat.format(value) : '—';
}

export function total(
  rows: readonly PayrollValues[],
  keys: readonly PayrollAmountField[],
) {
  return rows.reduce(
    (sum, row) =>
      sum + keys.reduce((amount, key) => amount + Number(row[key] ?? 0), 0),
    0,
  );
}

export function fieldValue(row: PayrollValues, key: keyof PayrollValues) {
  const value = row[key];
  if (value === '' || value === null || value === undefined) return '—';
  if (key === 'performanceFactor')
    return `${(Number(row[key]) * 100).toLocaleString('zh-CN', {
      maximumFractionDigits: 2,
    })}%`;
  if (key === 'region' || textFields.has(key) || statisticFields.has(key))
    return String(value);
  return currency(Number(value));
}

export function latestDeliveries(deliveries: PayrollDelivery[]) {
  const entries = new Map<string, PayrollDelivery>();
  for (const item of deliveries) {
    if (!entries.has(item.rowId)) entries.set(item.rowId, item);
  }
  return entries;
}

export async function downloadBlankTemplate(month: string) {
  const { utils, writeFile } = await import('xlsx');
  const workbook = utils.book_new();
  const sheet = utils.aoa_to_sheet([
    [`${monthLabel(month)}工资核算表`],
    [],
    fields.map(([, label]) => label),
  ]);
  sheet['!merges'] = [{ s: { c: 0, r: 0 }, e: { c: fields.length - 1, r: 1 } }];
  sheet['!cols'] = fields.map(([, label]) => ({
    wch: Math.max(13, label.length * 2 + 2),
  }));
  utils.book_append_sheet(workbook, sheet, '工资核算表');
  writeFile(workbook, '工资表空白模板.xlsx');
}
