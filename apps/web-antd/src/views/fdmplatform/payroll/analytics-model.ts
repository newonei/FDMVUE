import type {
  PayrollDepartmentMonth,
  PayrollEmployeeMonth,
  PayrollIncome,
  PayrollMonthlyAnalytics,
  PayrollMonthlyTotals,
} from '#/api/fdmplatform/payroll';

import { incomeGroups } from './model';

export type AnalyticsView = 'cost' | 'departments' | 'employee' | 'overall';
export type CostMetric = 'cashGross' | 'gross' | 'net';

export const costMetrics: Record<CostMetric, string> = {
  cashGross: '应发工资（扣除单位缴费）',
  gross: '工资表人力成本',
  net: '实发工资',
};

export const calendarMonths = Array.from({ length: 12 }, (_, index) => {
  const number = index + 1;
  return { key: String(number).padStart(2, '0'), label: `${number}月` };
});

export function yearList(start: number, end: number) {
  return Array.from(
    { length: Math.max(0, end - start + 1) },
    (_, index) => start + index,
  );
}

export function reportPeriod(startMonth: string, endMonth: string) {
  const years = yearList(
    Number(startMonth.slice(0, 4)),
    Number(endMonth.slice(0, 4)),
  );
  const months = years
    .flatMap((year) => calendarMonths.map(({ key }) => `${year}-${key}`))
    .filter((month) => month >= startMonth && month <= endMonth);
  const monthKeys = new Set(months.map((month) => month.slice(5)));
  const comparisonMonths = calendarMonths.filter(({ key }) =>
    monthKeys.has(key),
  );
  return { comparisonMonths, months, years };
}

export function yearsWithMonths(months: string[]) {
  return [
    ...new Set(months.map((month) => Number(month.slice(0, 4)))),
  ].toSorted((a, b) => b - a);
}

export function employeeAnalytics(
  rows: PayrollEmployeeMonth[],
): PayrollMonthlyAnalytics[] {
  return rows.map(({ month, row }) => ({
    gross: row.gross,
    income: row,
    month,
    net: row.net,
    people: 1,
  }));
}

export function employerContribution(income: PayrollIncome) {
  return (income.employerSocial ?? 0) + (income.employerFund ?? 0);
}

export function amount(row: PayrollMonthlyAnalytics, metric: CostMetric) {
  return metric === 'cashGross'
    ? row.gross - employerContribution(row.income)
    : row[metric];
}

export function summarize(rows: PayrollMonthlyAnalytics[]) {
  const result = {
    gross: 0,
    income: {} as PayrollIncome,
    months: rows.length,
    net: 0,
    people: 0,
  };
  for (const row of rows) {
    result.gross += row.gross;
    result.net += row.net;
    result.people += row.people;
    for (const { keys } of incomeGroups) {
      for (const key of keys) {
        result.income[key] = (result.income[key] ?? 0) + (row.income[key] ?? 0);
      }
    }
  }
  return result;
}

export function annualAnalytics(rows: PayrollMonthlyAnalytics[]) {
  return yearsWithMonths(rows.map(({ month }) => month)).map((year) => ({
    ...summarize(rows.filter(({ month }) => month.startsWith(String(year)))),
    month: String(year),
    year,
  }));
}

export function average(value: number, count: number) {
  return count > 0 ? Math.round(value / count) : null;
}

export function departmentTotals(rows: PayrollDepartmentMonth[]) {
  const departments = new Map<
    string,
    Pick<
      PayrollDepartmentMonth,
      'company' | 'department' | 'gross' | 'net' | 'people' | 'region'
    > & {
      key: string;
      months: number;
    }
  >();
  for (const row of rows) {
    const key = JSON.stringify([row.region ?? '', row.company, row.department]);
    const item = departments.get(key);
    if (item) {
      item.gross += row.gross;
      item.net += row.net;
      item.people += row.people;
      item.months++;
    } else {
      departments.set(key, { ...row, key, months: 1 });
    }
  }
  return [...departments.values()].toSorted(
    (a, b) => b.gross - a.gross || a.key.localeCompare(b.key, 'zh-CN'),
  );
}

export function monthChange(
  row: PayrollMonthlyTotals,
  previous?: PayrollMonthlyTotals,
) {
  return previous && previous.gross !== 0
    ? (row.gross - previous.gross) / Math.abs(previous.gross)
    : null;
}
