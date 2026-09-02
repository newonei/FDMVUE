import type { RouteRecordStringComponent } from '@vben/types';

import { describe, expect, it } from 'vitest';

import { applyFdmFactorySupplyTaskRouteMeta } from './fdmfactory-supply-task-route-meta';

describe('factory supply task backend route meta', () => {
  it('adds activePath only to the hidden backend-owned detail route', () => {
    const routes = [
      {
        children: [
          {
            component: 'fdmfactory/supply-task/index',
            meta: { title: '内部工厂供货任务' },
            name: 'FdmFactorySupplyTaskList',
            path: 'supply-task',
          },
          {
            component: 'fdmfactory/supply-task/detail/index',
            meta: { title: '内部工厂供货任务详情' },
            name: 'FdmFactorySupplyTaskDetail',
            path: 'supply-task/detail/:id',
          },
        ],
        component: 'BasicLayout',
        meta: { title: '生产管理' },
        name: 'FdmFactoryRoot',
        path: '/fdmfactory',
      },
    ] as RouteRecordStringComponent[];

    const result = applyFdmFactorySupplyTaskRouteMeta(routes);
    expect(result[0]?.children?.[0]?.meta).not.toHaveProperty('activePath');
    expect(result[0]?.children?.[1]?.meta).toMatchObject({
      activePath: '/fdmfactory/supply-task',
      hideInMenu: true,
    });
    expect(result[0]?.children?.[1]?.path).toBe('supply-task/detail/:id');
  });

  it('does not manufacture a frontend route when the backend menu is absent', () => {
    expect(applyFdmFactorySupplyTaskRouteMeta([])).toEqual([]);
  });
});
