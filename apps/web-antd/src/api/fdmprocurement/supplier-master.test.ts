import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  authorizeProcurementSupplierCompany,
  createProcurementSupplier,
  getProcurementSupplierList,
  updateProcurementSupplier,
} from './supplier';
import {
  createProcurementSupplierProduct,
  getProcurementSupplierProductList,
} from './supplier-product';
import {
  createProcurementSupplierQuoteVersion,
  getProcurementSupplierQuoteList,
} from './supplier-quote';

const requestMocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
}));

vi.mock('#/api/request', () => ({ requestClient: requestMocks }));

describe('fdmprocurement supplier master API contract', () => {
  beforeEach(() => {
    requestMocks.get.mockReset();
    requestMocks.post.mockReset();
    requestMocks.put.mockReset();
  });

  it('normalizes every supplier Long ID without number coercion', async () => {
    requestMocks.get.mockResolvedValueOnce([
      {
        companyId: '9223372036854775801',
        id: '9223372036854775802',
        supplierCode: 'S-1',
        supplierName: '供应商',
      },
    ]);
    requestMocks.post.mockResolvedValueOnce('9223372036854775806');

    const rows = await getProcurementSupplierList({
      companyId: '9223372036854775801',
      keyword: 'S-1',
    });
    const id = await createProcurementSupplier({
      admissionStatus: 'APPROVED',
      approvalStatus: 'APPROVED',
      companyId: '9223372036854775801',
      companyStatus: 'ENABLED',
      directShipAllowed: false,
      status: 'ENABLED',
      supplierCode: 'S-1',
      supplierName: '供应商',
      validFrom: '2026-01-01',
      validUntil: '2026-12-31',
    });

    expect(requestMocks.get).toHaveBeenCalledWith(
      '/fdmprocurement/supplier/list',
      {
        params: { companyId: '9223372036854775801', keyword: 'S-1' },
      },
    );
    expect(rows[0]?.id).toBe('9223372036854775802');
    expect(rows[0]?.companyId).toBe('9223372036854775801');
    expect(id).toBe('9223372036854775806');
  });

  it('carries supplier optimistic version on update', async () => {
    requestMocks.put.mockResolvedValueOnce(true);
    await updateProcurementSupplier({
      approvalStatus: 'APPROVED',
      companyId: '9223372036854775801',
      expectedVersion: 7,
      id: '9223372036854775802',
      status: 'DISABLED',
      supplierName: '已停用供应商',
    });
    expect(requestMocks.put).toHaveBeenCalledWith(
      '/fdmprocurement/supplier/update',
      expect.objectContaining({
        expectedVersion: 7,
        id: '9223372036854775802',
      }),
    );
  });

  it('carries the independent company-link version on authorization', async () => {
    requestMocks.put.mockResolvedValueOnce(true);
    await authorizeProcurementSupplierCompany({
      admissionStatus: 'APPROVED',
      companyId: '9223372036854775801',
      directShipAllowed: true,
      expectedVersion: 11,
      status: 'ENABLED',
      supplierId: '9223372036854775802',
      validFrom: '2026-01-01',
      validUntil: '2026-12-31',
    });
    expect(requestMocks.put).toHaveBeenCalledWith(
      '/fdmprocurement/supplier/authorize-company',
      expect.objectContaining({
        expectedVersion: 11,
        supplierId: '9223372036854775802',
      }),
    );
  });

  it('uses real supplier-product list/create endpoints and string IDs', async () => {
    requestMocks.get.mockResolvedValueOnce([
      {
        companyId: 1,
        id: 2,
        productId: 3,
        skuId: 4,
        supplierId: 5,
      },
    ]);
    requestMocks.post.mockResolvedValueOnce(6);
    const rows = await getProcurementSupplierProductList({
      companyId: '1',
      skuId: '4',
    });
    const id = await createProcurementSupplierProduct({
      approvalStatus: 'APPROVED',
      companyId: '1',
      mappingType: 'EXACT',
      minOrderQty: '1',
      packageMultiple: '1',
      productId: '3',
      productVersionToken: 'P1',
      purchaseUnit: 'PCS',
      skuId: '4',
      supplierId: '5',
      supplierProductCode: 'SP-1',
      unitConversionFactor: '1',
      validFrom: '2026-01-01',
      validUntil: '2026-12-31',
    });
    expect(rows[0]).toMatchObject({
      companyId: '1',
      id: '2',
      productId: '3',
      skuId: '4',
      supplierId: '5',
    });
    expect(id).toBe('6');
  });

  it('uses the sensitive quote endpoints and normalizes nested tier IDs', async () => {
    requestMocks.get.mockResolvedValueOnce([
      {
        companyId: 1,
        id: 2,
        skuId: 3,
        supplierId: 4,
        supplierProductId: 5,
        tiers: [{ id: 6, minQty: '1', unitPrice: '10' }],
      },
    ]);
    requestMocks.post.mockResolvedValueOnce(7);
    const rows = await getProcurementSupplierQuoteList({
      companyId: '1',
      supplierProductId: '5',
    });
    const id = await createProcurementSupplierQuoteVersion({
      companyId: '1',
      currency: 'CNY',
      leadTimeDays: 7,
      paymentTerms: '月结',
      quoteNo: 'Q-1',
      status: 'ACTIVE',
      supplierProductId: '5',
      taxIncluded: true,
      taxRate: '0.13',
      tiers: [{ minQty: '1', unitPrice: '10' }],
      unitFreightAmount: '0',
      validFrom: '2026-01-01',
      validUntil: '2026-12-31',
    });
    expect(rows[0]).toMatchObject({ id: '2', supplierProductId: '5' });
    expect(rows[0]?.tiers[0]?.id).toBe('6');
    expect(id).toBe('7');
  });
});
