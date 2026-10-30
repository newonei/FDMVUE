import { defineComponent, h } from 'vue';
import { createMemoryHistory, createRouter } from 'vue-router';

import { describe, expect, it, vi } from 'vitest';

import { installMergedRouteRedirects, mergedRoutes } from './merged-routes';

const page = defineComponent({ render: () => h('div') });
function setup() {
  const paths = new Set([
    ...Object.keys(mergedRoutes),
    ...Object.values(mergedRoutes).map((target) => target.path),
    '/system/users',
  ]);
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [...paths].map((path) => ({ path, component: page })),
  });
  installMergedRouteRedirects(router);
  return router;
}

describe('merged department menus', () => {
  it('opens an absorbed page as a tab of its department page and keeps record and filter queries', async () => {
    const router = setup();
    await router.push(
      '/caiwu/platform-invoices?invoiceType=PURCHASE&documentId=inv-1',
    );
    expect(router.currentRoute.value.path).toBe('/caiwu/platform-receipts');
    expect(router.currentRoute.value.query).toEqual({
      invoiceType: 'PURCHASE',
      documentId: 'inv-1',
      view: 'invoices',
    });
    await router.push('/fdmprocurement/platform-arrivals?contractId=c');
    expect(router.currentRoute.value.fullPath).toBe(
      '/fdmprocurement/platform-orders?contractId=c&view=arrivals',
    );
  });

  it('never redirects a kept page or another module and maps every absorbed page to a distinct tab', async () => {
    const router = setup();
    await router.push('/caiwu/platform-receipts?view=refunds');
    expect(router.currentRoute.value.fullPath).toBe(
      '/caiwu/platform-receipts?view=refunds',
    );
    await router.push('/system/users?view=x');
    expect(router.currentRoute.value.fullPath).toBe('/system/users?view=x');
    const targets = Object.values(mergedRoutes).map(
      (target) => `${target.path}#${target.view}`,
    );
    expect(new Set(targets).size).toBe(targets.length);
    for (const target of Object.values(mergedRoutes))
      expect(mergedRoutes[target.path]).toBeUndefined();
  });

  it('registers once per router', () => {
    const router = createRouter({ history: createMemoryHistory(), routes: [] });
    const guard = vi.spyOn(router, 'beforeEach');
    installMergedRouteRedirects(router);
    installMergedRouteRedirects(router);
    expect(guard).toHaveBeenCalledOnce();
  });
});
