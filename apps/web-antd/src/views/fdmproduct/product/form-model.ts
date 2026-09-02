import type { FdmProductApi } from '#/api/fdmproduct/product';

import BigNumber from 'bignumber.js';

export interface ProductSkuForm {
  expectedExportVersion?: number;
  expectedVersion?: number;
  exportCategoryId?: string;
  exportDisplayCode: string;
  exportDisplayName: string;
  exportEffectiveFrom?: string;
  exportEffectiveTo?: string;
  exportImageUrl: string;
  exportProfileId?: string;
  exportReferenceCurrency: string;
  exportReferencePrice: string;
  exportSalesUnit: string;
  exportStatus: FdmProductApi.CommonStatus;
  grossWeightKg: string;
  heightCm: string;
  id?: string;
  imageUrl: string;
  lengthCm: string;
  netWeightKg: string;
  packagingDescription: string;
  referenceCurrency: string;
  referencePrice: string;
  remark: string;
  rowKey: string;
  skuCode: string;
  skuName: string;
  status: FdmProductApi.CommonStatus;
  unit: string;
  widthCm: string;
}

export interface ProductFormState {
  baseUnit: string;
  categoryId?: string;
  companyId?: string;
  id?: string;
  imageUrl: string;
  productCode: string;
  productName: string;
  remark: string;
  skus: ProductSkuForm[];
  status: FdmProductApi.CommonStatus;
  version?: number;
}

export interface ProductFormIssue {
  message: string;
  path: string;
}

let rowSequence = 0;

function nextRowKey() {
  rowSequence += 1;
  return `sku-${Date.now()}-${rowSequence}`;
}

function text(value: null | string | undefined) {
  return value?.trim() ?? '';
}

function optional(value: string) {
  const normalized = value.trim();
  return normalized || undefined;
}

function normalizeDecimal(value: string) {
  const normalized = value.trim();
  if (!normalized) return undefined;
  const decimal = new BigNumber(normalized);
  return decimal.isFinite() ? decimal.toFixed(0) : normalized;
}

export function createEmptyProductSku(baseUnit = 'PCS'): ProductSkuForm {
  return {
    exportDisplayCode: '',
    exportDisplayName: '',
    exportImageUrl: '',
    exportReferenceCurrency: 'USD',
    exportReferencePrice: '',
    exportSalesUnit: baseUnit,
    exportStatus: 0,
    grossWeightKg: '',
    heightCm: '',
    imageUrl: '',
    lengthCm: '',
    netWeightKg: '',
    packagingDescription: '',
    referenceCurrency: 'USD',
    referencePrice: '',
    remark: '',
    rowKey: nextRowKey(),
    skuCode: '',
    skuName: '',
    status: 0,
    unit: baseUnit,
    widthCm: '',
  };
}

export function createEmptyProductForm(companyId?: string): ProductFormState {
  return {
    baseUnit: 'PCS',
    companyId,
    imageUrl: '',
    productCode: '',
    productName: '',
    remark: '',
    skus: [createEmptyProductSku()],
    status: 0,
  };
}

export function hydrateProductForm(
  detail: FdmProductApi.ProductDetail,
): ProductFormState {
  return {
    baseUnit: detail.baseUnit,
    categoryId: detail.categoryId,
    companyId: detail.companyId,
    id: detail.id,
    imageUrl: text(detail.imageUrl),
    productCode: detail.productCode,
    productName: detail.productName,
    remark: text(detail.remark),
    skus: (detail.skus ?? []).map((sku) => ({
      expectedExportVersion: sku.exportVersion ?? undefined,
      expectedVersion: sku.version,
      exportCategoryId: sku.exportCategoryId ?? undefined,
      exportDisplayCode: text(sku.exportDisplayCode),
      exportDisplayName: text(sku.exportDisplayName),
      exportEffectiveFrom: sku.exportEffectiveFrom ?? undefined,
      exportEffectiveTo: sku.exportEffectiveTo ?? undefined,
      exportImageUrl: text(sku.exportImageUrl),
      exportProfileId: sku.exportProfileId ?? undefined,
      exportReferenceCurrency: text(sku.exportReferenceCurrency) || 'USD',
      exportReferencePrice: text(sku.exportReferencePrice),
      exportSalesUnit: text(sku.exportSalesUnit) || detail.baseUnit,
      exportStatus: sku.exportStatus ?? 0,
      grossWeightKg: text(sku.grossWeightKg),
      heightCm: text(sku.heightCm),
      id: sku.id,
      imageUrl: text(sku.imageUrl),
      lengthCm: text(sku.lengthCm),
      netWeightKg: text(sku.netWeightKg),
      packagingDescription: text(sku.packagingDescription),
      referenceCurrency: text(sku.referenceCurrency) || 'USD',
      referencePrice: text(sku.referencePrice),
      remark: text(sku.remark),
      rowKey: nextRowKey(),
      skuCode: sku.skuCode,
      skuName: sku.skuName,
      status: sku.status,
      unit: text(sku.unit) || detail.baseUnit,
      widthCm: text(sku.widthCm),
    })),
    status: detail.status,
    version: detail.version,
  };
}

