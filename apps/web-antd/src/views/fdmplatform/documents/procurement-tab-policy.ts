import type { Router } from 'vue-router';

const installationKey = Symbol.for('fdmplatform.procurementTabPolicy');
const procurementPaths = new Set([
  '/caiwu/platform-procurement-costs',
  '/caiwu/platform-procurement-payments',
  '/caiwu/platform-procurement-reimbursements',
  '/caiwu/platform-procurement-requests',
  '/fdmprocurement/platform-orders',
]);

/** Install during lazy module loading, before navigation commits and the host creates its tab. */
export function installProcurementTabPolicy(router: Router) {
  const target = router as Router & { [installationKey]?: boolean };
  if (target[installationKey]) return;
  target[installationKey] = true;
  router.beforeResolve((to) => {
    if (!procurementPaths.has(to.path)) return;
    // The host tabbar reads the leaf record; its KeepAlive reads the merged route meta.
    to.meta.fullPathKey = false;
    const leaf = to.matched.at(-1);
    if (leaf) leaf.meta.fullPathKey = false;
  });
}
