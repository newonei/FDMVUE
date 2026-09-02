import { requestClient } from '#/api/request';

import { normalizeId } from '../id-normalizer';

export namespace FdmProcurementSupplierApi {
  export type ApprovalStatus = 'APPROVED' | 'PENDING' | 'REJECTED';
  export type CompanyStatus = 'DISABLED' | 'ENABLED';
  export type SupplierStatus =
    | 'BLACKLISTED'
    | 'DISABLED'
    | 'ENABLED'
    | 'FROZEN';

  export interface Supplier {
    admissionStatus: ApprovalStatus;
    approvalStatus: ApprovalStatus;
    companyId: string;
    companyStatus: CompanyStatus;
    companyVersion: number;
    directShipAllowed: boolean;
    erpSupplierId?: null | string;
    id: string;
    remark?: null | string;
    status: SupplierStatus;
    supplierCode: string;
    supplierName: string;
    validFrom: string;
    validUntil: string;
    version: number;
  }

  export interface SaveReq {
    admissionStatus: ApprovalStatus;
    approvalStatus: ApprovalStatus;
    companyId: string;
    companyStatus: CompanyStatus;
    directShipAllowed: boolean;
    erpSupplierId?: string;
    remark?: string;
    status: SupplierStatus;
    supplierCode: string;
    supplierName: string;
    validFrom: string;
    validUntil: string;
  }

  export interface UpdateReq {
    approvalStatus: ApprovalStatus;
    companyId: string;
    erpSupplierId?: string;
    expectedVersion: number;
    id: string;
    remark?: string;
    status: SupplierStatus;
    supplierName: string;
  }

  export interface AuthorizeCompanyReq {
    admissionStatus: ApprovalStatus;
    companyId: string;
    directShipAllowed: boolean;
    expectedVersion: number;
    status: CompanyStatus;
    supplierId: string;
    validFrom: string;
    validUntil: string;
  }
}

const BASE_URL = '/fdmprocurement/supplier';

export function normalizeSupplier(
  value: FdmProcurementSupplierApi.Supplier,
): FdmProcurementSupplierApi.Supplier {
  return {
    ...value,
    companyId: normalizeId(value.companyId, 'supplier.companyId'),
    id: normalizeId(value.id, 'supplier.id'),
  };
}

export async function getProcurementSupplierList(params: {
  companyId: string;
  keyword?: string;
}) {
  const result = await requestClient.get<FdmProcurementSupplierApi.Supplier[]>(
    `${BASE_URL}/list`,
    { params },
  );
  return (result || []).map((supplier) => normalizeSupplier(supplier));
}

export async function getProcurementSupplier(companyId: string, id: string) {
  const result = await requestClient.get<FdmProcurementSupplierApi.Supplier>(
    `${BASE_URL}/get`,
    { params: { companyId, id } },
  );
  return normalizeSupplier(result);
}

export async function createProcurementSupplier(
  data: FdmProcurementSupplierApi.SaveReq,
) {
  return normalizeId(
    await requestClient.post<number | string>(`${BASE_URL}/create`, data),
    'supplier.create.id',
  );
}

export function updateProcurementSupplier(
  data: FdmProcurementSupplierApi.UpdateReq,
) {
  return requestClient.put<boolean>(`${BASE_URL}/update`, data);
}

export function authorizeProcurementSupplierCompany(
  data: FdmProcurementSupplierApi.AuthorizeCompanyReq,
) {
  return requestClient.put<boolean>(`${BASE_URL}/authorize-company`, data);
}
