/* eslint-disable vue/one-component-per-file -- Route fixtures verify KeepAlive across platform and other modules. */
import { createApp, defineComponent, h, KeepAlive, nextTick } from 'vue';
import {
  createMemoryHistory,
  createRouter,
  RouterView,
  useRoute,
} from 'vue-router';

import { getTabKey } from '@vben/stores';

import { describe, expect, it, vi } from 'vitest';

import { installPlatformTabPolicy } from './tab-policy';

function setup(install = true) {
  let mounts = 0;
  const component = defineComponent({
    name: 'ProcurementFixture',
    setup() {
      mounts++;
      const route = useRoute();
      return () =>
        h(
          'p',
          { 'data-procurement': true },
          String(route.query.documentId ?? route.query.financeId ?? ''),
        );
    },
  });
  const lazy = async () => component;
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      ...(
        [
          ['/fdmprocurement/platform-orders', 'FdmPlatformPurchaseOrders'],
          [
            '/caiwu/platform-procurement-requests',
            'FdmPlatformProcurementRequests',
          ],
          [
            '/caiwu/platform-procurement-payments',
            'FdmPlatformProcurementPayments',
          ],
          [
            '/caiwu/platform-procurement-reimbursements',
            'FdmPlatformProcurementReimbursements',
          ],
          ['/caiwu/platform-procurement-costs', 'FdmPlatformProcurementCosts'],
          ['/fdmwaimao/platform-contracts', 'FdmPlatformTradeContracts'],
          ['/fdmwaimao/platform-customers', 'FdmPlatformTradeCustomers'],
          ['/caiwu/platform-receipts', 'FdmPlatformFinanceReceipts'],
        ] as [string, string][]
      ).map(([path, name]) => ({ path, name, component: lazy })),
      {
        path: '/system/users',
        name: 'SystemUser',
        component: defineComponent({
          render: () => h('div', 'Official fixture'),
        }),
      },
    ],
  });
  if (install) installPlatformTabPolicy(router);
  const keys: string[] = [];
  router.afterEach((to) =>
    keys.push(getTabKey({ ...to, meta: to.matched.at(-1)?.meta ?? to.meta })),
  );
  return { router, keys, getMounts: () => mounts };
}
describe('platform page tab identity', () => {
  it('sets both tabbar and KeepAlive keys before the first lazy deep-link navigation commits', async () => {
    const { router, keys } = setup();
    await router.push(
      '/fdmprocurement/platform-orders?contractId=c&documentId=po-a&tab=payments',
    );
    expect(keys).toEqual(['/fdmprocurement/platform-orders']);
    expect(getTabKey(router.currentRoute.value)).toBe(
      '/fdmprocurement/platform-orders',
    );
    expect(router.currentRoute.value.query).toEqual({
      contractId: 'c',
      documentId: 'po-a',
      tab: 'payments',
    });
  });
  it('reuses the mounted procurement page for tab/record changes and restores selected record on browser back', async () => {
    const { router, keys, getMounts } = setup();
    await router.push(
      '/fdmprocurement/platform-orders?contractId=c&documentId=po-a',
    );
    await router.isReady();
    const host = document.createElement('div');
    document.body.append(host);
    const app = createApp({
      render: () =>
        h(
          RouterView,
          {},
          {
            default: ({
              Component,
              route,
            }: {
              Component: object;
              route: typeof router.currentRoute.value;
            }) =>
              h(KeepAlive, {}, () => h(Component, { key: getTabKey(route) })),
          },
        ),
    });
    app.use(router);
    app.mount(host);
    try {
      await router.replace(
        '/fdmprocurement/platform-orders?contractId=c&documentId=po-a&tab=costs',
      );
      await router.push(
        '/fdmprocurement/platform-orders?contractId=c&documentId=po-b&tab=history',
      );
      await nextTick();
      expect(getMounts()).toBe(1);
      expect(host.textContent).toBe('po-b');
      router.back();
      await vi.waitFor(() =>
        expect(router.currentRoute.value.query.documentId).toBe('po-a'),
      );
      expect(router.currentRoute.value.query.tab).toBe('costs');
      expect(new Set(keys).size).toBe(1);
      expect(getMounts()).toBe(1);
    } finally {
      app.unmount();
      host.remove();
    }
  });
  it('keeps finance documents and plan/list filters in one tab for each separate finance menu', async () => {
    const { router, keys } = setup();
    for (const page of ['requests', 'payments', 'reimbursements', 'costs']) {
      const path = `/caiwu/platform-procurement-${page}`;
      await router.push(`${path}?financeId=a&contractId=c`);
      await router.push(`${path}?financeId=b&type=PAYMENT_PLAN&contractId=c`);
      expect(keys.at(-1)).toBe(path);
      expect(router.currentRoute.value.query.financeId).toBe('b');
    }
    expect(new Set(keys).size).toBe(4);
  });
  it('keeps contract, customer and document detail links in their menu tab', async () => {
    const { router, keys } = setup();
    for (const [path, key] of [
      ['/fdmwaimao/platform-contracts', 'contractId'],
      ['/fdmwaimao/platform-customers', 'customerId'],
      ['/caiwu/platform-receipts', 'documentId'],
    ] as const) {
      await router.push(path);
      await router.push(`${path}?${key}=a`);
      await router.push(`${path}?${key}=b&tab=progress`);
      expect(keys.slice(-3)).toEqual([path, path, path]);
      expect(router.currentRoute.value.query[key]).toBe('b');
    }
  });
  it('does not change other modules tab keys or drop explicit pageKey behavior', async () => {
    const { router, keys } = setup();
    await router.push(
      '/fdmprocurement/platform-orders?documentId=a&contractId=c',
    );
    await router.push('/system/users?userId=a');
    await router.push('/system/users?userId=b');
    expect(keys.slice(-2)).toEqual([
      '/system/users?userId=a',
      '/system/users?userId=b',
    ]);
    expect(router.currentRoute.value.meta.fullPathKey).toBeUndefined();
    await router.push(
      '/fdmprocurement/platform-orders?documentId=b&contractId=c&pageKey=user-specified',
    );
    expect(keys.at(-1)).toBe('user-specified');
  });
});

describe('platform tab policy registration', () => {
  it('registers once for a router even when the module is evaluated again during HMR', async () => {
    const { router } = setup(false);
    const guard = vi.spyOn(router, 'beforeResolve');
    installPlatformTabPolicy(router);
    vi.resetModules();
    const reloaded = await import('./tab-policy');
    reloaded.installPlatformTabPolicy(router);
    expect(guard).toHaveBeenCalledOnce();
    await router.push(
      '/fdmprocurement/platform-orders?contractId=c&documentId=after-hot-reload',
    );
    expect(getTabKey(router.currentRoute.value)).toBe(
      '/fdmprocurement/platform-orders',
    );
    guard.mockRestore();
  });
});
