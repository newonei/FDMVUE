import type { Router } from 'vue-router';

const installationKey = Symbol.for('fdmplatform.mergedRoutes');

/** Former standalone menus now live as tabs (`?view=`) of one department page. */
export const mergedRoutes: Record<string, { path: string; view: string }> = {
  '/fdmwaimao/platform-returns': {
    path: '/fdmwaimao/platform-shipments',
    view: 'salesReturns',
  },
  '/fdmprocurement/platform-plans': {
    path: '/fdmprocurement/platform-quotes',
    view: 'plans',
  },
  '/fdmprocurement/platform-arrivals': {
    path: '/fdmprocurement/platform-orders',
    view: 'arrivals',
  },
  '/fdmprocurement/platform-returns': {
    path: '/fdmprocurement/platform-orders',
    view: 'purchaseReturns',
  },
  '/fdmprocurement/platform-production': {
    path: '/fdmprocurement/platform-orders',
    view: 'production',
  },
  '/fdmprocurement/platform-routing': {
    path: '/fdmprocurement/platform-templates',
    view: 'routing',
  },
  '/caiwu/platform-refunds': {
    path: '/caiwu/platform-receipts',
    view: 'refunds',
  },
  '/caiwu/platform-invoices': {
    path: '/caiwu/platform-receipts',
    view: 'invoices',
  },
  '/caiwu/platform-allocations': {
    path: '/caiwu/platform-receipts',
    view: 'allocations',
  },
  '/caiwu/platform-procurement-payments': {
    path: '/caiwu/platform-procurement-requests',
    view: 'payments',
  },
  '/caiwu/platform-procurement-reimbursements': {
    path: '/caiwu/platform-procurement-requests',
    view: 'reimbursements',
  },
  '/caiwu/platform-procurement-costs': {
    path: '/caiwu/platform-costs',
    view: 'procurementCosts',
  },
};

/** Bookmarks and in-app links to absorbed pages keep working and keep their record/filter query. */
export function installMergedRouteRedirects(router: Router) {
  const target = router as Router & { [installationKey]?: boolean };
  if (target[installationKey]) return;
  target[installationKey] = true;
  router.beforeEach((to) => {
    const merged = mergedRoutes[to.path];
    if (!merged) return;
    return {
      path: merged.path,
      query: { ...to.query, view: merged.view },
      hash: to.hash,
      replace: true,
    };
  });
}
