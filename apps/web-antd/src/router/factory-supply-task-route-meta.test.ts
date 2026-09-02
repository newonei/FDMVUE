import type { RouteRecordStringComponent } from '@vben/types';

import { describe, expect, it } from 'vitest';

import { applyFactorySupplyTaskRouteMeta } from './factory-supply-task-route-meta';

describe('factory supply task backend route meta', () => {
  it('adds activePath only to the hidden backend-owned detail route', () => {
    const routes = [
      {
        children: [
          {
            component: 'mes/factory-supply-task/index',
            meta: { title: '内部工厂供货任务' },
            name: 'MesFactorySupplyTaskList',
            path: 'factory-supply-task',
          },
          {
            component: 'mes/factory-supply-task/detail/index',
            meta: { title: '内部工厂供货任务详情' },
            name: 'MesFactorySupplyTaskDetail',
            path: 'factory-supply-task/detail/:id',
          },
        ],
        component: 'BasicLayout',
        meta: { title: '生产管理' },
        name: 'MesRoot',
        path: '/mes',
      },
    ] as RouteRecordStringComponent[];

    const result = applyFactorySupplyTaskRouteMeta(routes);
    expect(result[0]?.children?.[0]?.meta).not.toHaveProperty('activePath');
    expect(result[0]?.children?.[1]?.meta).toMatchObject({
      activePath: '/mes/factory-supply-task',
      hideInMenu: true,
    });
    expect(result[0]?.children?.[1]?.path).toBe(
      'factory-supply-task/detail/:id',
    );
  });

  it('does not manufacture a frontend route when the backend menu is absent', () => {
    expect(applyFactorySupplyTaskRouteMeta([])).toEqual([]);
  });
});
