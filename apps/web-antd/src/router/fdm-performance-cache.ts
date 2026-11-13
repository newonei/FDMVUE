import type { AppRouteRecordRaw } from '@vben/types';

const ASSESSMENT_MANAGEMENT_COMPONENT = 'fdmperformance/batches/index';

/** Apply the page cache before backend routes receive their KeepAlive wrappers. */
function enablePerformanceManagementCache(
  menus: AppRouteRecordRaw[],
): AppRouteRecordRaw[] {
  return menus.map((menu) => {
    const component =
      typeof menu.component === 'string'
        ? menu.component
            .trim()
            .split('?', 1)[0]!
            .replaceAll('\\', '/')
            .replace(/^\/+/, '')
            .replace(/\.vue$/, '')
        : '';

    return {
      ...menu,
      ...(component === ASSESSMENT_MANAGEMENT_COMPONENT
        ? { keepAlive: true }
        : {}),
      ...(menu.children
        ? { children: enablePerformanceManagementCache(menu.children) }
        : {}),
    };
  });
}

export { enablePerformanceManagementCache };
