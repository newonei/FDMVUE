import type { ECOption } from '@vben/plugins/echarts';

import type { JixiaoDashboardApi } from '#/api/fdmperformance/dashboard';

export const DASHBOARD_GRADE_ORDER = ['A+', 'A', 'B', 'C+', 'C'] as const;

export const DASHBOARD_GRADE_COLORS: Record<string, string> = {
  'A+': '#15803d',
  A: '#22a06b',
  B: '#1677ff',
  'C+': '#f59e0b',
  C: '#ef4444',
};

const TOOLTIP_TEXT_STYLE = {
  color: '#182230',
  fontSize: 12,
};

export function emptyChartOption(text = '当前筛选暂无已公示绩效结果') {
  return {
    title: {
      left: 'center',
      text,
      textStyle: { color: '#94a3b8', fontSize: 13, fontWeight: 'normal' },
      top: 'middle',
    },
  } as unknown as ECOption;
}

function percent(value?: number) {
  return Number.isFinite(value) ? `${((value || 0) * 100).toFixed(1)}%` : '-';
}

function gradeRows(details: JixiaoDashboardApi.GradeCount[]) {
  const byGrade = new Map(details.map((item) => [item.grade, item]));
  return DASHBOARD_GRADE_ORDER.map((grade) => {
    const item = byGrade.get(grade);
    return {
      count: item?.count || 0,
      grade,
      rate: item?.rate || 0,
    };
  });
}

export function createGradeDistributionOption(
  details: JixiaoDashboardApi.GradeCount[],
) {
  const rows = gradeRows(details);
  if (rows.every((row) => row.count === 0)) {
    return emptyChartOption();
  }
  return {
    color: DASHBOARD_GRADE_ORDER.map((grade) => DASHBOARD_GRADE_COLORS[grade]),
    grid: { bottom: 18, left: 12, right: 12, top: 30 },
    legend: {
      data: DASHBOARD_GRADE_ORDER,
      itemHeight: 8,
      itemWidth: 8,
      textStyle: { color: '#475569', fontSize: 12 },
      top: 0,
    },
    tooltip: {
      axisPointer: { type: 'shadow' },
      formatter: (params: unknown) => {
        const rowsForTooltip = Array.isArray(params) ? params : [];
        return rowsForTooltip
          .map((item) => {
            const point = item as { marker?: string; seriesName?: string };
            const grade = point.seriesName || '';
            const row = rows.find((value) => value.grade === grade);
            return `${point.marker || ''}${grade}: ${row?.count || 0} 结果人次 (${percent(row?.rate)})`;
          })
          .join('<br/>');
      },
      textStyle: TOOLTIP_TEXT_STYLE,
    },
    xAxis: {
      axisLabel: { formatter: '{value}%', color: '#64748b' },
      axisLine: { show: false },
      axisTick: { show: false },
      max: 100,
      splitLine: { lineStyle: { color: '#edf0f4' } },
      type: 'value',
    },
    yAxis: {
      axisLine: { show: false },
      axisTick: { show: false },
      data: ['绩效结果人次'],
      type: 'category',
    },
    series: rows.map((row) => ({
      barWidth: 36,
      data: [Number((row.rate * 100).toFixed(2))],
      label: {
        color: '#ffffff',
        formatter: row.count > 0 ? `${row.grade} ${row.count}` : '',
        show: row.count > 0,
      },
      name: row.grade,
      stack: 'grade',
      type: 'bar',
    })),
  } as unknown as ECOption;
}

