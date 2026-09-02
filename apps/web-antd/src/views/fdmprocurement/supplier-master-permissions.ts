export type SupplierMasterAction =
  | 'COMPLIANCE_PUBLISH'
  | 'COMPLIANCE_READ'
  | 'QUOTE_CREATE'
  | 'QUOTE_READ'
  | 'SUPPLIER_BIND_COMPANY'
  | 'SUPPLIER_CREATE'
  | 'SUPPLIER_PRODUCT_CREATE'
  | 'SUPPLIER_PRODUCT_READ'
  | 'SUPPLIER_READ'
  | 'SUPPLIER_UPDATE';

const ACTION_PERMISSION: Record<SupplierMasterAction, string> = {
  COMPLIANCE_PUBLISH: 'fdmprocurement:supplier-product:create',
  COMPLIANCE_READ: 'fdmprocurement:supplier-product:query',
  QUOTE_CREATE: 'fdmprocurement:supplier-quote:create',
  QUOTE_READ: 'fdmprocurement:supplier-quote:view-sensitive',
  SUPPLIER_BIND_COMPANY: 'fdmprocurement:supplier:bind-company',
  SUPPLIER_CREATE: 'fdmprocurement:supplier:create',
  SUPPLIER_PRODUCT_CREATE: 'fdmprocurement:supplier-product:create',
  SUPPLIER_PRODUCT_READ: 'fdmprocurement:supplier-product:query',
  SUPPLIER_READ: 'fdmprocurement:supplier:query',
  SUPPLIER_UPDATE: 'fdmprocurement:supplier:update',
};

export function canUseSupplierMasterAction(
  action: SupplierMasterAction,
  hasPermission: (code: string) => boolean,
) {
  return hasPermission(ACTION_PERMISSION[action]);
}
