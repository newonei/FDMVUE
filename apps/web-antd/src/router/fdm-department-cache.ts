import type { AppRouteRecordRaw } from '@vben/types';

const DEPARTMENT_PATHS = new Set(['fdmprocurement', 'fdmwaimao', 'neixiao']);
const DEPARTMENT_COMPONENT_PREFIXES = [
  'fdmplatform/purchase/',
  'fdmplatform/trade/',
  'fdmplatform/domestic/',
  'fdmplatform/portal/purchase/',
  'fdmplatform/portal/trade/',
  'fdmplatform/portal/domestic/',
  'fdmneixiao/',
];

/** 按部门目录递归启用缓存，也覆盖部门复用的付款、报销等组件。 */
function enableDepartmentPageCache(
  menus: AppRouteRecordRaw[],
  inDepartment = false,
): AppRouteRecordRaw[] {
  return menus.map((menu) => {
    const path = menu.path?.replaceAll(/^\/+|\/+$/g, '').split('/')[0] ?? '';
    const owned = inDepartment || DEPARTMENT_PATHS.has(path);
    const component =
      typeof menu.component === 'string'
        ? menu.component
            .trim()
            .split('?', 1)[0]!
            .replaceAll('\\', '/')
            .replace(/^\/+/, '')
            .replace(/\.vue$/, '')
        : '';
    const page =
      component && !['BasicLayout', 'IFrameView', 'Layout'].includes(component);
    const cache =
      page &&
      (owned ||
        DEPARTMENT_COMPONENT_PREFIXES.some((prefix) =>
          component.startsWith(prefix),
        ));
    return {
      ...menu,
      ...(cache ? { keepAlive: true } : {}),
      ...(menu.children
        ? { children: enableDepartmentPageCache(menu.children, owned) }
        : {}),
    };
  });
}

export { enableDepartmentPageCache };
