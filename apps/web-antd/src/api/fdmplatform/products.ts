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
  /** 所属分类名称，随分类改名、合并自动更新 */
  category?: string;
  categoryId?: string;
  imageUrl?: string;
  /** 合同、仓库、采购使用的规格文本；填写型号时为「型号：X\n规格：Y」。 */
  specification?: string;
  /** 产品档案单独维护的型号与规格，由 specification 拆出。 */
  model?: string;
  spec?: string;
  unit?: string;
  material?: string;
  size?: string;
  color?: string;
  shape?: string;
  /** 产品克重，原样保存（如 800g、1.2kg） */
  weight?: string;
  /** 定制说明 */
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
  /** true 时按分类原文精确匹配，空字符串表示未分类 */
  exactCategory?: boolean;
  /** 按维护的分类筛选，空字符串为未分类 */
  categoryId?: string;
}
/** 产品分类（一层） */
export interface ProductCategory {
  id: string;
  name: string;
  sort: number;
  active: boolean;
  version: number;
}
export interface ProductCategoryCount {
  /** 空字符串为未分类 */
  categoryId: string;
  count: number;
}
export interface ProductCategoryView {
  /** 全部匹配产品数 */
  total: number;
  items: ProductCategoryCount[];
  truncated?: boolean;
  /** 维护好的分类 */
  categories: ProductCategory[];
}
export interface ProductAttachment {
  id: string;
  productId: string;
  name: string;
  type: string;
  size: number;
  sha256: string;
  createdAt: number | string;
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

export interface ProductImportRow {
  rowNumber: number;
  code: string;
  name: string;
  status: 'ERROR' | 'IMPORTED' | 'READY' | 'SKIPPED';
  message: string;
  productId?: string;
  values: Partial<
    Pick<
      Product,
      | 'active'
      | 'category'
      | 'color'
      | 'displayName'
      | 'imageUrl'
      | 'material'
      | 'model'
      | 'packaging'
      | 'printing'
      | 'remark'
      | 'shape'
      | 'size'
      | 'specification'
      | 'unit'
    >
  >;
}
export interface ProductImportResult {
  fileName: string;
  previewHash: string;
  totalCount: number;
  readyCount: number;
  createdCount: number;
  skippedCount: number;
  errorCount: number;
  warnings: string[];
  rows: ProductImportRow[];
}
export function downloadProductImportTemplate(companyId = 0) {
  return requestClient.download<Blob>(`${base}/import-template`, {
    params: { companyId },
  });
}
export function previewProductImport(file: File, companyId = 0) {
  return requestClient.upload<ProductImportResult>(
    `${base}/import-preview`,
    { file, companyId },
    { timeout: 300_000 },
  );
}
export function importProducts(data: {
  companyId: number;
  file: File;
  idempotencyKey: string;
  previewHash: string;
}) {
  return requestClient.upload<ProductImportResult>(`${base}/import`, data, {
    timeout: 300_000,
  });
}
export function getProducts(params: ProductQuery) {
  return requestClient.get<PageResult<Product>>(base, { params });
}
/** 产品档案左侧分类：分类和各分类产品数，口径与同条件下的产品列表一致（不含分类本身）。 */
export function getProductCategories(params: {
  active?: boolean;
  companyId: number;
  keyword?: string;
  selectable?: boolean;
}) {
  return requestClient.get<ProductCategoryView>(`${base}/categories`, {
    params,
  });
}
const categoryBase = '/fdmplatform/v1/product-categories';
export function getProductCategoryList(companyId = 0) {
  return requestClient.get<ProductCategory[]>(categoryBase, {
    params: { companyId },
  });
}
export function saveProductCategory(data: {
  active: boolean;
  companyId: number;
  expectedVersion?: number;
  id?: string;
  idempotencyKey: string;
  name: string;
  sort?: number;
}) {
  return requestClient.post<ProductCategory>(categoryBase, data);
}
/** 把分类的全部产品并入另一个分类，原分类删除；返回移动的产品数 */
export function mergeProductCategory(
  id: string,
  data: { companyId: number; idempotencyKey: string; targetId: string },
) {
  return requestClient.post<{ movedCount: number; targetId: string }>(
    `${categoryBase}/${encodeURIComponent(id)}/merge`,
    data,
  );
}
export function deleteProductCategory(
  id: string,
  data: { companyId: number; idempotencyKey: string },
) {
  return requestClient.post<boolean>(
    `${categoryBase}/${encodeURIComponent(id)}/delete`,
    data,
  );
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
