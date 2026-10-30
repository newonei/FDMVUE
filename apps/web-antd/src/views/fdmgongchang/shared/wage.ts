import type { FdmgongchangWageApi as Api } from '#/api/fdmgongchang/wage';

export const CATEGORY_LABELS: Record<Api.Category, string> = {
  ALLOWANCE: '补助',
  MISC: '杂活',
  PROCESS: '工序计件',
  TIME: '计时',
};

export const CATEGORY_COLORS: Record<Api.Category, string> = {
  ALLOWANCE: 'gold',
  MISC: 'purple',
  PROCESS: 'blue',
  TIME: 'cyan',
};

export const RECORD_STATUS: Record<Api.RecordStatus, { color: string; label: string }> = {
  CONFIRMED: { color: 'green', label: '已确认' },
  PENDING: { color: 'orange', label: '待确认' },
  SETTLED: { color: 'default', label: '已结算' },
};

export const SHIFT_LABELS: Record<Api.Shift, string> = { DAY: '白班', NIGHT: '夜班' };

/** 计价项目上常用的单位、产品类型、岗位角色，表单里作为可选项，也可以手填。 */
export const UNIT_OPTIONS = ['片', '件', '张', '包', '小时', '班', '车', '袋', '方', '次', '待定'];
export const PRODUCT_TYPE_OPTIONS = ['双人垫', '圆形垫', '圆形跳绳垫', '跪垫', '裸垫', '平铺', '大包装', '12+8折'];
export const ROLE_OPTIONS = ['送片', '接片', '密炼', '挤出硫化'];

export function toNum(value: Api.Decimal | null | undefined) {
  if (value === null || value === undefined || value === '') return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

/** 金额、单价显示：去掉多余的 0，最多 4 位小数。 */
export function formatMoney(value: Api.Decimal | null | undefined, digits = 2) {
  const n = toNum(value);
  if (n === undefined) return '—';
  return n.toLocaleString('zh-CN', {
    maximumFractionDigits: digits,
    minimumFractionDigits: 0,
  });
}

export function formatDateValue(value: Api.DateValue | undefined) {
  if (!value) return '—';
  if (Array.isArray(value)) {
    const [y, m, d] = value;
    return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }
  return String(value).slice(0, 10);
}

/** 适用条件的简短说明，如「宽 800 · 厚 ≥15mm · 双人垫 · 送片」。 */
export function conditionText(item: Api.Item) {
  const parts: string[] = [];
  if (item.widthMm) parts.push(`宽 ${item.widthMm}`);
  if (item.lengthMinMm) parts.push(`长 ≥${item.lengthMinMm}`);
  const min = toNum(item.thicknessMinMm);
  const max = toNum(item.thicknessMaxMm);
  if (min !== undefined && max !== undefined && min === max) parts.push(`厚 ${min}mm`);
  else if (min !== undefined && max !== undefined) parts.push(`厚 ${min}–${max}mm`);
  else if (min !== undefined) parts.push(`厚 ≥${min}mm`);
  else if (max !== undefined) parts.push(`厚 ≤${max}mm`);
  if (item.productType) parts.push(item.productType);
  if (item.role) parts.push(item.role);
  return parts.join(' · ');
}