function buildSkuPayload(sku: ProductSkuForm): FdmProductApi.SkuSaveReq {
  const referencePrice = normalizeDecimal(sku.referencePrice);
  const exportReferencePrice = normalizeDecimal(sku.exportReferencePrice);
  return {
    expectedExportVersion: sku.expectedExportVersion,
    expectedVersion: sku.expectedVersion,
    exportCategoryId: sku.exportCategoryId,
    exportDisplayCode: optional(sku.exportDisplayCode),
    exportDisplayName: optional(sku.exportDisplayName),
    exportEffectiveFrom: sku.exportEffectiveFrom,
    exportEffectiveTo: sku.exportEffectiveTo,
    exportImageUrl: optional(sku.exportImageUrl),
    exportProfileId: sku.exportProfileId,
    // The backend deliberately rejects a currency without a price. Keep the
    // UI's USD default as a convenience, but omit it until a price is entered.
    exportReferenceCurrency: exportReferencePrice
      ? optional(sku.exportReferenceCurrency)
      : undefined,
    exportReferencePrice,
    exportSalesUnit: optional(sku.exportSalesUnit),
    exportStatus: sku.exportStatus,
    grossWeightKg: normalizeDecimal(sku.grossWeightKg),
    heightCm: normalizeDecimal(sku.heightCm),
    id: sku.id,
    imageUrl: optional(sku.imageUrl),
    lengthCm: normalizeDecimal(sku.lengthCm),
    netWeightKg: normalizeDecimal(sku.netWeightKg),
    packagingDescription: optional(sku.packagingDescription),
    referenceCurrency: referencePrice
      ? optional(sku.referenceCurrency)
      : undefined,
    referencePrice,
    remark: optional(sku.remark),
    skuCode: sku.skuCode.trim(),
    skuName: sku.skuName.trim(),
    status: sku.status,
    unit: optional(sku.unit),
    widthCm: normalizeDecimal(sku.widthCm),
  };
}

export function buildProductSavePayload(
  form: ProductFormState,
): FdmProductApi.ProductSaveReq {
  if (!form.companyId || !form.categoryId) {
    throw new Error('公司和产品分类不能为空。');
  }
  return {
    baseUnit: form.baseUnit.trim(),
    categoryId: form.categoryId,
    companyId: form.companyId,
    imageUrl: optional(form.imageUrl),
    productCode: form.productCode.trim(),
    productName: form.productName.trim(),
    remark: optional(form.remark),
    skus: form.skus.map(buildSkuPayload),
    status: form.status,
  };
}

export function buildProductUpdatePayload(
  form: ProductFormState,
): FdmProductApi.ProductUpdateReq {
  if (!form.id || form.version === undefined) {
    throw new Error('缺少产品 ID 或并发版本，无法更新。');
  }
  return {
    ...buildProductSavePayload(form),
    expectedVersion: form.version,
    id: form.id,
  };
}

function decimalValid(value: string, maxIntegerDigits: number) {
  if (!value.trim()) return true;
  const normalized = value.trim();
  if (!/^\d+(?:\.\d+)?$/.test(normalized)) return false;
  const [integer = '', fraction = ''] = normalized.split('.');
  const significantInteger = integer.replace(/^0+(?=\d)/, '');
  const decimal = new BigNumber(normalized);
  return (
    decimal.isFinite() &&
    !decimal.isNegative() &&
    significantInteger.length <= maxIntegerDigits &&
    fraction.length <= 6
  );
}

