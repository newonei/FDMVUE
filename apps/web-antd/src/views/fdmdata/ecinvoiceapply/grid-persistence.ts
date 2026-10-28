import type { VxeTableGridOptions } from '#/adapter/vxe-table';

const EC_INVOICE_APPLY_GRID_ID = 'fdm-data-ec-invoice-apply-grid';

function normalizeIdentityPart(value: null | number | string | undefined) {
  return String(value ?? '').trim() || 'unknown';
}

/**
 * VXE Table 用 grid id 作为 localStorage 命名空间；按租户和用户隔离，
 * 避免同一浏览器多个账号互相覆盖列设置。
 */
export function createEcInvoiceApplyGridId(
  tenantId: null | number | string | undefined,
  userId: null | number | string | undefined,
) {
  return `${EC_INVOICE_APPLY_GRID_ID}--tenant-${normalizeIdentityPart(
    tenantId,
  )}--user-${normalizeIdentityPart(userId)}`;
}

export const EC_INVOICE_APPLY_GRID_CUSTOM_CONFIG = {
  immediate: true,
  mode: 'modal',
  storage: true,
} as const satisfies NonNullable<VxeTableGridOptions['customConfig']>;
