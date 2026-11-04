import type { ECOption } from '@vben/plugins/echarts';

import type { Metric } from './model';

import { axisMoney, compactMoney, monthLabel, toNumber } from '../shared/format';

/** 看板配色：分类色按固定顺序（蓝、橙），去年用中性灰；明暗两套各自选定。 */
export interface BoardPalette {
  series: [string, string, string];
  compare: string;
  grid: string;
  axis: string;
  muted: string;
  gap: string;
}

export const LIGHT_PALETTE: BoardPalette = {
  axis: '#c3c2b7',
  compare: '#898781',
  gap: 'rgba(137, 135, 129, 0.14)',
  grid: '#e1e0d9',
  muted: '#898781',
  series: ['#2a78d6', '#eb6834', '#1baf7a'],
};

export const DARK_PALETTE: BoardPalette = {
  axis: '#383835',
  compare: '#898781',
  gap: 'rgba(137, 135, 129, 0.2)',
  grid: '#2c2c2a',
  muted: '#898781',
  series: ['#3987e5', '#d95926', '#199e70'],
};

/** 累计：今年与去年逐月累计对照；每月：近 12 个月逐月金额。 */
export type HeroMode = 'cumulative' | 'monthly';

function base(labels: string[], palette: BoardPalette, legend: boolean): ECOption {
  return {
    grid: { bottom: 8, containLabel: true, left: 4, right: 56, top: legend ? 36 : 16 },
    legend: {
      icon: 'roundRect',
      itemHeight: 8,
      itemWidth: 14,
      left: 0,
      show: legend,
      textStyle: { color: palette.muted },
      top: 0,
    },
    xAxis: {
      axisLabel: { color: palette.muted },
      axisLine: { lineStyle: { color: palette.axis } },
      axisTick: { show: false },
      data: labels,
      type: 'category',
    },
    yAxis: {
      axisLabel: { color: palette.muted, formatter: axisMoney },
      splitLine: { lineStyle: { color: palette.grid } },
      splitNumber: 4,
      type: 'value',
    },
  };
}

function gapArea(from: string, to: string, palette: BoardPalette) {
  const range: [{ xAxis: string }, { xAxis: string }] = [{ xAxis: from }, { xAxis: to }];
  return {
    data: [range],
    itemStyle: { color: palette.gap },
    label: {
      color: palette.muted,
      fontSize: 11,
      formatter: '待迁入',
      position: 'insideTop' as const,
    },
    silent: true,
  };
}

function cumulate(values: number[]) {
  let total = 0;
  return values.map((value) => (total += value));
}

function cumulativeOption(metric: Metric, months: string[], palette: BoardPalette): ECOption {
  const current = months.at(-1)!;
  const year = Number(current.slice(0, 4));
  const byMonth = new Map(months.map((month, index) => [month, metric.values[index] ?? 0]));
  const labels = Array.from({ length: 12 }, (_, index) => `${index + 1}月`);
  const monthOf = (y: number, index: number) => `${y}-${String(index + 1).padStart(2, '0')}`;
  const thisMonths = labels.map((_, index) => monthOf(year, index)).filter((month) => month <= current);
  const thisYear = cumulate(thisMonths.map((month) => byMonth.get(month) ?? 0));
  const lastYear = cumulate(labels.map((_, index) => byMonth.get(monthOf(year - 1, index)) ?? 0));
  const accent = palette.series[0];
  const gapMonth = metric.gapFrom?.slice(0, 7);
  return {
    ...base(labels, palette, true),
    series: [
      {
        data: lastYear,
        itemStyle: { color: palette.compare },
        lineStyle: { color: palette.compare, type: 'dashed', width: 2 },
        name: `${year - 1} 年`,
        showSymbol: false,
        symbol: 'circle',
        symbolSize: 8,
        type: 'line',
      },
      {
        areaStyle: { color: accent, opacity: 0.1 },
        data: thisYear,
        endLabel: {
          color: accent,
          fontWeight: 600,
          formatter: ({ value }: { value: unknown }) => compactMoney(toNumber(value)),
          show: true,
        },
        itemStyle: { color: accent },
        lineStyle: { color: accent, width: 2.5 },
        markArea:
          gapMonth && gapMonth.startsWith(`${year}-`)
            ? gapArea(`${Number(gapMonth.slice(5))}月`, `${Number(current.slice(5))}月`, palette)
            : undefined,
        name: `${year} 年`,
        showSymbol: false,
        symbol: 'circle',
        symbolSize: 8,
        type: 'line',
        z: 3,
      },
    ],
    tooltip: {
      formatter: (params: unknown) => {
        const list = params as { dataIndex: number }[];
        const index = list[0]?.dataIndex ?? 0;
        const now = thisYear[index];
        const before = lastYear[index] ?? 0;
        const rows = [`<b>1–${index + 1} 月累计</b>`];
        if (now !== undefined) rows.push(`${year} 年：${compactMoney(now)}`);
        rows.push(`${year - 1} 年：${compactMoney(before)}`);
        if (now !== undefined && before > 0) {
          const diff = now - before;
          const sign = diff >= 0 ? '+' : '';
          rows.push(`相差：${sign}${compactMoney(diff)}（${sign}${((diff / before) * 100).toFixed(1)}%）`);
        }
        return rows.join('<br/>');
      },
      trigger: 'axis',
    },
  };
}

function monthlyOption(metric: Metric, months: string[], palette: BoardPalette): ECOption {
  const recent = months.slice(-12);
  const labels = recent.map((month) => monthLabel(month));
  const parts = metric.parts ?? [{ name: metric.label, values: metric.values }];
  const gapMonth = metric.gapFrom?.slice(0, 7);
  const gapIndex = gapMonth ? recent.indexOf(gapMonth) : -1;
  const series: Record<string, unknown>[] = parts.map((part, index) => ({
    barMaxWidth: 22,
    data: part.values.slice(-12),
    emphasis: { focus: 'series' },
    itemStyle: {
      borderRadius: index === parts.length - 1 ? [4, 4, 0, 0] : 0,
      color: palette.series[index % palette.series.length],
    },
    markArea:
      index === 0 && gapIndex >= 0 ? gapArea(labels[gapIndex]!, labels.at(-1)!, palette) : undefined,
    name: part.name,
    stack: 'value',
    type: 'bar',
  }));
  if (metric.lastYearTotal !== null) {
    series.push({
      data: metric.values.slice(-24, -12),
      itemStyle: { color: palette.compare },
      lineStyle: { color: palette.compare, type: 'dashed', width: 2 },
      name: '去年同月',
      showSymbol: false,
      symbol: 'circle',
      symbolSize: 8,
      type: 'line',
      z: 3,
    });
  }
  return {
    ...base(labels, palette, series.length > 1),
    series: series as ECOption['series'],
    tooltip: {
      axisPointer: { type: 'shadow' },
      trigger: 'axis',
      valueFormatter: (value) => compactMoney(toNumber(value)),
    },
  };
}

export function heroOption(
  metric: Metric | undefined,
  months: string[],
  mode: HeroMode,
  palette: BoardPalette,
): ECOption | null {
  if (!metric) return null;
  return mode === 'cumulative' && metric.lastYearTotal !== null
    ? cumulativeOption(metric, months, palette)
    : monthlyOption(metric, months, palette);
}