const CODE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

export function validateProductForm(
  form: ProductFormState,
): ProductFormIssue[] {
  const issues: ProductFormIssue[] = [];
  if (!form.companyId)
    issues.push({ message: '请选择所属公司', path: 'companyId' });
  if (!form.categoryId)
    issues.push({ message: '请选择产品分类', path: 'categoryId' });
  if (!form.productCode.trim()) {
    issues.push({ message: '请填写产品编码', path: 'productCode' });
  } else if (!CODE_PATTERN.test(form.productCode.trim())) {
    issues.push({
      message: '产品编码只能包含字母、数字、点、下划线和短横线',
      path: 'productCode',
    });
  }
  if (!form.productName.trim())
    issues.push({ message: '请填写产品名称', path: 'productName' });
  if (!form.baseUnit.trim())
    issues.push({ message: '请填写基础单位', path: 'baseUnit' });
  if (form.skus.length === 0)
    issues.push({ message: '至少保留一个 SKU', path: 'skus' });
  if (form.skus.length > 200)
    issues.push({ message: '单个产品不能超过 200 个 SKU', path: 'skus' });

  const codes = new Set<string>();
  form.skus.forEach((sku, index) => {
    const label = `第 ${index + 1} 个 SKU`;
    const code = sku.skuCode.trim();
    if (!code) {
      issues.push({
        message: `${label}缺少 SKU 编码`,
        path: `skus.${index}.skuCode`,
      });
    } else if (!CODE_PATTERN.test(code)) {
      issues.push({
        message: `${label}的 SKU 编码格式无效`,
        path: `skus.${index}.skuCode`,
      });
    } else if (codes.has(code.toLocaleLowerCase())) {
      issues.push({
        message: `${label}的 SKU 编码重复`,
        path: `skus.${index}.skuCode`,
      });
    }
    codes.add(code.toLocaleLowerCase());
    if (!sku.skuName.trim()) {
      issues.push({
        message: `${label}缺少 SKU 名称`,
        path: `skus.${index}.skuName`,
      });
    }
    const decimals = [
      ['参考价', sku.referencePrice, 18],
      ['毛重', sku.grossWeightKg, 12],
      ['净重', sku.netWeightKg, 12],
      ['长度', sku.lengthCm, 12],
      ['宽度', sku.widthCm, 12],
      ['高度', sku.heightCm, 12],
      ['出口参考价', sku.exportReferencePrice, 18],
    ] as const;
    for (const [name, value, maxIntegerDigits] of decimals) {
      if (!decimalValid(value, maxIntegerDigits)) {
        issues.push({
          message: `${label}${name}格式不正确`,
          path: `skus.${index}.${name}`,
        });
      }
    }
    if (
      sku.referencePrice.trim() &&
      !/^[A-Za-z]{3}$/.test(sku.referenceCurrency.trim())
    ) {
      issues.push({
        message: `${label}参考价币种必须为三位字母`,
        path: `skus.${index}.referenceCurrency`,
      });
    }
    if (
      sku.exportReferencePrice.trim() &&
      !/^[A-Za-z]{3}$/.test(sku.exportReferenceCurrency.trim())
    ) {
      issues.push({
        message: `${label}出口参考价币种必须为三位字母`,
        path: `skus.${index}.exportReferenceCurrency`,
      });
    }
    if (
      decimalValid(sku.grossWeightKg, 12) &&
      decimalValid(sku.netWeightKg, 12) &&
      sku.grossWeightKg.trim() &&
      sku.netWeightKg.trim() &&
      new BigNumber(sku.netWeightKg).isGreaterThan(sku.grossWeightKg)
    ) {
      issues.push({
        message: `${label}净重不能大于毛重`,
        path: `skus.${index}.netWeightKg`,
      });
    }
    if (
      sku.exportEffectiveFrom &&
      sku.exportEffectiveTo &&
      sku.exportEffectiveFrom > sku.exportEffectiveTo
    ) {
      issues.push({
        message: `${label}出口生效开始日不能晚于结束日`,
        path: `skus.${index}.exportEffectiveFrom`,
      });
    }
  });
  return issues;
}
