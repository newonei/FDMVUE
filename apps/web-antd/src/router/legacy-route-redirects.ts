import type { RouteLocationNormalized, Router } from 'vue-router';

const LEGACY_ROUTE_REDIRECTS = [
  {
    from: '/analytics',
    name: 'LegacyAnalyticsRedirect',
    to: '/dashboard/analytics',
  },
  {
    from: '/workspace',
    name: 'LegacyWorkspaceRedirect',
    to: '/dashboard/workspace',
  },
] as const;

/** Grouping existing server menus changes their page URLs. */
const LEGACY_FALLBACK_REDIRECTS = [
  { from: '/system/mcp', to: '/client-config/mcp' },
  { from: '/fdmai/workbench-key', to: '/client-config/workbench-key' },
  { from: '/skill-market', to: '/client-config/skill-market' },
  { from: '/plugin-market', to: '/client-config/plugin-market' },
  { from: '/desktop-feedback', to: '/client-config/desktop-feedback' },
  {
    from: '/gongchang/production-order',
    to: '/gongchang/production/production-order',
  },
  {
    from: '/gongchang/schedule',
    to: '/gongchang/production/schedule',
  },
  {
    from: '/gongchang/stage-stock',
    to: '/gongchang/production/stage-stock',
  },
  {
    from: '/gongchang/worker',
    to: '/gongchang/people/worker',
  },
  {
    from: '/gongchang/wage',
    to: '/gongchang/people/wage',
  },
] as const;

function resolveLegacyFallbackPath(path: string) {
  const normalized = path.replace(/\/$/, '');
  return LEGACY_FALLBACK_REDIRECTS.find((route) => route.from === normalized)
    ?.to;
}

/** Resolve against the current user's generated menu routes after login. */
function legacyFallback(
  router: Router,
  to: ReturnType<Router['resolve']> | RouteLocationNormalized,
) {
  if (to.name !== 'FallbackNotFound') return;
  const path = resolveLegacyFallbackPath(to.path);
  if (!path) return;
  const target = router.resolve(path);
  if (target.matched.length === 0 || target.name === 'FallbackNotFound') return;
  return { hash: to.hash, path, query: to.query, replace: true };
}

function resolveLegacyRoutePath(path: string) {
  return (
    LEGACY_ROUTE_REDIRECTS.find((route) => route.from === path)?.to ?? path
  );
}

export {
  LEGACY_FALLBACK_REDIRECTS,
  LEGACY_ROUTE_REDIRECTS,
  legacyFallback,
  resolveLegacyFallbackPath,
  resolveLegacyRoutePath,
};
