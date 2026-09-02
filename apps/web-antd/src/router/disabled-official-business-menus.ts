import type { AppRouteRecordRaw } from '@vben/types';

const DISABLED_ROOT_PATHS = new Set(['/ai', '/erp', '/mes', '/wms']);
const DISABLED_COMPONENT_PREFIXES = ['ai/', 'erp/', 'mes/', 'wms/'];

function isDisabledOfficialBusinessMenu(menu: AppRouteRecordRaw): boolean {
  const component = menu.component;
  return (
    DISABLED_ROOT_PATHS.has(menu.path) ||
    (typeof component === 'string' &&
      DISABLED_COMPONENT_PREFIXES.some((prefix) =>
        component.startsWith(prefix),
      ))
  );
}

/**
 * Runtime guard for environments whose menu table still contains disabled
 * official business modules. FDM-owned roots such as /fdmai and /fdmfactory
 * do not match an exact root or component prefix and remain untouched.
 */
function filterDisabledOfficialBusinessMenus(
  menus: AppRouteRecordRaw[],
): AppRouteRecordRaw[] {
  return menus.flatMap((menu) => {
    if (isDisabledOfficialBusinessMenu(menu)) {
      return [];
    }

    if (!menu.children) {
      return [menu];
    }

    return [
      {
        ...menu,
        children: filterDisabledOfficialBusinessMenus(menu.children),
      },
    ];
  });
}

export { filterDisabledOfficialBusinessMenus };
