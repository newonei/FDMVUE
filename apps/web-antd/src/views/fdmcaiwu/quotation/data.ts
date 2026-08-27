import type { FdmcaiwuQuotationApi } from '#/api/fdmcaiwu/quotation';

export const DEFAULT_QUOTATION_TAX_RATE = 0.08;

export const RESULT_COST_FIELDS: Array<{
  field: keyof FdmcaiwuQuotationApi.CalculateResp;
  name: string;
}> = [
  { field: 'materialCost', name: '材料成本' },
  { field: 'preprocessCost', name: '前加工成本' },
  { field: 'postprocessCost', name: '后加工成本' },
  {
    field: 'packingOperationCostPerPiece',
    name: '包装及批量发货操作费',
  },
  { field: 'auxiliaryCost', name: '辅料成本' },
];

export function hasValue(value: unknown): boolean {
  return value !== undefined && value !== null && value !== '';
}

function normalizeTaxRate(value: unknown): number {
  const rate = Number(value);
  if (!Number.isFinite(rate) || rate < 0) return DEFAULT_QUOTATION_TAX_RATE;
  return rate > 1 ? rate / 100 : rate;
}

/**
 * 优先使用服务端 Decimal 含税字段。仅用于兼容尚未返回新字段的旧后端，
 * 派生结果最终仍由金额格式化函数按两位小数展示。
 */
export function resolveTaxIncludedValue(
  excludingTax: unknown,
  includingTax?: unknown,
  taxRate: unknown = DEFAULT_QUOTATION_TAX_RATE,
): FdmcaiwuQuotationApi.DecimalValue | undefined {
  if (hasValue(includingTax)) {
    return typeof includingTax === 'number' || typeof includingTax === 'string'
      ? includingTax
      : String(includingTax);
  }
  if (!hasValue(excludingTax)) return undefined;
  const base = Number(excludingTax);
  if (!Number.isFinite(base)) return undefined;
  return (base * (1 + normalizeTaxRate(taxRate)))
    .toFixed(12)
    .replace(/\.?0+$/, '');
}

export function formatQuotationTaxRate(value: unknown): string {
  const rate = normalizeTaxRate(value);
  return `${(rate * 100).toFixed(2).replace(/\.?0+$/, '')}%`;
}

export function formatSpecification(
  length: unknown,
  width: unknown,
  thickness: unknown,
): string {
  if (![length, width, thickness].every((item) => hasValue(item))) return '—';
  return `${[length, width, thickness]
    .map((item) => formatCompactDecimal(item, '', 2))
    .join(' × ')} mm`;
}

export function formatProductType(value?: string): string {
  if (!value) return '—';
  const labels: Record<string, string> = {
    ELASTIC: '高弹',
    LIGHT: '轻羽',
    REGULAR: '常规',
    SUPER_ELASTIC: '超弹',
  };
  return labels[value] || value;
}

export function formatDensityType(value?: string): string {
  if (!value) return '—';
  if (value === 'CUSTOM') return '定制';
  return `密度 ${value}`;
}

export function formatLayoutOrientation(value?: string): string {
  if (!value) return '—';
  const labels: Record<string, string> = {
    NORMAL: '常规排版',
    ORIGINAL: '常规排版',
    ROTATED: '旋转排版',
    ROTATE_90: '旋转 90°',
    STANDARD: '常规排版',
  };
  return labels[value] || value;
}

export function formatMoney(value: unknown): string {
  if (!hasValue(value)) return '—';
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) return `¥${String(value)}`;
  return `¥${numberValue.toLocaleString('zh-CN', {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  })}`;
}

export function formatExactMoney(value: unknown): string {
  if (!hasValue(value)) return '—';
  return `¥${String(value)}`;
}

export function formatDecimal(value: unknown, unit = ''): string {
  if (!hasValue(value)) return '—';
  return `${String(value)}${unit ? ` ${unit}` : ''}`;
}

export function formatCompactDecimal(
  value: unknown,
  unit = '',
  maximumFractionDigits = 4,
): string {
  if (!hasValue(value)) return '—';
  const numberValue = Number(value);
  const formattedValue = Number.isFinite(numberValue)
    ? numberValue.toLocaleString('zh-CN', {
        maximumFractionDigits,
        useGrouping: false,
      })
    : String(value);
  return `${formattedValue}${unit ? ` ${unit}` : ''}`;
}

export function formatMaterialUnitCost(value: unknown): string {
  if (!hasValue(value)) return '—';
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) return `${String(value)} 元/kg`;
  return `${numberValue.toLocaleString('zh-CN', {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
    useGrouping: false,
  })} 元/kg`;
}

export function formatRate(value: unknown): string {
  if (!hasValue(value)) return '—';
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) return String(value);
  return `${(numberValue * 100).toFixed(2).replace(/\.?0+$/, '')}%`;
}
