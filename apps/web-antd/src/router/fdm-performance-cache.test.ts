import type { AppRouteRecordRaw } from '@vben/types';

import { describe, expect, it } from 'vitest';

import { enablePerformanceManagementCache } from './fdm-performance-cache';

function createMenu(
  component: string,
  options: Partial<AppRouteRecordRaw> = {},
): AppRouteRecordRaw {
  return {
    component,
    keepAlive: false,
    meta: {},
    name: 'AssessmentManagement',
    path: '/fdmperformance/batches',
    visible: true,
    ...options,
  } as AppRouteRecordRaw;
}

describe('enablePerformanceManagementCache', () => {
  it('enables the nested backend page without changing its other fields or input', () => {
    const page = createMenu('fdmperformance/batches/index', {
      componentName: 'ServerAssessmentPage',
      meta: { title: '考核管理' },
    });
    const menus = [createMenu('BasicLayout', { children: [page] })];

    const result = enablePerformanceManagementCache(menus);

    expect(result[0]?.children?.[0]).toEqual({ ...page, keepAlive: true });
    expect(result[0]?.children?.[0]).not.toBe(page);
    expect(page).toHaveProperty('keepAlive', false);
    expect(result[0]).toHaveProperty('keepAlive', false);
  });

  it.each([
    '/fdmperformance/batches/index.vue',
    String.raw`fdmperformance\batches\index`,
    'fdmperformance/batches/index?scope=all',
  ])('recognizes the backend component spelling %s', (component) => {
    expect(
      enablePerformanceManagementCache([createMenu(component)])[0],
    ).toHaveProperty('keepAlive', true);
  });

  it('preserves detail pages and similarly named components', () => {
    const menus = [
      createMenu('fdmperformance/batches/instance/index'),
      createMenu('other/fdmperformance/batches/index'),
      createMenu('fdmperformance/batches/index-extra'),
      createMenu('fdmperformance/my/index', { keepAlive: true }),
    ];

    expect(enablePerformanceManagementCache(menus)).toEqual(menus);
  });
});
