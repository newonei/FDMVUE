import type { AppRouteRecordRaw } from '@vben/types';

import { describe, expect, it } from 'vitest';

import { convertServerMenuToRouteRecordStringComponent } from '../../../../packages/utils/src/helpers/generate-menus';
import { enableDepartmentPageCache } from './fdm-department-cache';

function menu(
  component: string,
  options: Partial<AppRouteRecordRaw> = {},
): AppRouteRecordRaw {
  return {
    component,
    componentName: 'DepartmentPage',
    keepAlive: false,
    meta: {},
    name: '业务页面',
    path: 'page',
    ...options,
  } as AppRouteRecordRaw;
}

describe('department menu cache', () => {
  it.each(['/fdmprocurement', 'fdmwaimao', '/neixiao/'])(
    'caches nested shared pages under %s without mutating the source',
    (path) => {
      const shared = menu('fdmplatform/finance/procurement/payments/index');
      const root = menu('BasicLayout', {
        path,
        componentName: 'Department',
        children: [
          menu('', {
            componentName: 'DepartmentGroup',
            children: [shared],
          }),
        ],
      });
      const cached = enableDepartmentPageCache([root]);
      expect(cached[0]?.keepAlive).toBe(false);
      expect(cached[0]?.children?.[0]?.keepAlive).toBe(false);
      expect(cached[0]?.children?.[0]?.children?.[0]?.keepAlive).toBe(true);
      expect(shared.keepAlive).toBe(false);
      const converted = convertServerMenuToRouteRecordStringComponent(cached);
      expect(converted[0]?.children?.[0]?.children?.[0]?.meta?.keepAlive).toBe(
        true,
      );
    },
  );

  it.each([
    'fdmplatform/purchase/orders/index',
    '/fdmplatform/trade/contracts/index.vue',
    String.raw`fdmplatform\domestic\customers\index`,
    'fdmplatform/portal/purchase/index?mine=true',
    'fdmplatform/portal/trade/index',
    'fdmplatform/portal/domestic/index',
    'fdmneixiao/pattern/design-item/index',
  ])('caches department component %s even in flattened menus', (component) => {
    expect(enableDepartmentPageCache([menu(component)])[0]?.keepAlive).toBe(
      true,
    );
  });

  it('leaves other departments and similarly named paths unchanged', () => {
    const menus = [
      menu('fdmplatform/finance/receipts/index'),
      menu('fdmplatform/products/catalog/index'),
      menu('other/page', { path: '/neixiao-extra/page' }),
      menu('other/fdmplatform/trade/contracts/index'),
      menu('fdmplatform/purchase-extra/index'),
      menu('BasicLayout', { path: '/fdmprocurement-extra' }),
      menu('fdmgongchang/workbench/index', { keepAlive: true }),
    ];
    expect(enableDepartmentPageCache(menus)).toEqual(menus);
  });
});
