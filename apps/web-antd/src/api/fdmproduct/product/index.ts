import type { PageParam, PageResult } from '@vben/request';

import { requestClient } from '#/api/request';

export namespace FdmProductApi {
  export type DateTimeValue = number | string;
  export type DecimalValue = string;
  /** Framework CommonStatusEnum: 0 enabled, 1 disabled. */
  export type CommonStatus = 0 | 1;

  export interface CompanyOption {
    code?: null | string;
    id: string;
    name: string;
    shortName?: null | string;
  }

  export interface FormOptions {
    companies: CompanyOption[];
    defaultCompanyId?: null | string;
  }

  export interface Category {
    categoryCode: string;
    categoryName: string;
    companyId: string;
    createTime?: DateTimeValue | null;
    id: string;
    parentId?: null | string;
    remark?: null | string;
    sort: number;
    status: CommonStatus;
    updateTime?: DateTimeValue | null;
    version: number;
  }

  export interface CategoryListReq {
    companyId: string;
    status?: CommonStatus;
  }

  export interface CategorySaveReq {
    categoryCode: string;
    categoryName: string;
    companyId: string;
    parentId?: string;
    remark?: string;
    sort: number;
    status: CommonStatus;
  }

  export interface CategoryUpdateReq extends CategorySaveReq {
    expectedVersion: number;
    id: string;
  }

  export interface PageReq extends PageParam {
    categoryId?: string;
    companyId: string;
    keyword?: string;
    status?: CommonStatus;
  }

  export interface PageItem {
    baseUnit: string;
    categoryCode?: null | string;
    categoryId: string;
    categoryName?: null | string;
    companyId: string;
    exportEnabledSkuCount: number;
    id: string;
    imageUrl?: null | string;
    productCode: string;
    productName: string;
    skuCount: number;
    status: CommonStatus;
    updateTime?: DateTimeValue | null;
    version: number;
  }

  export interface Sku {
    exportCategoryId?: null | string;
    exportDisplayCode?: null | string;
    exportDisplayName?: null | string;
    exportEffectiveFrom?: null | string;
    exportEffectiveTo?: null | string;
    exportImageUrl?: null | string;
    exportProfileId?: null | string;
    exportReferenceCurrency?: null | string;
    exportReferencePrice?: DecimalValue | null;
    exportSalesUnit?: null | string;
    exportStatus?: CommonStatus | null;
    exportVersion?: null | number;
    grossWeightKg?: DecimalValue | null;
    heightCm?: DecimalValue | null;
    id: string;
    imageUrl?: null | string;
    lengthCm?: DecimalValue | null;
    netWeightKg?: DecimalValue | null;
    packagingDescription?: null | string;
    referenceCurrency?: null | string;
    referencePrice?: DecimalValue | null;
    remark?: null | string;
    skuCode: string;
    skuName: string;
    status: CommonStatus;
    unit?: null | string;
    version: number;
    widthCm?: DecimalValue | null;
  }

  export interface ProductDetail extends PageItem {
    createTime?: DateTimeValue | null;
    remark?: null | string;
    skus: Sku[];
  }

  export interface SkuSaveReq {
    expectedExportVersion?: number;
    expectedVersion?: number;
    exportCategoryId?: string;
    exportDisplayCode?: string;
    exportDisplayName?: string;
    exportEffectiveFrom?: string;
    exportEffectiveTo?: string;
    exportImageUrl?: string;
    exportProfileId?: string;
    exportReferenceCurrency?: string;
    exportReferencePrice?: DecimalValue;
    exportSalesUnit?: string;
    exportStatus: CommonStatus;
    grossWeightKg?: DecimalValue;
    heightCm?: DecimalValue;
    id?: string;
    imageUrl?: string;
    lengthCm?: DecimalValue;
    netWeightKg?: DecimalValue;
    packagingDescription?: string;
    referenceCurrency?: string;
    referencePrice?: DecimalValue;
    remark?: string;
    skuCode: string;
    skuName: string;
    status: CommonStatus;
    unit?: string;
    widthCm?: DecimalValue;
  }

  export interface ProductSaveReq {
    baseUnit: string;
    categoryId: string;
    companyId: string;
    imageUrl?: string;
    productCode: string;
    productName: string;
    remark?: string;
    skus: SkuSaveReq[];
    status: CommonStatus;
  }

  export interface ProductUpdateReq extends ProductSaveReq {
    expectedVersion: number;
    id: string;
  }

  export interface ProductStatusUpdateReq {
    companyId: string;
    expectedVersion: number;
    id: string;
    status: CommonStatus;
  }

