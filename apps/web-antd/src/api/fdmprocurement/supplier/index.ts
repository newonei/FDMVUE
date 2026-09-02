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

  export interface CompanyBinding {
    admissionStatus: ApprovalStatus;
    companyId: string;
    directShipAllowed: boolean;
    status: CompanyStatus;
    validFrom: string;
    validUntil: string;
    version: number;
  }

  export interface Supplier {
    approvalStatus: ApprovalStatus;
    companyBindings: CompanyBinding[];
    id: string;
    remark?: null | string;
    status: SupplierStatus;
    supplierCode: string;
    supplierName: string;
    version: number;
  }

  export interface SaveReq {
    admissionStatus: ApprovalStatus;
    approvalStatus: ApprovalStatus;
    companyId: string;
    companyStatus: CompanyStatus;
    directShipAllowed: boolean;
    remark?: string;
    status: SupplierStatus;
    supplierCode: string;
    supplierName: string;
    validFrom: string;
    validUntil: string;
  }

  export interface UpdateReq {
    approvalStatus: ApprovalStatus;
    expectedVersion: number;
    id: string;
    remark?: string;
    status: SupplierStatus;
    supplierName: string;
  }

  export interface BindCompanyReq {
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
    companyBindings: (value.companyBindings || []).map((binding) => ({
      ...binding,
      companyId: normalizeId(
        binding.companyId,
        'supplier.companyBindings.companyId',
      ),
    })),
    id: normalizeId(value.id, 'supplier.id'),
  };
}

export async function getProcurementSupplierList(params: { keyword?: string }) {
  const result = await requestClient.get<FdmProcurementSupplierApi.Supplier[]>(
    `${BASE_URL}/list`,
    { params },
  );
  return (result || []).map((supplier) => normalizeSupplier(supplier));
}

export async function getProcurementSupplier(id: string) {
  const result = await requestClient.get<FdmProcurementSupplierApi.Supplier>(
    `${BASE_URL}/get`,
    { params: { id } },
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

export function bindProcurementSupplierCompany(
  data: FdmProcurementSupplierApi.BindCompanyReq,
) {
  return requestClient.put<boolean>(`${BASE_URL}/bind-company`, data);
}
