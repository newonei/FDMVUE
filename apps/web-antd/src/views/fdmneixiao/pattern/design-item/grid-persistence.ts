import type { VxeTableGridOptions } from '#/adapter/vxe-table';

const PATTERN_DESIGN_ITEM_GRID_ID = 'fdm-neixiao-pattern-design-item-grid';

function normalizeIdentityPart(value: null | number | string | undefined) {
  return String(value ?? '').trim() || 'unknown';
}

/**
 * VXE Table uses the grid id as the localStorage namespace. Keep settings
 * isolated by login tenant and user so accounts sharing a browser do not
 * overwrite each other's column preferences.
 */
export function createPatternDesignItemGridId(
  tenantId: null | number | string | undefined,
  userId: null | number | string | undefined,
) {
  return `${PATTERN_DESIGN_ITEM_GRID_ID}--tenant-${normalizeIdentityPart(
    tenantId,
  )}--user-${normalizeIdentityPart(userId)}`;
}

export const PATTERN_DESIGN_ITEM_GRID_CUSTOM_CONFIG = {
  immediate: true,
  storage: true,
} as const satisfies NonNullable<VxeTableGridOptions['customConfig']>;