  export interface SelectionPageReq extends PageParam {
    categoryId?: string;
    companyId: string;
    keyword?: string;
  }

  export interface SelectionExportProfile {
    effectiveFrom?: null | string;
    effectiveTo?: null | string;
    id: string;
    version: number;
  }

  export interface SelectionPackageProfile {
    description?: null | string;
    grossWeightKg?: DecimalValue | null;
    heightCm?: DecimalValue | null;
    lengthCm?: DecimalValue | null;
    netWeightKg?: DecimalValue | null;
    widthCm?: DecimalValue | null;
  }

  export interface SelectionItem {
    category?: null | string;
    categoryCode?: null | string;
    categoryId?: null | string;
    categoryName?: null | string;
    code: string;
    companyId: string;
    currency?: null | string;
    exportProfile?: null | SelectionExportProfile;
    exportProfileId?: null | string;
    grossWeightKg?: DecimalValue | null;
    heightCm?: DecimalValue | null;
    imageUrl?: null | string;
    lengthCm?: DecimalValue | null;
    name: string;
    netWeightKg?: DecimalValue | null;
    packageProfile?: null | SelectionPackageProfile;
    packagingDescription?: null | string;
    productCode: string;
    productId: string;
    productName: string;
    referenceCurrency?: null | string;
    referencePrice?: DecimalValue | null;
    skuCode: string;
    skuId: string;
    skuName: string;
    unit?: null | string;
    versionToken: string;
    widthCm?: DecimalValue | null;
  }

  export type SelectionDetail = SelectionItem;

  export interface SelectionIdentity {
    companyId: string;
    skuId: string;
    versionToken: string;
  }
}

const PRODUCT_BASE_URL = '/fdmproduct/product';
const CATEGORY_BASE_URL = '/fdmproduct/category';
const SELECTION_BASE_URL = '/fdmproduct/selection';

export function getFdmProductFormOptions() {
  return requestClient.get<FdmProductApi.FormOptions>(
    `${PRODUCT_BASE_URL}/form-options`,
  );
}

export function getFdmProductPage(params: FdmProductApi.PageReq) {
  return requestClient.get<PageResult<FdmProductApi.PageItem>>(
    `${PRODUCT_BASE_URL}/page`,
    { params },
  );
}

export function getFdmProduct(id: string, companyId: string) {
  return requestClient.get<FdmProductApi.ProductDetail>(
    `${PRODUCT_BASE_URL}/get`,
    { params: { companyId, id } },
  );
}

export function createFdmProduct(data: FdmProductApi.ProductSaveReq) {
  return requestClient.post<string>(`${PRODUCT_BASE_URL}/create`, data);
}

export function updateFdmProduct(data: FdmProductApi.ProductUpdateReq) {
  return requestClient.put<boolean>(`${PRODUCT_BASE_URL}/update`, data);
}

export function updateFdmProductStatus(
  data: FdmProductApi.ProductStatusUpdateReq,
) {
  return requestClient.put<boolean>(`${PRODUCT_BASE_URL}/update-status`, data);
}

export function getFdmProductCategoryList(
  params: FdmProductApi.CategoryListReq,
) {
  return requestClient.get<FdmProductApi.Category[]>(
    `${CATEGORY_BASE_URL}/list`,
    {
      params,
    },
  );
}

export function createFdmProductCategory(data: FdmProductApi.CategorySaveReq) {
  return requestClient.post<string>(`${CATEGORY_BASE_URL}/create`, data);
}

export function updateFdmProductCategory(
  data: FdmProductApi.CategoryUpdateReq,
) {
  return requestClient.put<boolean>(`${CATEGORY_BASE_URL}/update`, data);
}

export function deleteFdmProductCategory(params: {
  companyId: string;
  expectedVersion: number;
  id: string;
}) {
  return requestClient.delete<boolean>(`${CATEGORY_BASE_URL}/delete`, {
    params,
  });
}

export function getFdmProductSelectionPage(
  params: FdmProductApi.SelectionPageReq,
) {
  return requestClient.get<PageResult<FdmProductApi.SelectionItem>>(
    `${SELECTION_BASE_URL}/page`,
    { params },
  );
}

export function getFdmProductSelection(params: {
  companyId: string;
  skuId: string;
}) {
  return requestClient.get<FdmProductApi.SelectionDetail>(
    `${SELECTION_BASE_URL}/get`,
    { params },
  );
}

export function validateFdmProductSelection(
  data: FdmProductApi.SelectionIdentity,
) {
  return requestClient.post<FdmProductApi.SelectionDetail>(
    `${SELECTION_BASE_URL}/validate`,
    data,
  );
}
