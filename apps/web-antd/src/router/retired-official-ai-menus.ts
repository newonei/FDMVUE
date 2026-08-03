import type { AppRouteRecordRaw } from '@vben/types';

const RETIRED_OFFICIAL_AI_ROOT_PATH = '/ai';
const RETIRED_OFFICIAL_AI_COMPONENT_PREFIX = 'ai/';

function isRetiredOfficialAiMenu(menu: AppRouteRecordRaw): boolean {
  return (
    menu.path === RETIRED_OFFICIAL_AI_ROOT_PATH ||
    (typeof menu.component === 'string' &&
      menu.component.startsWith(RETIRED_OFFICIAL_AI_COMPONENT_PREFIX))
  );
}

/**
 * Runtime guard for environments that have not applied the official AI
 * retirement migration yet. The replacement /fdmai tree is intentionally
 * outside both retired markers and remains untouched.
 */
function filterRetiredOfficialAiMenus(
  menus: AppRouteRecordRaw[],
): AppRouteRecordRaw[] {
  return menus.flatMap((menu) => {
    if (isRetiredOfficialAiMenu(menu)) {
      return [];
    }

    if (!menu.children) {
      return [menu];
    }

    return [
      {
        ...menu,
        children: filterRetiredOfficialAiMenus(menu.children),
      },
    ];
  });
}

export { filterRetiredOfficialAiMenus };