export function createPerformanceTrendOption(
  trends: JixiaoDashboardApi.PeriodTrend[],
) {
  if (trends.length === 0) {
    return emptyChartOption();
  }
  const sorted = [...trends].toSorted((left, right) =>
    left.periodKey.localeCompare(right.periodKey),
  );
  const dataByGrade = {
    'A+': sorted.map((item) => item.aplusCount || 0),
    A: sorted.map((item) => item.aCount || 0),
    B: sorted.map((item) => item.bCount || 0),
    'C+': sorted.map((item) => item.cplusCount || 0),
    C: sorted.map((item) => item.cCount || 0),
  };
  return {
    color: [
      ...DASHBOARD_GRADE_ORDER.map((grade) => DASHBOARD_GRADE_COLORS[grade]),
      '#475569',
    ],
    grid: { bottom: 30, left: 34, right: 42, top: 38 },
    legend: {
      data: [...DASHBOARD_GRADE_ORDER, '平均分'],
      itemHeight: 8,
      itemWidth: 8,
      textStyle: { color: '#475569', fontSize: 12 },
      top: 0,
    },
    tooltip: {
      axisPointer: { type: 'shadow' },
      formatter: (params: unknown) => {
        const points = Array.isArray(params) ? params : [];
        const periodIndex = Number(
          (points[0] as undefined | { dataIndex?: number })?.dataIndex || 0,
        );
        const trend = sorted[periodIndex];
        const lines = [
          `<strong>${trend?.periodLabel || ''}</strong>`,
          `结果人次: ${trend?.resultCount || 0}`,
          `去重员工: ${trend?.employeeCount || 0}`,
        ];
        points.forEach((point) => {
          const item = point as {
            marker?: string;
            seriesName?: string;
            value?: number;
          };
          lines.push(`${item.marker || ''}${item.seriesName || ''}: ${item.value ?? '-'}`);
        });
        return lines.join('<br/>');
      },
      textStyle: TOOLTIP_TEXT_STYLE,
    },
    xAxis: {
      axisLabel: { color: '#64748b', fontSize: 12 },
      axisLine: { lineStyle: { color: '#d9dee7' } },
      data: sorted.map((item) => item.periodLabel),
      type: 'category',
    },
    yAxis: [
      {
        axisLabel: { color: '#64748b' },
        name: '结果人次',
        nameTextStyle: { color: '#64748b' },
        splitLine: { lineStyle: { color: '#edf0f4' } },
        type: 'value',
      },
      {
        axisLabel: { color: '#64748b' },
        max: 120,
        min: 0,
        name: '平均分',
        nameTextStyle: { color: '#64748b' },
        splitLine: { show: false },
        type: 'value',
      },
    ],
    series: [
      ...DASHBOARD_GRADE_ORDER.map((grade) => ({
        data: dataByGrade[grade],
        name: grade,
        stack: 'grade',
        type: 'bar',
      })),
      {
        data: sorted.map((item) => item.averageScore ?? null),
        name: '平均分',
        smooth: true,
        symbolSize: 7,
        type: 'line',
        yAxisIndex: 1,
      },
    ],
  } as unknown as ECOption;
}

/**
 * One series per template keeps multiple results in the same period visible.
 * We intentionally do not average same-period scores before rendering.
 */
export function createPersonHistoryTrendOption(
  rows: JixiaoDashboardApi.EmployeeHistory[],
) {
  if (rows.length === 0) {
    return emptyChartOption();
  }
  const sorted = [...rows].toSorted((left, right) =>
    left.periodKey.localeCompare(right.periodKey),
  );
  const periodLabels = [...new Set(sorted.map((item) => item.periodLabel))];
  const grouped = new Map<string, JixiaoDashboardApi.EmployeeHistory[]>();
  sorted.forEach((row) => {
    const key = `${row.templateId}`;
    grouped.set(key, [...(grouped.get(key) || []), row]);
  });
  return {
    grid: { bottom: 30, left: 38, right: 24, top: 38 },
    legend: {
      data: [...grouped.values()].map((items) => items[0]?.templateName || '考评表'),
      textStyle: { color: '#475569', fontSize: 12 },
      top: 0,
      type: 'scroll',
    },
    tooltip: {
      axisPointer: { type: 'shadow' },
      formatter: (params: unknown) => {
        const points = Array.isArray(params) ? params : [];
        return points
          .map((point) => {
            const item = point as {
              marker?: string;
              seriesName?: string;
              value?: number;
            };
            return `${item.marker || ''}${item.seriesName || ''}: ${item.value ?? '-'} 分`;
          })
          .join('<br/>');
      },
      textStyle: TOOLTIP_TEXT_STYLE,
    },
    xAxis: {
      axisLabel: { color: '#64748b', fontSize: 12 },
      axisLine: { lineStyle: { color: '#d9dee7' } },
      data: periodLabels,
      type: 'category',
    },
    yAxis: {
      axisLabel: { color: '#64748b' },
      max: 120,
      min: 0,
      name: '最终分',
      nameTextStyle: { color: '#64748b' },
      splitLine: { lineStyle: { color: '#edf0f4' } },
      type: 'value',
    },
    series: [...grouped.values()].map((items) => {
      const byPeriod = new Map(
        items.map((item) => [item.periodLabel, item.finalScore ?? null]),
      );
      return {
        data: periodLabels.map((label) => byPeriod.get(label) ?? null),
        name: items[0]?.templateName || '考评表',
        showSymbol: true,
        smooth: false,
        symbolSize: 8,
        type: 'line',
      };
    }),
  } as unknown as ECOption;
}
