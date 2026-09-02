import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  getProcurementSupplierProductComplianceList,
  publishProcurementSupplierProductCompliance,
} from './index';

const requestMocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
}));

vi.mock('#/api/request', () => ({ requestClient: requestMocks }));

describe('fdmprocurement supplier-product compliance API', () => {
  beforeEach(() => {
    requestMocks.get.mockReset();
    requestMocks.post.mockReset();
  });

  it('calls the current fact-set endpoint and preserves all Long IDs as strings', async () => {
    requestMocks.get.mockResolvedValueOnce([
      {
        companyId: '9223372036854775801',
        evidenceReference: 'certificate://CE-001',
        evidenceStatus: 'VERIFIED',
        factCode: 'CE',
        factHash: 'a'.repeat(64),
        factSetVersion: 3,
        factType: 'CERTIFICATION',
        id: '9223372036854775802',
        scopeType: 'GLOBAL',
        supplierId: '9223372036854775803',
        supplierProductId: '9223372036854775804',
        validFrom: '2026-01-01',
        validUntil: '2027-01-01',
      },
    ]);

    const result = await getProcurementSupplierProductComplianceList({
      companyId: '9223372036854775801',
      supplierProductId: '9223372036854775804',
    });

    expect(requestMocks.get).toHaveBeenCalledWith(
      '/fdmprocurement/supplier-product/compliance/list',
      {
        params: {
          companyId: '9223372036854775801',
          supplierProductId: '9223372036854775804',
        },
      },
    );
    expect(result[0]).toMatchObject({
      companyId: '9223372036854775801',
      id: '9223372036854775802',
      supplierId: '9223372036854775803',
      supplierProductId: '9223372036854775804',
    });
  });

  it('publishes a complete version with both optimistic-lock versions', async () => {
    requestMocks.post.mockResolvedValueOnce(4);
    const payload = {
      companyId: '1',
      expectedComplianceVersion: 3,
      expectedProductVersion: 7,
      facts: [
        {
          evidenceReference: 'certificate://CE-001',
          factCode: 'CE',
          factType: 'CERTIFICATION' as const,
          scopeType: 'GLOBAL' as const,
          validFrom: '2026-01-01',
          validUntil: '2027-01-01',
        },
      ],
      supplierProductId: '10',
    };

    await expect(
      publishProcurementSupplierProductCompliance(payload),
    ).resolves.toBe(4);
    expect(requestMocks.post).toHaveBeenCalledWith(
      '/fdmprocurement/supplier-product/compliance/publish',
      payload,
    );
  });
});
