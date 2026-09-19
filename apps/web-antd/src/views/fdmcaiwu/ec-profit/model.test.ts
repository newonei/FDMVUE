import type { FdmcaiwuEcProfitApi } from '#/api/fdmcaiwu/ec-profit';

import { describe, expect, it } from 'vitest';

import { aggregateReadyReports, buildYearMonths, formatMetric } from './model';

function report(
  month: string,
  summary: FdmcaiwuEcProfitApi.Metric,
  status: FdmcaiwuEcProfitApi.ReportStatus = 'READY',
): FdmcaiwuEcProfitApi.Report {
  return {
    id: Number(month.slice(-2)),
    reportNo: `EC${month}`,
    month,
    status,
    version: 0,
    currency: 'CNY',
    shopCount: 1,
    importedShopCount: status === 'READY' ? 1 : 0,
    summary,
  };
}

describe('电商毛利月报汇总', () => {
  it('未导入和缺失金额不伪装为零，真实零值仍正常展示', () => {
    expect(formatMetric(null)).toBe('—');
    expect(formatMetric(undefined, true)).toBe('—');
    expect(formatMetric(0)).toBe('0.00');
    expect(formatMetric('0.15', true)).toBe('15.00%');
    expect(
      aggregateReadyReports([
        report('2026-01', { salesAmount: 999 }, 'WAITING_IMPORT'),
      ]).salesAmount,
    ).toBeNull();
    expect(
      aggregateReadyReports([
        report('2026-01', { salesAmount: 100 }),
        report('2026-02', {}),
      ]).salesAmount,
    ).toBeNull();
  });

  it('只累计已就绪月份，全年比率按精确金额重新加权计算', () => {
    const total = aggregateReadyReports([
      report('2026-01', {
        salesAmount: '100.001',
        grossProfit: '10.005',
        grossMargin: 0.1,
      }),
      report('2026-02', {
        salesAmount: '300.001',
        grossProfit: '90.005',
        grossMargin: 0.3,
      }),
      report(
        '2026-03',
        { salesAmount: '900', grossProfit: '900' },
        'WAITING_IMPORT',
      ),
    ]);
    expect(total.salesAmount).toBe('400.002');
    expect(total.grossProfit).toBe('100.01');
    expect(total.grossMargin).toBe('0.25002375');
  });

  it('采购费率包含代发，任一采购分项未知则不展示费率', () => {
    const complete = report('2026-01', {
      salesAmount: 100,
      purchaseCost: 30,
      ownPurchaseCost: 20,
      accessoryPurchaseCost: 10,
      dropshipPurchaseCost: 40,
    });
    expect(aggregateReadyReports([complete]).purchaseCostRate).toBe(
      '0.70000000',
    );
    expect(
      aggregateReadyReports([
        {
          ...complete,
          summary: { ...complete.summary, dropshipPurchaseCost: null },
        },
      ]).purchaseCostRate,
    ).toBeNull();
    expect(
      aggregateReadyReports([
        report('2026-01', { salesAmount: 0, grossProfit: 0 }),
      ]).grossMargin,
    ).toBeNull();
  });

  it('年度矩阵补齐十二个月但不虚构月报', () => {
    const existing = report('2026-03', {}, 'WAITING_IMPORT');
    const months = buildYearMonths(2026, [existing]);
    expect(months).toHaveLength(12);
    expect(months[0]).toEqual({
      month: '2026-01',
      label: '1月',
      report: undefined,
    });
    expect(months[2]?.report).toBe(existing);
    expect(months[11]?.month).toBe('2026-12');
  });
});
