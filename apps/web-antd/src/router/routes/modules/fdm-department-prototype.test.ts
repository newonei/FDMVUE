import type { RouteRecordRaw } from 'vue-router';

import { describe, expect, it } from 'vitest';

import {
  FDM_WAIMAO_CRM_DEFAULT_PATH,
  LEGACY_FDM_WAIMAO_CRM_VIEW_PATHS,
  loadFdmTradeDocumentDetail,
  resolveLegacyFdmWaimaoCrmPath,
  selectBackendMixedStaticRoutes,
} from '../../fdm-trade-prototype-routing';
import dashboardRoutes from './dashboard';
import fdmPurchaseRoutes from './fdmpurchase-prototype';
import fdmSupplyChainRoutes from './fdmsupplychain-prototype';
import fdmTradeFinanceRoutes from './fdmtradefinance-prototype';
import fdmWaimaoRoutes from './fdmwaimao-prototype';
import legacyFdmWaimaoCrmRoutes from './fdmwaimaocrm-prototype';

const departmentRoutes = [
  fdmWaimaoRoutes[0],
  fdmPurchaseRoutes[0],
  fdmSupplyChainRoutes[0],
  fdmTradeFinanceRoutes[0],
] as RouteRecordRaw[];

const expectedRoots = [
  {
    path: '/fdmwaimao',
    redirect: '/fdmwaimao/customer',
  },
  {
    path: '/fdmpurchase',
    redirect: '/fdmpurchase/supplier',
  },
  {
    path: '/fdmsupplychain',
    redirect: '/fdmsupplychain/supply-execution',
  },
  {
    path: '/fdmtradefinance',
    redirect: '/fdmtradefinance/receipt-writeoff',
  },
];

const expectedVisibleChildPaths = [
  '/fdmwaimao/workbench',
  '/fdmwaimao/customer',
  '/fdmwaimao/contract-order',
  '/fdmwaimao/demand-analysis',
  '/fdmpurchase/supplier',
  '/fdmpurchase/requisition',
  '/fdmpurchase/order',
  '/fdmpurchase/follow-up-customs',
  '/fdmsupplychain/supply-execution',
  '/fdmsupplychain/shipment-outbound',
  '/fdmtradefinance/receipt-writeoff',
  '/fdmtradefinance/payable-expense',
];

const expectedDetailActivePaths = {
  '/fdmwaimao/customer/detail/:id': '/fdmwaimao/customer',
  '/fdmwaimao/contract-order/detail/:id': '/fdmwaimao/contract-order',
  '/fdmwaimao/demand-analysis/detail/:id': '/fdmwaimao/demand-analysis',
  '/fdmpurchase/supplier/detail/:id': '/fdmpurchase/supplier',
  '/fdmpurchase/requisition/detail/:id': '/fdmpurchase/requisition',
  '/fdmpurchase/order/detail/:id': '/fdmpurchase/order',
  '/fdmpurchase/follow-up-customs/detail/:id': '/fdmpurchase/follow-up-customs',
  '/fdmsupplychain/supply-execution/detail/:id':
    '/fdmsupplychain/supply-execution',
  '/fdmsupplychain/shipment-outbound/detail/:id':
    '/fdmsupplychain/shipment-outbound',
  '/fdmtradefinance/receipt-writeoff/detail/:id':
    '/fdmtradefinance/receipt-writeoff',
  '/fdmtradefinance/payable-expense/detail/:id':
    '/fdmtradefinance/payable-expense',
};

const expectedDetailPageKeys = {
  '/fdmwaimao/customer/detail/:id': 'customer',
  '/fdmwaimao/contract-order/detail/:id': 'contract-order',
  '/fdmwaimao/demand-analysis/detail/:id': 'demand-analysis',
  '/fdmpurchase/supplier/detail/:id': 'supplier',
  '/fdmpurchase/requisition/detail/:id': 'requisition',
  '/fdmpurchase/order/detail/:id': 'purchase-order',
  '/fdmpurchase/follow-up-customs/detail/:id': 'follow-up-customs',
  '/fdmsupplychain/supply-execution/detail/:id': 'supply-execution',
  '/fdmsupplychain/shipment-outbound/detail/:id': 'shipment-outbound',
  '/fdmtradefinance/receipt-writeoff/detail/:id': 'receipt-writeoff',
  '/fdmtradefinance/payable-expense/detail/:id': 'payable-expense',
};

function getFullChildPath(root: RouteRecordRaw, child: RouteRecordRaw) {
  return `${root.path}/${child.path}`;
}

function getAllRoutes() {
  return [
    ...departmentRoutes.flatMap((root) => [root, ...(root.children ?? [])]),
    ...legacyFdmWaimaoCrmRoutes,
  ];
}

