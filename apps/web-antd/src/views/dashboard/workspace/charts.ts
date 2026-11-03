import type { ECOption } from '@vben/plugins/echarts';

import type { BoardInput, TrendView } from './model';

import {
  axisMoney,
  compactMoney,
  monthLabel,
  sum,
  toNumber,
} from '../shared/format';
import { alignMonths } from './model';

/** 看板配色：分类色按固定顺序（蓝、橙），去年同期用中性灰；明暗两套各自选定。 */
export interface BoardPalette {
  series: [string, string, string];
  compare: string;
  grid: string;
  axis: string;
  muted: string;
}

export const LIGHT_PALETTE: BoardPalette = {
  axis: '#c3c2b7',
  compare: '#898781',
  grid: '#e1e0d9',
  muted: '#898781',
  series: ['#2a78d6', '#eb6834', '#1baf7a'],
};

export const DARK_PALETTE: BoardPalette = {
  axis: '#383835',
  compare: '#898781',
  grid: '#2c2c2a',
  muted: '#898781',
  series: ['#3987e5', '#d95926', '#199e70'],
};

interface Series {
  name: string;
  values: number[];
  kind: 'bar' | 'compare';
  stack?: string;
}

function chart(
  months: string[],
  series: Series[],
  palette: BoardPalette,
): ECOption {
  let colorIndex = 0;
  const bars = series.filter((item) => item.kind === 'bar');
  return {
    grid: { bottom: 28, containLabel: true, left: 8, right: 12, top: 40 },
    legend: {
      icon: 'roundRect',
      itemHeight: 8,
      itemWidth: 12,
      left: 0,
      show: series.length > 1,
      textStyle: { color: palette.muted },
      top: 0,
    },
    series: series.map((item) => {
      if (item.kind === 'compare') {
        return {
          data: item.values,
          itemStyle: { color: palette.compare },
          lineStyle: { color: palette.compare, type: 'dashed', width: 2 },
          name: item.name,
          showSymbol: false,
          smooth: false,
          symbol: 'circle',
          symbolSize: 8,
          type: 'line',
          z: 3,
        };
      }
      const color = palette.series[colorIndex++ % palette.series.length];
      const top = item.stack
        ? bars.findLast((bar) => bar.stack === item.stack) === item
        : true;
      return {
        barGap: '20%',
        barMaxWidth: 18,
        data: item.values,
        emphasis: { focus: 'series' },
        itemStyle: {
          borderColor: 'transparent',
          borderRadius: top ? [4, 4, 0, 0] : 0,
          color,
        },
        name: item.name,
        stack: item.stack,
        type: 'bar',
      };
    }),
    tooltip: {
      axisPointer: { type: 'shadow' },
      trigger: 'axis',
      valueFormatter: (value) => compactMoney(toNumber(value)),
    },
    xAxis: {
      axisLabel: { color: palette.muted },
      axisLine: { lineStyle: { color: palette.axis } },
      axisTick: { show: false },
      data: months.map((month) => monthLabel(month)),
      type: 'category',
    },
    yAxis: {
      axisLabel: { color: palette.muted, formatter: axisMoney },
      splitLine: { lineStyle: { color: palette.grid } },
      type: 'value',
    },
  };
}

/** 近 12 个月，与去年同月对照；months 为 24 个月，最后一个是本月。 */
export function trendOption(
  view: TrendView,
  input: BoardInput,
  months: string[],
  palette: BoardPalette,
): ECOption | null {
  const recent = months.slice(-12);
  const { board, ec } = input;
  const split = (values: number[]) => ({
    current: values.slice(-12),
    previous: values.slice(-24, -12),
  });
  if (view === 'signed') {
    const lines = [board?.foreign, board?.domestic].filter((line) => !!line);
    if (lines.length === 0) return null;
    const aligned = lines.map((line) => ({
      name: line!.channel === 'FOREIGN' ? '外贸' : '内销',
      values: alignMonths(months, line!.months, line!.signed),
    }));
    const total = months.map((_, index) =>
      sum(aligned.map((line) => line.values[index])),
    );
    return chart(
      recent,
      [
        ...aligned.map((line) => ({
          kind: 'bar' as const,
          name: line.name,
          stack: 'signed',
          values: split(line.values).current,
        })),
        { kind: 'compare', name: '去年同月', values: split(total).previous },
      ],
      palette,
    );
  }
  if (view === 'cash') {
    const cash = board?.cashflow;
    if (!cash) return null;
    return chart(
      recent,
      [
        {
          kind: 'bar',
          name: '回款',
          values: alignMonths(recent, cash.months, cash.inflow),
        },
        {
          kind: 'bar',
          name: '付款',
          values: alignMonths(recent, cash.months, cash.outflow),
        },
      ],
      palette,
    );
  }
  if (view === 'ec') {
    if (!ec) return null;
    const sales = split(alignMonths(months, ec.months, ec.sales));
    return chart(
      recent,
      [
        { kind: 'bar', name: '实际销售额', values: sales.current },
        { kind: 'compare', name: '去年同月', values: sales.previous },
      ],
      palette,
    );
  }
  const purchasing = board?.purchasing;
  if (!purchasing) return null;
  return chart(
    recent,
    [
      {
        kind: 'bar',
        name: '采购额',
        values: alignMonths(recent, purchasing.months, purchasing.monthly),
      },
    ],
    palette,
  );
}
