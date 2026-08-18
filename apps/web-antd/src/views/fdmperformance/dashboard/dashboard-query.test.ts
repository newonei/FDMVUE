import { describe, expect, it } from 'vitest';

import {
  createGradeDistributionOption,
  createPerformanceTrendOption,
} from './chart-options';
import {
  createDashboardQueryState,
  toDashboardRequest,
  toDashboardRouteQuery,
} from './composables/use-dashboard-query-state';

describe('performance dashboard query state', () => {
  it('restores filters and preserves a Long template ID as an opaque value', () => {
    const state = createDashboardQueryState({
      endPeriodKey: '2026-07',
      grades: 'A+,B',
      pageNo: '2',
      pageSize: '50',
      periodType: 'MONTH',
      startPeriodKey: '2026-01',
      templateId: '2083489455964938241',
      userName: '陈博文',
    });

    const request = toDashboardRequest(state);
    const routeQuery = toDashboardRouteQuery(state);

    expect(request.templateId).toBe('2083489455964938241');
    expect(request.grades).toEqual(['A+', 'B']);
    expect(routeQuery.templateId).toBe('2083489455964938241');
    expect(routeQuery.pageSize).toBe('50');
  });
});

describe('performance dashboard charts', () => {
  it('keeps all five raw grades in the distribution option', () => {
    const option = createGradeDistributionOption([
      { count: 1, grade: 'A+', rate: 0.1 },
      { count: 2, grade: 'A', rate: 0.2 },
      { count: 4, grade: 'B', rate: 0.4 },
      { count: 1, grade: 'C+', rate: 0.1 },
      { count: 2, grade: 'C', rate: 0.2 },
    ]) as unknown as { series: Array<{ name: string }> };

    expect(option.series.map((item) => item.name)).toEqual([
      'A+',
      'A',
      'B',
      'C+',
      'C',
    ]);
  });

  it('uses raw five-grade result counts in every trend period', () => {
    const option = createPerformanceTrendOption([
      {
        aCount: 1,
        aplusCount: 1,
        averageScore: 90,
        bCount: 2,
        cCount: 1,
        cplusCount: 1,
        employeeCount: 5,
        periodKey: '2026-07',
        periodLabel: '2026年07月',
        periodType: 'MONTH',
        resultCount: 6,
      },
    ]) as unknown as { series: Array<{ data: unknown[]; name: string }> };

    expect(option.series.slice(0, 5).map((item) => item.name)).toEqual([
      'A+',
      'A',
      'B',
      'C+',
      'C',
    ]);
    expect(option.series[2]?.data).toEqual([2]);
  });
});
