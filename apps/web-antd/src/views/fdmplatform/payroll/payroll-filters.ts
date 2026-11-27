import { monthOffset, validMonth } from './model';

export interface PayrollFilters {
  employeeName: string;
  endMonth: string;
  startMonth: string;
}

export type PayrollPeriodMode = 'month' | 'quarter' | 'range' | 'year';

export interface PayrollPeriodDraft {
  endMonth: string;
  mode: PayrollPeriodMode;
  month: string;
  quarter: number;
  startMonth: string;
  year: number;
}

export const minimumPayrollMonth = '2000-01';

type PayrollMonthRange = Pick<PayrollFilters, 'endMonth' | 'startMonth'>;

export function quarterOf(month: string) {
  return Math.ceil(Number(month.slice(5)) / 3);
}

export function payrollMonthRange(
  period: PayrollPeriodDraft,
  maximumMonth: string,
): PayrollMonthRange {
  switch (period.mode) {
    case 'month': {
      return { endMonth: period.month, startMonth: period.month };
    }
    case 'quarter':
    case 'year': {
      const firstMonth =
        period.mode === 'year' ? 1 : (period.quarter - 1) * 3 + 1;
      const startMonth = `${period.year}-${String(firstMonth).padStart(2, '0')}`;
      const lastMonth = monthOffset(
        startMonth,
        period.mode === 'year' ? 11 : 2,
      );
      return {
        endMonth: lastMonth > maximumMonth ? maximumMonth : lastMonth,
        startMonth,
      };
    }
    case 'range': {
      return { endMonth: period.endMonth, startMonth: period.startMonth };
    }
  }
}

export function payrollRangeError(
  { endMonth, startMonth }: PayrollMonthRange,
  maximumMonth: string,
) {
  if (!validMonth(startMonth) || !validMonth(endMonth)) {
    return '请选择有效的工资月份。';
  }
  if (startMonth < minimumPayrollMonth || endMonth > maximumMonth) {
    return '工资月份须在 2000 年 1 月至当前月之间。';
  }
  if (startMonth > endMonth) {
    return '开始月份须早于或等于结束月份。';
  }
  if (endMonth > monthOffset(startMonth, 119)) {
    return '一次最多查询 120 个月。';
  }
  return '';
}

export function payrollPeriodDraft(
  { endMonth, startMonth }: PayrollMonthRange,
  maximumMonth: string,
): PayrollPeriodDraft {
  const draft: PayrollPeriodDraft = {
    endMonth,
    mode: 'range',
    month: endMonth,
    quarter: quarterOf(startMonth),
    startMonth,
    year: Number(startMonth.slice(0, 4)),
  };
  if (startMonth === endMonth) {
    return { ...draft, mode: 'month' };
  }

  for (const mode of ['year', 'quarter'] as const) {
    const range = payrollMonthRange({ ...draft, mode }, maximumMonth);
    if (range.startMonth === startMonth && range.endMonth === endMonth) {
      return { ...draft, mode };
    }
  }
  return draft;
}
