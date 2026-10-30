const STORAGE_PREFIX = 'fdm-drawer-width:';

export const DEFAULT_MIN_DRAWER_WIDTH = 360;

/** 拖宽时给左侧留出的遮罩宽度，保证还能点抽屉外面关闭 */
export const DRAWER_OUTSIDE_GUTTER = 48;

export function drawerWidthStorageKey(key: string) {
  return `${STORAGE_PREFIX}${key}`;
}

/** 宽度限制在 [最小宽度, 视口宽度 - 留白]，可用空间比最小宽度还窄时以可用空间为准 */
export function clampDrawerWidth(
  width: number,
  minWidth: number,
  viewportWidth: number,
) {
  const max = Math.max(viewportWidth - DRAWER_OUTSIDE_GUTTER, 0);
  const min = Math.min(minWidth, max);
  return Math.round(Math.min(Math.max(width, min), max));
}

export function loadDrawerWidth(key: string) {
  try {
    const raw = window.localStorage.getItem(drawerWidthStorageKey(key));
    const width = Number(raw);
    return raw && Number.isFinite(width) && width > 0 ? width : undefined;
  } catch {
    return undefined;
  }
}

export function saveDrawerWidth(key: string, width: number) {
  try {
    window.localStorage.setItem(drawerWidthStorageKey(key), String(width));
  } catch {
    // 无痕模式或存储被禁用时只在本次页面里生效
  }
}

export function clearDrawerWidth(key: string) {
  try {
    window.localStorage.removeItem(drawerWidthStorageKey(key));
  } catch {
    // 同上
  }
}
