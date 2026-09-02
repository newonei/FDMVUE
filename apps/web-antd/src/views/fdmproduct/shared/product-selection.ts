import type { PageResult } from '@vben/request';

import type { FdmProductApi } from '#/api/fdmproduct/product';

import {
  getFdmProductSelection,
  getFdmProductSelectionPage,
  validateFdmProductSelection,
} from '#/api/fdmproduct/product';

export type ProductSelectionExportProfile =
  FdmProductApi.SelectionExportProfile;

export interface ProductSelectionPageQuery {
  categoryId?: string;
  companyId: string;
  keyword?: string;
  pageNo: number;
  pageSize: number;
}

export interface ProductSelectionGetQuery {
  companyId: string;
  skuId: string;
}

export interface ProductSelectionIdentity extends ProductSelectionGetQuery {
  versionToken: string;
}

export type ProductSelectionItem = FdmProductApi.SelectionItem;
export type ProductSelectionDetail = FdmProductApi.SelectionDetail;

export interface ProductSelectionValue {
  category?: string;
  code: string;
  companyId: string;
  currency?: string;
  exportProfile?: ProductSelectionExportProfile;
  imageUrl?: string;
  name: string;
  productCode: string;
  productId: string;
  productName: string;
  referencePrice?: string;
  skuCode: string;
  skuId: string;
  skuName: string;
  unit?: string;
  versionToken: string;
}

export interface ProductSelectionDataSource {
  get(query: ProductSelectionGetQuery): Promise<ProductSelectionDetail>;
  page(
    query: ProductSelectionPageQuery,
  ): Promise<PageResult<ProductSelectionItem>>;
  validate(
    selection: ProductSelectionIdentity,
  ): Promise<ProductSelectionDetail>;
}

export const fdmProductSelectionDataSource: ProductSelectionDataSource = {
  get: getFdmProductSelection,
  page: getFdmProductSelectionPage,
  validate: validateFdmProductSelection,
};

function optionalText(value: null | string | undefined) {
  const normalized = value?.trim();
  return normalized || undefined;
}

export function toProductSelectionValue(
  detail: ProductSelectionDetail,
): ProductSelectionValue {
  return {
    category: optionalText(detail.category),
    code: detail.code,
    companyId: detail.companyId,
    currency: optionalText(detail.referenceCurrency ?? detail.currency),
    exportProfile: detail.exportProfile ?? undefined,
    imageUrl: optionalText(detail.imageUrl),
    name: detail.name,
    productCode: detail.productCode,
    productId: detail.productId,
    productName: detail.productName,
    referencePrice: optionalText(detail.referencePrice),
    skuCode: detail.skuCode,
    skuId: detail.skuId,
    skuName: detail.skuName,
    unit: optionalText(detail.unit),
    versionToken: detail.versionToken,
  };
}
