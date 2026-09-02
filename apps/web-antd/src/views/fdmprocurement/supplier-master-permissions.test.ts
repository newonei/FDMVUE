import { describe, expect, it } from 'vitest';

import { canUseSupplierMasterAction } from './supplier-master-permissions';

describe('supplier master permission policy', () => {
  it('keeps quote reads behind the controller sensitive permission', () => {
    expect(
      canUseSupplierMasterAction(
        'QUOTE_READ',
        (code) => code === 'fdmprocurement:supplier-quote:query-sensitive',
      ),
    ).toBe(false);
    expect(
      canUseSupplierMasterAction(
        'QUOTE_READ',
        (code) => code === 'fdmprocurement:supplier-quote:view-sensitive',
      ),
    ).toBe(true);
  });

  it('does not infer create or update from query permissions', () => {
    const queryOnly = (code: string) => code.endsWith(':query');
    expect(canUseSupplierMasterAction('SUPPLIER_READ', queryOnly)).toBe(true);
    expect(canUseSupplierMasterAction('SUPPLIER_CREATE', queryOnly)).toBe(
      false,
    );
    expect(canUseSupplierMasterAction('SUPPLIER_UPDATE', queryOnly)).toBe(
      false,
    );
    expect(
      canUseSupplierMasterAction('SUPPLIER_AUTHORIZE_COMPANY', queryOnly),
    ).toBe(false);
    expect(
      canUseSupplierMasterAction('SUPPLIER_PRODUCT_CREATE', queryOnly),
    ).toBe(false);
  });

  it('uses the dedicated company authorization permission', () => {
    expect(
      canUseSupplierMasterAction(
        'SUPPLIER_AUTHORIZE_COMPANY',
        (code) => code === 'fdmprocurement:supplier:authorize-company',
      ),
    ).toBe(true);
    expect(
      canUseSupplierMasterAction(
        'SUPPLIER_AUTHORIZE_COMPANY',
        (code) => code === 'fdmprocurement:supplier:update',
      ),
    ).toBe(false);
  });

  it('matches the supplier-product controller permissions for compliance facts', () => {
    expect(
      canUseSupplierMasterAction(
        'COMPLIANCE_READ',
        (code) => code === 'fdmprocurement:supplier-product:query',
      ),
    ).toBe(true);
    expect(
      canUseSupplierMasterAction(
        'COMPLIANCE_PUBLISH',
        (code) => code === 'fdmprocurement:supplier-product:create',
      ),
    ).toBe(true);
    expect(
      canUseSupplierMasterAction(
        'COMPLIANCE_PUBLISH',
        (code) => code === 'fdmprocurement:supplier-product:query',
      ),
    ).toBe(false);
  });
});
