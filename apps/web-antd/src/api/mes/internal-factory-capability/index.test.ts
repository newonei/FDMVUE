import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createInternalFactoryCapability,
  getInternalFactoryCapability,
  getInternalFactoryCapabilityPage,
  getInternalFactoryList,
  updateInternalFactoryCapability,
} from './index';

const requestMocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
}));

vi.mock('#/api/request', () => ({ requestClient: requestMocks }));

function rawCapability() {
  return {
    authorityHash: 'a'.repeat(64),
    companyId: 11,
    directShipSupported: true,
    evidenceByUserId: 15,
    evidenceMode: 'HUMAN_CONFIRMED',
    evidenceNote: '现场确认',
    evidenceTime: '2026-08-31T10:00:00+08:00',
    evidenceValidUntil: '2026-09-30T23:59:59+08:00',
    factoryId: 12,
    id: 10,
    productSkuId: 13,
    productVersionToken: 'SKU-V4',
    status: 'ELIGIBLE',
    supportedCertificationRequirements: ['CE'],
    supportedCountryComplianceRequirements: ['CN'],
    supportedCustomerComplianceRequirements: [],
    supportedPackagingRequirements: ['CARTON'],
    validFrom: '2026-09-01',
    version: 4,
  };
}

describe('mES internal factory capability API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses the exact page contract and normalizes every Long identity to string', async () => {
    requestMocks.get.mockResolvedValueOnce({
      list: [rawCapability()],
      total: 1,
    });

    const params = {
      companyId: '11',
      effectiveDate: '2026-09-10',
      factoryId: '12',
      pageNo: 2,
      pageSize: 20,
      productSkuId: '13',
      status: 'ELIGIBLE' as const,
    };
    const result = await getInternalFactoryCapabilityPage(params);

    expect(requestMocks.get).toHaveBeenCalledWith(
      '/mes/internal-factory-capability/page',
      { params },
    );
    expect(result.list[0]).toMatchObject({
      companyId: '11',
      evidenceByUserId: '15',
      factoryId: '12',
      id: '10',
      productSkuId: '13',
    });
    expect(result.list[0]?.supportedPackagingRequirements).toEqual(['CARTON']);
  });

  it('normalizes get/create results and sends CAS version unchanged', async () => {
    requestMocks.get.mockResolvedValueOnce(rawCapability());
    requestMocks.post.mockResolvedValueOnce(
      90_071_992_547_409_931_234n.toString(),
    );
    requestMocks.put.mockResolvedValueOnce(true);

    const detail = await getInternalFactoryCapability({
      companyId: '11',
      id: '10',
    });
    expect(detail.id).toBe('10');

    const base = {
      companyId: '11',
      directShipSupported: true,
      evidenceMode: 'AUTHORITATIVE' as const,
      evidenceSourceName: '能力台账',
      evidenceSourceRefId: 'CAP-2026-001',
      evidenceSourceSystem: 'MES',
      evidenceSourceVersion: '2026.08',
      evidenceTime: '2026-08-31T10:00:00+08:00',
      evidenceValidUntil: '2026-09-30T23:59:59+08:00',
      factoryId: '12',
      productSkuId: '13',
      productVersionToken: 'SKU-V4',
      status: 'ELIGIBLE' as const,
      supportedCertificationRequirements: ['CE'],
      supportedCountryComplianceRequirements: [],
      supportedCustomerComplianceRequirements: [],
      supportedPackagingRequirements: ['CARTON'],
      validFrom: '2026-09-01',
    };
    await expect(createInternalFactoryCapability(base)).resolves.toBe(
      '90071992547409931234',
    );
    await updateInternalFactoryCapability({ ...base, id: '10', version: 4 });

    expect(requestMocks.post).toHaveBeenCalledWith(
      '/mes/internal-factory-capability/create',
      base,
    );
    expect(requestMocks.put).toHaveBeenCalledWith(
      '/mes/internal-factory-capability/update',
      expect.objectContaining({ id: '10', version: 4 }),
    );
  });

  it('normalizes factory suggestions without turning Long values into numbers', async () => {
    requestMocks.get.mockResolvedValueOnce([
      {
        companyId: 11,
        defaultLeadTimeDays: 3,
        factoryCode: 'SZ-01',
        factoryName: '深圳工厂',
        id: 12,
        status: 'ENABLED',
        timezone: 'Asia/Shanghai',
        validFrom: '2026-01-01',
        version: 2,
      },
    ]);

    const result = await getInternalFactoryList({
      companyId: '11',
      status: 'ENABLED',
    });

    expect(result[0]).toMatchObject({ companyId: '11', id: '12' });
    expect(requestMocks.get).toHaveBeenCalledWith(
      '/mes/internal-factory/list',
      {
        params: { companyId: '11', status: 'ENABLED' },
      },
    );
  });

  it('fails closed when a backend numeric Long is already unsafe', async () => {
    requestMocks.get.mockResolvedValueOnce({
      list: [{ ...rawCapability(), id: Number.MAX_SAFE_INTEGER + 1 }],
      total: 1,
    });

    await expect(
      getInternalFactoryCapabilityPage({
        companyId: '11',
        pageNo: 1,
        pageSize: 10,
      }),
    ).rejects.toThrow('capability.id');
  });
});
