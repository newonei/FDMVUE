export const fields = [
  ['seq', '序号'],
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
] as const;

export type Field = (typeof fields)[number][0];
type TextField = 'company' | 'department' | 'joined' | 'left' | 'name';
export type NumberField = Exclude<Field, TextField>;
export type PayrollRow = Record<NumberField, number> &
  Record<TextField, string> & { id: string };
export type PayrollBatch = {
  importedAt?: number;
  rows: PayrollRow[];
  source: string;
};

export const labels = Object.fromEntries(fields) as Record<Field, string>;
export const textFields: ReadonlySet<Field> = new Set<TextField>([
  'company',
  'department',
  'joined',
  'left',
  'name',
]);
export const statisticFields: ReadonlySet<Field> = new Set<Field>([
  'attendanceDays',
  'deductionDays',
  'performanceFactor',
  'seq',
  'sickDays',
  'tenure',
]);
export const employeesKey = (
  row: Pick<PayrollRow, 'company' | 'department' | 'name'>,
) => JSON.stringify([row.company, row.department, row.name]);

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
] as const;
export const deductionFields = [
  'priorPaid',
  'personalSocial',
  'personalFund',
  'tax',
  'otherDeduction',
] as const;
export const dateTime = (timestamp: number) =>
  new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(timestamp);
export function sum(rows: PayrollRow[], key: NumberField) {
  let total = 0;
  for (const row of rows) total += row[key];
  return total;
}
export function groupSum(rows: PayrollRow[], keys: readonly NumberField[]) {
  let total = 0;
  for (const row of rows) {
    for (const key of keys) total += row[key];
  }
  return total;
}
export const monthOffset = (month: string, offset: number) => {
  const date = new Date(`${month}-01T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + offset, 1);
  return date.toISOString().slice(0, 7);
};

const names =
  '林舒 许知远 沈晴 陆欣然 周逸 宋雅 郑思雨 江宁 罗昕 程舟 谢雨桐 韩予 何安 蔡然 方昕然 叶晨 苏昀 夏瑶 冯乐 卢妍 梁恬 顾铭 邱瑾 姚岚 唐晓 吴辰 杜欣 温宁 蒋怡 汪宁 徐青 董雅宁 袁清 贾悦 庄澄 易萌 金夕 廖兰 秦瑶 段禾 邓远 程意 柳妍 喻青 祁岚 曹安 谭野 马清 汤昕 姜雨 余雅 赵禾 俞杉 钟悦 裴舒 池昀 丁宁 唐远 卓言 辛兰 杨澄 许桐'.split(
    ' ',
  );
const departments = [
  ['电商运营部', 17, 6500],
  ['供应链部', 12, 6400],
  ['产品研发部', 10, 8100],
  ['市场品牌部', 9, 6800],
  ['综合管理部', 8, 6600],
  ['财务部', 6, 6900],
] as const;

export function sampleBatches(): Record<string, PayrollBatch> {
  return Object.fromEntries(
    [5, 6, 7, 8, 9, 10].map((month, monthIndex) => {
      let index = 0;
      const rows = departments.flatMap(([department, count, pay], group) => {
        const offset = index;
        index += count;
        return Array.from(
          { length: count - (month < 10 && group % 2 === 0 ? 1 : 0) },
          (_, i) => {
            const seq = offset + i + 1;
            const data = {
              seq,
              company: (i + group) % 4 === 0 ? '飞垫实业' : '飞岩电子商务',
              department,
              name: names[seq - 1]!,
              joined: `202${(seq % 5) + 1}-06-12`,
              left: '',
              tenure: seq % 4,
              base: (pay + (i % 5) * 340) * 100,
              grade: (900 + (seq % 6) * 320) * 100,
              tenurePay: (seq % 4) * 15_000,
              performanceBase: 160_000,
              performanceFactor: (85 + ((i * 7 + monthIndex * 17) % 47)) / 100,
              performance: 0,
              shiftAllowance: (seq % 4) * 18_000,
              otherAllowance: 24_000,
              attendanceDays: 22,
              sickDays: 0,
              deductionDays: seq % 17 === 0 ? 1 : 0,
              attendanceDeduction: seq % 17 === 0 ? -41_000 : 0,
              adjustment: 0,
              beeAward: seq % 11 === 0 ? 22_000 : 0,
              otherAddition: 0,
              bonus:
                [300, 440, 780, 650, 930, 1480][monthIndex]! * 100 +
                (seq % 3) * 15_000,
              commission: group === 0 ? (i % 8) * 26_000 : 0,
              priorBonus: 0,
              employerSocial: 99_000,
              employerFund: 45_000,
              gross: 0,
              priorPaid: 144_000,
              personalSocial: 42_880,
              personalFund: 45_000,
              tax: (90 + (seq % 8) * 34) * 100,
              otherDeduction: 0,
              net: 0,
            };
            data.performance = Math.round(
              data.performanceBase * data.performanceFactor,
            );
            const row = { ...data, id: employeesKey(data) };
            row.gross = 0;
            for (const { keys } of incomeGroups) {
              row.gross += groupSum([row], keys);
            }
            row.net = row.gross - groupSum([row], deductionFields);
            return row;
          },
        );
      });
      return [
        `2026-${String(month).padStart(2, '0')}`,
        { rows, source: '演示数据' },
      ];
    }),
  );
}

export type EmployeeSlip = {
  company: string;
  department: string;
  month: string;
  name: string;
  net: number;
  sections: {
    items: { label: string; note?: string; value: number }[];
    title: string;
    total?: number;
  }[];
};

export function employeeSlip(month: string, row: PayrollRow): EmployeeSlip {
  const income = incomeGroups
    .flatMap(({ keys }) => [...keys])
    .filter((key) => key !== 'employerSocial' && key !== 'employerFund');
  const items = (keys: readonly NumberField[]) =>
    keys
      .filter((key) => row[key] !== 0)
      .map((key) => ({
        label: labels[key],
        value: row[key],
        note:
          key === 'priorPaid' && row.employerSocial + row.employerFund !== 0
            ? '按工资表口径含单位缴费'
            : undefined,
      }));
  const employer = ['employerSocial', 'employerFund'] as const;
  return {
    month,
    name: row.name,
    department: row.department,
    company: row.company,
    net: row.net,
    sections: [
      {
        title: '应发项目',
        total: row.gross,
        items: items([...income, ...employer]),
      },
      {
        title: '应发至实发扣减',
        total: groupSum([row], deductionFields),
        items: items(deductionFields),
      },
    ],
  };
}
