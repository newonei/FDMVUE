import type { RouteLocationNormalized, Router } from 'vue-router';

const installationKey = Symbol.for('fdmplatform.tabPolicy');

/** Backend menus register every page of this module with an `FdmPlatform*` component name. */
export function isPlatformRoute(to: RouteLocationNormalized) {
  const name = to.matched.at(-1)?.name;
  return typeof name === 'string' && name.startsWith('FdmPlatform');
}

/**
 * One tab per menu page: detail, filter and sub-tab query changes update the open tab in place
 * instead of opening a copy. Pages already follow `route.query` through their watchers.
 */
export function installPlatformTabPolicy(router: Router) {
  const target = router as Router & { [installationKey]?: boolean };
  if (target[installationKey]) return;
  target[installationKey] = true;
  router.beforeResolve((to) => {
    if (!isPlatformRoute(to)) return;
    // The host tabbar reads the leaf record; its KeepAlive reads the merged route meta.
    to.meta.fullPathKey = false;
    const leaf = to.matched.at(-1);
    if (leaf) leaf.meta.fullPathKey = false;
  });
}
