import type { ContractItem, Decimal, PageResult } from './index';

import { requestClient } from '#/api/request';

export type TaxBasis = 'TAX_EXCLUDED' | 'TAX_INCLUDED';
export interface ProductPrice {
  id: string;
  version: number;
  companyId: number;
  productId: string;
  productName?: string;
  currency: string;
  unit: string;
  taxBasis: TaxBasis;
  unitPrice: Decimal;
  validFrom: string;
  validUntil?: string;
  active: boolean;
}
export interface Product {
  id: string;
  version: number;
  companyId: number;
  name: string;
  code: string;
  displayName?: string;
  category?: string;
  imageUrl?: string;
  specification?: string;
  unit?: string;
  material?: string;
  size?: string;
  color?: string;
  shape?: string;
  printing?: string;
  packaging?: string;
  remark?: string;
  active: boolean;
  missingFields: string[];
  selectable: boolean;
  referencePrice?: ProductPrice;
  canManage: boolean;
  canManagePrice: boolean;
}
export interface ProductQuery {
  companyId: number;
  pageNo: number;
  pageSize: number;
  keyword?: string;
  category?: string;
  material?: string;
  size?: string;
  color?: string;
  shape?: string;
  active?: boolean;
  selectable?: boolean;
  currency?: string;
  taxBasis?: TaxBasis;
}
export interface ProductAttachment {
  id: string;
  productId: string;
  name: string;
  type: string;
  size: number;
  sha256: string;
  createdAt: string;
  uploadedBy: number;
  active: boolean;
  seriesId: string;
  revision: number;
}
export interface ProductAttachmentView {
  enabled: boolean;
  canUpload: boolean;
  items: ProductAttachment[];
}
const base = '/fdmplatform/v1/products';
export function getProducts(params: ProductQuery) {
  return requestClient.get<PageResult<Product>>(base, { params });
}
export function getProduct(id: string, companyId = 0) {
  return requestClient.get<Product>(`${base}/${encodeURIComponent(id)}`, {
    params: { companyId },
  });
}
export function saveProduct(data: Record<string, unknown>) {
  return requestClient.post<Product>(base, data);
}
export function getProductPrices(params: {
  companyId: number;
  currency?: string;
  pageNo: number;
  pageSize: number;
  productId?: string;
}) {
  return requestClient.get<PageResult<ProductPrice>>(`${base}/prices`, {
    params,
  });
}
export function saveProductPrice(data: Record<string, unknown>) {
  return requestClient.post<ProductPrice>(`${base}/prices`, data);
}
export function resolveProducts(data: {
  companyId: number;
  currency: string;
  items: { productId: string; productVersion: number }[];
  taxBasis: TaxBasis;
}) {
  return requestClient.post<ContractItem[]>(`${base}/resolve`, data);
}
export function getProductAttachments(companyId: number, productId: string) {
  return requestClient.get<ProductAttachmentView>(
    `${base}/${encodeURIComponent(productId)}/attachments`,
    { params: { companyId } },
  );
}
export function uploadProductAttachment(
  companyId: number,
  productId: string,
  file: File,
  idempotencyKey: string,
  replacesId?: string,
) {
  return requestClient.upload<ProductAttachment>(
    `${base}/${encodeURIComponent(productId)}/attachments`,
    { companyId, file, idempotencyKey, replacesId },
    { timeout: 300_000 },
  );
}
export function downloadProductAttachment(
  companyId: number,
  productId: string,
  attachmentId: string,
) {
  return requestClient.download<Blob>(
    `${base}/${encodeURIComponent(productId)}/attachments/${encodeURIComponent(attachmentId)}/download`,
    { params: { companyId } },
  );
}
export function downloadContractProductAttachment(
  contractId: string,
  attachmentId: string,
) {
  return requestClient.download<Blob>(
    `/fdmplatform/v1/contracts/${encodeURIComponent(contractId)}/product-attachments/${encodeURIComponent(attachmentId)}/download`,
  );
}

export function deleteProduct(
  productId: string,
  data: {
    companyId: number;
    expectedVersion: number;
    idempotencyKey: string;
  },
) {
  return requestClient.post<boolean>(
    `${base}/${encodeURIComponent(productId)}/delete`,
    data,
  );
}