describe('fdm trade department prototype routes', () => {
  it('keeps the four department route definitions with exact redirects', () => {
    expect(
      departmentRoutes.map(({ path, redirect }) => ({ path, redirect })),
    ).toEqual(expectedRoots);

    const [retiredWaimaoPrototype, ...activePrototypeRoots] = departmentRoutes;
    expect(retiredWaimaoPrototype?.meta?.hideInMenu).toBe(true);
    expect(retiredWaimaoPrototype?.meta).not.toHaveProperty('badge');

    for (const route of activePrototypeRoots) {
      expect(route.component).toBeUndefined();
      expect(route.meta?.badge).toBe('原型');
      expect(route.meta?.hideInMenu).not.toBe(true);
      expect(route.meta).not.toHaveProperty('authority');
    }
  });

  it('exposes exactly the approved 12 child menus', () => {
    const visibleChildPaths = departmentRoutes.flatMap((root) =>
      (root.children ?? [])
        .filter((child) => !child.meta?.hideInMenu)
        .map((child) => getFullChildPath(root, child)),
    );

    expect(visibleChildPaths).toHaveLength(12);
    expect(visibleChildPaths).toEqual(expectedVisibleChildPaths);
  });

  it('keeps every route name unique', () => {
    const names = getAllRoutes().map((route) => route.name);

    expect(names.every(Boolean)).toBe(true);
    expect(new Set(names).size).toBe(names.length);
  });

  it('uses one hidden detail component and highlights the owning list', () => {
    const detailRoutes = departmentRoutes.flatMap((root) =>
      (root.children ?? [])
        .filter((child) => child.meta?.hideInMenu)
        .map((child) => ({
          activePath: child.meta?.activePath,
          component: child.component,
          path: getFullChildPath(root, child),
          prototypePageKey: child.meta?.prototypePageKey,
        })),
    );

    expect(detailRoutes).toHaveLength(11);
    expect(
      Object.fromEntries(
        detailRoutes.map(({ activePath, path }) => [path, activePath]),
      ),
    ).toEqual(expectedDetailActivePaths);
    expect(
      Object.fromEntries(
        detailRoutes.map(({ path, prototypePageKey }) => [
          path,
          prototypePageKey,
        ]),
      ),
    ).toEqual(expectedDetailPageKeys);

    for (const route of detailRoutes) {
      expect(route.component).toBe(loadFdmTradeDocumentDetail);
    }
  });

  it.each(Object.entries(LEGACY_FDM_WAIMAO_CRM_VIEW_PATHS))(
    'maps the legacy view %s to %s',
    (view, path) => {
      expect(resolveLegacyFdmWaimaoCrmPath(view)).toBe(path);
    },
  );

  it('maps the legacy orders view to the real contract-order page', () => {
    expect(resolveLegacyFdmWaimaoCrmPath('orders')).toBe(
      '/fdmwaimao/contract-order',
    );
  });

  it('maps the legacy finance view to the real foreign-trade receipt page', () => {
    expect(resolveLegacyFdmWaimaoCrmPath('finance')).toBe(
      '/fdmwaimao/receipt-record',
    );
  });

  it('maps the legacy supply view to the real procurement requisition page', () => {
    expect(resolveLegacyFdmWaimaoCrmPath('supply')).toBe(
      '/fdmprocurement/requisition',
    );
  });

  it('maps absent, default, overview, and unknown legacy views to the real customer page', () => {
    expect(resolveLegacyFdmWaimaoCrmPath()).toBe(FDM_WAIMAO_CRM_DEFAULT_PATH);
    expect(resolveLegacyFdmWaimaoCrmPath('default')).toBe(
      FDM_WAIMAO_CRM_DEFAULT_PATH,
    );
    expect(resolveLegacyFdmWaimaoCrmPath('overview')).toBe(
      FDM_WAIMAO_CRM_DEFAULT_PATH,
    );
    expect(resolveLegacyFdmWaimaoCrmPath('unknown')).toBe(
      FDM_WAIMAO_CRM_DEFAULT_PATH,
    );
  });

  it('keeps the old prototype address as a hidden redirect only', () => {
    const [legacyRoute] = legacyFdmWaimaoCrmRoutes;

    expect(legacyRoute).toMatchObject({
      path: '/fdmwaimaocrm-prototype',
      name: 'LegacyFdmWaimaoCrmPrototypeRedirect',
      meta: {
        hideInBreadcrumb: true,
        hideInMenu: true,
        hideInTab: true,
      },
    });
    expect(legacyRoute?.component).toBeUndefined();
    expect(legacyRoute?.redirect).toBeTypeOf('function');
  });

  it('keeps shell routes but excludes the fake purchase root in backend mixed mode', () => {
    const selected = selectBackendMixedStaticRoutes([
      ...dashboardRoutes,
      ...departmentRoutes,
      ...legacyFdmWaimaoCrmRoutes,
      {
        component: () => Promise.resolve({}),
        name: 'ExistingBackendPage',
        path: '/system/user',
      } as RouteRecordRaw,
    ]);

    expect(selected.map((route) => route.path)).toEqual([
      '/dashboard',
      '/profile',
      '/fdmsupplychain',
      '/fdmtradefinance',
      '/fdmwaimaocrm-prototype',
    ]);

    const dashboard = selected.find((route) => route.path === '/dashboard');
    expect(
      dashboard?.children?.map((child) => `${dashboard.path}/${child.path}`),
    ).toEqual(['/dashboard/analytics', '/dashboard/workspace']);
    expect(selected.some((route) => route.path === '/fdmwaimao')).toBe(false);
    expect(selected.some((route) => route.path === '/fdmpurchase')).toBe(false);
    expect(
      selected.some(
        (route) => route.path === '/fdmprocurement/sourcing/generate',
      ),
    ).toBe(false);
    expect(selected.some((route) => route.path === '/system/user')).toBe(false);
  });
});
