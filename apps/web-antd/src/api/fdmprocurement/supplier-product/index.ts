import { requestClient } from '#/api/request';

import { normalizeId } from '../id-normalizer';

export namespace FdmProcurementSupplierProductApi {
  export interface SupplierProduct {
    approvalStatus: 'APPROVED' | 'PENDING' | 'REJECTED';
    capacityValidUntil?: null | string;
    companyId: string;
    complianceSnapshotHash?: null | string;
    complianceVersion: number;
    id: string;
    mappingType: 'APPROVED_SUBSTITUTE' | 'EXACT';
    minOrderQty: number | string;
    packageMultiple: number | string;
    productId: string;
    productVersionToken: string;
    purchaseUnit: string;
    skuId: string;
    supplierId: string;
    supplierProductCode: string;
    supplierProductName?: null | string;
    unitConversionFactor: number | string;
    unitConversionToken: string;
    validFrom: string;
    validUntil: string;
    verifiedCapacityQty?: null | number | string;
    version: number;
  }

  export type ComplianceFactType =
    | 'CERTIFICATION'
    | 'COUNTRY_COMPLIANCE'
    | 'CUSTOMER_COMPLIANCE'
    | 'DELIVERY_LOCATION'
    | 'INCOTERM'
    | 'PACKAGING';

  export interface ComplianceFact {
    companyId: string;
    evidenceReference: string;
    evidenceStatus: 'VERIFIED';
    factCode: string;
    factHash: string;
    factSetVersion: number;
    factType: ComplianceFactType;
    id: string;
    scopeType: 'CUSTOMER' | 'GLOBAL';
    scopeValue?: null | string;
    supplierId: string;
    supplierProductId: string;
    validFrom: string;
    validUntil: string;
  }

  export interface ComplianceFactReq {
    evidenceReference: string;
    factCode: string;
    factType: ComplianceFactType;
    scopeType: 'CUSTOMER' | 'GLOBAL';
    scopeValue?: string;
    validFrom: string;
    validUntil: string;
  }

  export interface PublishComplianceReq {
    companyId: string;
    expectedComplianceVersion: number;
    expectedProductVersion: number;
    facts: ComplianceFactReq[];
    supplierProductId: string;
  }

  export interface CreateReq {
    approvalStatus: SupplierProduct['approvalStatus'];
    capacityValidUntil?: string;
    companyId: string;
    mappingType: SupplierProduct['mappingType'];
    minOrderQty: number | string;
    packageMultiple: number | string;
    productId: string;
    productVersionToken: string;
    purchaseUnit: string;
    skuId: string;
    supplierId: string;
    supplierProductCode: string;
    supplierProductName?: string;
    unitConversionFactor: number | string;
    validFrom: string;
    validUntil: string;
    verifiedCapacityQty?: number | string;
  }
}

const BASE_URL = '/fdmprocurement/supplier-product';

export function normalizeSupplierProduct(
  value: FdmProcurementSupplierProductApi.SupplierProduct,
): FdmProcurementSupplierProductApi.SupplierProduct {
  return {
    ...value,
    companyId: normalizeId(value.companyId, 'supplierProduct.companyId'),
    id: normalizeId(value.id, 'supplierProduct.id'),
    productId: normalizeId(value.productId, 'supplierProduct.productId'),
    skuId: normalizeId(value.skuId, 'supplierProduct.skuId'),
    supplierId: normalizeId(value.supplierId, 'supplierProduct.supplierId'),
  };
}

export async function getProcurementSupplierProductList(params: {
  companyId: string;
  skuId?: string;
}) {
  const result = await requestClient.get<
    FdmProcurementSupplierProductApi.SupplierProduct[]
  >(`${BASE_URL}/list`, { params });
  return (result || []).map((supplierProduct) =>
    normalizeSupplierProduct(supplierProduct),
  );
}

export async function createProcurementSupplierProduct(
  data: FdmProcurementSupplierProductApi.CreateReq,
) {
  return normalizeId(
    await requestClient.post<number | string>(`${BASE_URL}/create`, data),
    'supplierProduct.create.id',
  );
}

export function normalizeComplianceFact(
  value: FdmProcurementSupplierProductApi.ComplianceFact,
): FdmProcurementSupplierProductApi.ComplianceFact {
  return {
    ...value,
    companyId: normalizeId(
      value.companyId,
      'supplierProductCompliance.companyId',
    ),
    id: normalizeId(value.id, 'supplierProductCompliance.id'),
    supplierId: normalizeId(
      value.supplierId,
      'supplierProductCompliance.supplierId',
    ),
    supplierProductId: normalizeId(
      value.supplierProductId,
      'supplierProductCompliance.supplierProductId',
    ),
  };
}

/**
 * Returns the current immutable compliance fact set published for one mapping.
 * The backend deliberately does not return facts from superseded versions here.
 */
export async function getProcurementSupplierProductComplianceList(params: {
  companyId: string;
  supplierProductId: string;
}) {
  const result = await requestClient.get<
    FdmProcurementSupplierProductApi.ComplianceFact[]
  >(`${BASE_URL}/compliance/list`, { params });
  return (result || []).map((fact) => normalizeComplianceFact(fact));
}

/** Publishes a complete replacement fact set and returns its new version. */
export async function publishProcurementSupplierProductCompliance(
  data: FdmProcurementSupplierProductApi.PublishComplianceReq,
) {
  return requestClient.post<number>(`${BASE_URL}/compliance/publish`, data);
}
