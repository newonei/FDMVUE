import type { AppRouteRecordRaw } from '@vben/types';

import { describe, expect, it } from 'vitest';

import { convertServerMenuToRouteRecordStringComponent } from '../../../../packages/utils/src/helpers/generate-menus';
import { enableFactoryPageCache } from './fdm-factory-cache';

function createMenu(
  component: string,
  options: Partial<AppRouteRecordRaw> = {},
): AppRouteRecordRaw {
  return {
    component,
    componentName: 'FdmGongchangWorker',
    keepAlive: false,
    meta: {},
    name: '工厂人员',
    path: 'worker',
    visible: true,
    ...options,
  } as AppRouteRecordRaw;
}

describe('enableFactoryPageCache', () => {
  it('enables nested factory pages before backend menu conversion without mutating the input', () => {
    const page = createMenu('fdmgongchang/worker/index');
    const menus = [
      createMenu('BasicLayout', {
        children: [page],
        componentName: 'FdmGongchang',
      }),
    ];
    const result = enableFactoryPageCache(menus);

    expect(result[0]?.children?.[0]).toEqual({ ...page, keepAlive: true });
    expect(page.keepAlive).toBe(false);
    expect(result[0]?.keepAlive).toBe(false);
    const converted = convertServerMenuToRouteRecordStringComponent(result);
    expect(converted[0]?.children?.[0]).toMatchObject({
      meta: { keepAlive: true },
      name: 'FdmGongchangWorker',
    });
  });

  it.each([
    'fdmgongchang/production-order/index',
    'fdmgongchang/workshop/mix/index',
    'fdmgongchang/workshop/fold/index',
    '/fdmgongchang/factory-setting/index.vue',
    String.raw`fdmgongchang\stage-stock\index`,
    ' fdmgongchang/dashboard/index?range=7d ',
  ])('enables factory component %s', (component) => {
    expect(enableFactoryPageCache([createMenu(component)])[0]?.keepAlive).toBe(
      true,
    );
  });

  it('preserves directory, redirect and other business menu settings', () => {
    const menus = [
      createMenu('BasicLayout'),
      createMenu(''),
      createMenu('fdmgongchang/schedule/index'),
      createMenu('/fdmgongchang/schedule/index.vue?id=1'),
      createMenu('fdmgongchang-extra/worker/index'),
      createMenu('other/fdmgongchang/worker/index'),
      createMenu('fdmperformance/batches/index', { keepAlive: true }),
    ];
    expect(enableFactoryPageCache(menus)).toEqual(menus);
  });
});
