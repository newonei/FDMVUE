import type { Access, Contract, ContractItem } from '#/api/fdmplatform';
import type { Product, TaxBasis } from '#/api/fdmplatform/products';

import BigNumber from 'bignumber.js';

export const taxOptions = [
  { label: '含税价', value: 'TAX_INCLUDED' },
  { label: '未税价', value: 'TAX_EXCLUDED' },
];
export function hasProductVersion(line: Pick<ContractItem, 'productVersion'>) {
  return line.productVersion !== null && line.productVersion !== undefined;
}
export const currencyOptions = [
  'CNY',
  'USD',
  'EUR',
  'GBP',
  'JPY',
  'HKD',
  'AUD',
  'CAD',
].map((value) => ({ value, label: value }));
export const productFieldLabels: Record<string, string> = {
  name: '名称',
  code: 'SKU 编号',
  unit: '单位',
  specification: '规格',
  material: '材质',
  size: '尺寸',
  color: '颜色',
  shape: '形状',
  active: '启用状态',
};
export function productDescription(product: Product) {
  return [
    product.specification,
    product.material,
    product.size,
    product.color,
    product.shape,
  ]
    .filter(Boolean)
    .join(' · ');
}
export function missingProductFields(fields: string[]) {
  return fields.map((field) => productFieldLabels[field] ?? field).join('、');
}
/** Keep off-page selection while applying the current page's checkbox state. */
export function mergeProductSelection<T extends { id: string }>(
  current: T[],
  page: T[],
  selectedIds: string[],
) {
  const selected = new Set(selectedIds);
  const result = new Map(
    current
      .filter((item) => selected.has(item.id))
      .map((item) => [item.id, item]),
  );
  for (const item of page) if (selected.has(item.id)) result.set(item.id, item);
  return [...result.values()];
}
export function contractLineAmount(
  line: Pick<ContractItem, 'quantity' | 'unitPrice'>,
) {
  if (
    line.unitPrice === null ||
    line.unitPrice === undefined ||
    line.unitPrice === ''
  )
    return undefined;
  const amount = new BigNumber(line.quantity).times(line.unitPrice);
  return amount.isFinite()
    ? amount.toFixed(2, BigNumber.ROUND_HALF_UP)
    : undefined;
}
/** Match the server: round each line to cents before summing. */
export function contractItemsTotal(lines: ContractItem[]) {
  let total = new BigNumber(0);
  for (const line of lines) {
    total = total.plus(contractLineAmount(line) ?? 0);
  }
  return total.toFixed(2);
}
export function copyContractLine(line: ContractItem, id: string): ContractItem {
  return {
    ...line,
    id,
    attachmentIds: [...(line.attachmentIds ?? [])],
    attachmentPurposes: { ...line.attachmentPurposes },
  };
}
/** Currency/tax changes require deliberate repricing. Never retain an old amount as a converted price. */
export function invalidateLinePrices(
  lines: ContractItem[],
  taxBasis: TaxBasis,
): ContractItem[] {
  return lines.map((line) => ({
    ...line,
    taxBasis,
    unitPrice: null,
    priceSourceId: undefined,
    priceSourceVersion: undefined,
  }));
}
export function applyReferencePrices(
  lines: ContractItem[],
  resolved: ContractItem[],
): ContractItem[] {
  const prices = new Map(resolved.map((line) => [line.skuId, line]));
  return lines.map((line) => {
    const source = prices.get(line.skuId);
    return source
      ? {
          ...line,
          unitPrice: source.unitPrice,
          priceSourceId: source.priceSourceId,
          priceSourceVersion: source.priceSourceVersion,
        }
      : line;
  });
}

/** Company is an order attribute. Shared catalog scope zero is never an order company. */
export function contractCompanyOptions(
  companies: Access['companies'],
  current?: Pick<Contract, 'companyId' | 'companyName'>,
) {
  const options = companies
    .filter((company) => company.companyId > 0)
    .map((company) => ({
      value: company.companyId,
      label: company.companyName || `公司 #${company.companyId}`,
    }));
  if (
    current &&
    current.companyId > 0 &&
    !options.some((option) => option.value === current.companyId)
  ) {
    options.push({
      value: current.companyId,
      label: current.companyName || `公司 #${current.companyId}`,
    });
  }
  return options;
}

/** The server owns numbering; a form cannot introduce or replace a contract identity. */
export function contractHeaderPayload<T extends Record<string, unknown>>(
  form: T,
  current?: Pick<Contract, 'code'>,
) {
  const { code: _code, taxBasis: _taxBasis, ...header } = form;
  return { ...header, ...(current ? { code: current.code } : {}) };
}
