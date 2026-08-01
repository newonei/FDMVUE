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

function resolveLegacyRoutePath(path: string) {
  return (
    LEGACY_ROUTE_REDIRECTS.find((route) => route.from === path)?.to ?? path
  );
}

export { LEGACY_ROUTE_REDIRECTS, resolveLegacyRoutePath };
