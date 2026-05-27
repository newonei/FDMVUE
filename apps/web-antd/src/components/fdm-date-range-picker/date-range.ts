import dayjs from 'dayjs';
import isoWeek from 'dayjs/plugin/isoWeek';

dayjs.extend(isoWeek);

export type FdmDateRange = [string, string];

export interface FdmDateRangePreset {
  getRange: () => FdmDateRange;
  key: string;
  label: string;
}

export interface FdmDateRangeGroup {
  label: string;
  presets: FdmDateRangePreset[];
}

export const FDM_DATE_FORMAT = 'YYYY-MM-DD';

function formatRange(start: dayjs.Dayjs, end: dayjs.Dayjs): FdmDateRange {
  return [start.format(FDM_DATE_FORMAT), end.format(FDM_DATE_FORMAT)];
}

function quarterStart(base: dayjs.Dayjs) {
  return base.month(Math.floor(base.month() / 3) * 3).startOf('month');
}

function quarterEnd(base: dayjs.Dayjs) {
  return quarterStart(base).add(2, 'month').endOf('month');
}

export function getYesterdayDateRange(): FdmDateRange {
  const yesterday = dayjs().subtract(1, 'day');
  return formatRange(yesterday, yesterday);
}

export function normalizeDateRange(
  value?: Array<unknown> | null,
): FdmDateRange | undefined {
  if (!Array.isArray(value) || value.length < 2 || !value[0] || !value[1]) {
    return undefined;
  }
  const start = dayjs(value[0] as dayjs.ConfigType);
  const end = dayjs(value[1] as dayjs.ConfigType);
  if (!start.isValid() || !end.isValid()) return undefined;
  return formatRange(start, end);
}

export function getDateRangeDays(value?: FdmDateRange): number {
  if (!value) return 0;
  const start = dayjs(value[0]);
  const end = dayjs(value[1]);
  if (!start.isValid() || !end.isValid()) return 0;
  return Math.max(0, end.diff(start, 'day') + 1);
}

export const FDM_DATE_RANGE_GROUPS: FdmDateRangeGroup[] = [
  {
    label: '天',
    presets: [
      {
        key: 'today',
        label: '今天',
        getRange: () => formatRange(dayjs(), dayjs()),
      },
      {
        key: 'yesterday',
        label: '昨天',
        getRange: getYesterdayDateRange,
      },
    ],
  },
  {
    label: '周',
    presets: [
      {
        key: 'thisWeek',
        label: '本周',
        getRange: () =>
          formatRange(dayjs().startOf('isoWeek'), dayjs().endOf('isoWeek')),
      },
      {
        key: 'lastWeek',
        label: '上周',
        getRange: () =>
          formatRange(
            dayjs().subtract(1, 'week').startOf('isoWeek'),
            dayjs().subtract(1, 'week').endOf('isoWeek'),
          ),
      },
    ],
  },
  {
    label: '月',
    presets: [
      {
        key: 'thisMonth',
        label: '本月',
        getRange: () =>
          formatRange(dayjs().startOf('month'), dayjs().endOf('month')),
      },
      {
        key: 'lastMonth',
        label: '上月',
        getRange: () =>
          formatRange(
            dayjs().subtract(1, 'month').startOf('month'),
            dayjs().subtract(1, 'month').endOf('month'),
          ),
      },
    ],
  },
  {
    label: '季度',
    presets: [
      {
        key: 'thisQuarter',
        label: '本季度',
        getRange: () => formatRange(quarterStart(dayjs()), quarterEnd(dayjs())),
      },
      {
        key: 'lastQuarter',
        label: '上季度',
        getRange: () => {
          const base = dayjs().subtract(3, 'month');
          return formatRange(quarterStart(base), quarterEnd(base));
        },
      },
    ],
  },
  {
    label: '年度',
    presets: [
      {
        key: 'thisYear',
        label: '本年',
        getRange: () =>
          formatRange(dayjs().startOf('year'), dayjs().endOf('year')),
      },
      {
        key: 'lastYear',
        label: '上年',
        getRange: () =>
          formatRange(
            dayjs().subtract(1, 'year').startOf('year'),
            dayjs().subtract(1, 'year').endOf('year'),
          ),
      },
    ],
  },
];

export function findDateRangePreset(
  value?: FdmDateRange,
): FdmDateRangePreset | undefined {
  if (!value) return undefined;
  return FDM_DATE_RANGE_GROUPS.flatMap((group) => group.presets).find(
    (preset) => {
      const range = preset.getRange();
      return range[0] === value[0] && range[1] === value[1];
    },
  );
}
