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

/**
 * 只在旧地址已经找不到页面时才跳转（不注册成静态路由）：
 * 工厂部门菜单分组的 SQL 执行前旧地址照常可用，执行后旧链接、车间墙上的二维码自动跳到新地址。
 */
const LEGACY_FALLBACK_REDIRECTS = [
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
  return LEGACY_FALLBACK_REDIRECTS.find((route) => route.from === path)?.to;
}

function resolveLegacyRoutePath(path: string) {
  return (
    LEGACY_ROUTE_REDIRECTS.find((route) => route.from === path)?.to ?? path
  );
}

export {
  LEGACY_FALLBACK_REDIRECTS,
  LEGACY_ROUTE_REDIRECTS,
  resolveLegacyFallbackPath,
  resolveLegacyRoutePath,
};
