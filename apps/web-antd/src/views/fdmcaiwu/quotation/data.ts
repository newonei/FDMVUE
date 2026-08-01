import type { FdmcaiwuQuotationApi } from '#/api/fdmcaiwu/quotation';

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

export function formatSpecification(
  length: unknown,
  width: unknown,
  thickness: unknown,
): string {
  if (![length, width, thickness].every((item) => hasValue(item))) return '—';
  return `${length} × ${width} × ${thickness} mm`;
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

export function formatProfitMode(value?: string): string {
  if (value === 'GROSS_MARGIN') return '毛利率';
  if (value === 'MARKUP') return '加价率';
  return value || '—';
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
