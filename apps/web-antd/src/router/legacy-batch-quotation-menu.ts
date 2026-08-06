import type { AppRouteRecordRaw } from '@vben/types';

const LEGACY_BATCH_QUOTATION_COMPONENT = 'fdmcaiwu/batch-quotation/index';
const LEGACY_BATCH_QUOTATION_COMPONENT_NAME = 'FdmcaiwuBatchQuotation';
const LEGACY_BATCH_QUOTATION_PATH = '/caiwu/batch-quotation';

function normalizeComponent(component: string): string {
  return component
    .trim()
    .split('?', 1)[0]!
    .replaceAll('\\', '/')
    .replace(/^\/+/, '')
    .replace(/\.vue$/, '');
}

function resolveMenuPath(parentPath: string, path: string): string {
  const trimmedPath = path.trim();
  const combinedPath = trimmedPath.startsWith('/')
    ? trimmedPath
    : `${parentPath}/${trimmedPath}`;

  return `/${combinedPath}`.replaceAll(/\/{2,}/g, '/').replace(/\/$/, '');
}

function isLegacyBatchQuotationMenu(
  menu: AppRouteRecordRaw,
  fullPath: string,
): boolean {
  const matchesComponent =
    typeof menu.component === 'string' &&
    normalizeComponent(menu.component) === LEGACY_BATCH_QUOTATION_COMPONENT;
  const matchesComponentName =
    menu.componentName?.trim() === LEGACY_BATCH_QUOTATION_COMPONENT_NAME;

  return (
    matchesComponent ||
    matchesComponentName ||
    fullPath === LEGACY_BATCH_QUOTATION_PATH
  );
}

/**
 * Keeps the legacy batch quotation route available for bookmarks while hiding
 * its standalone menu entry. Batch quotation now lives in /caiwu/quotation.
 */
function hideLegacyBatchQuotationMenu(
  menus: AppRouteRecordRaw[],
  parentPath = '',
): AppRouteRecordRaw[] {
  return menus.map((menu) => {
    const fullPath = resolveMenuPath(parentPath, menu.path);

    return {
      ...menu,
      ...(isLegacyBatchQuotationMenu(menu, fullPath) ? { visible: false } : {}),
      ...(menu.children
        ? { children: hideLegacyBatchQuotationMenu(menu.children, fullPath) }
        : {}),
    };
  });
}

export { hideLegacyBatchQuotationMenu };
