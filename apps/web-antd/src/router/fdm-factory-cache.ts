import type { AppRouteRecordRaw } from '@vben/types';

/** 在生成路由及 KeepAlive 包装前统一启用工厂页面缓存。 */
function enableFactoryPageCache(
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

    // 旧 AI 排单入口仅在 mounted 时跳转，不缓存这个中转页。
    const isFactoryPage =
      component.startsWith('fdmgongchang/') &&
      component !== 'fdmgongchang/schedule/index';

    return {
      ...menu,
      ...(isFactoryPage ? { keepAlive: true } : {}),
      ...(menu.children
        ? { children: enableFactoryPageCache(menu.children) }
        : {}),
    };
  });
}

export { enableFactoryPageCache };
