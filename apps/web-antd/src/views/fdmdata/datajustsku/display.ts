import type { FdmdataDataJustAccessoryApi } from '#/api/fdmdata/datajustaccessory';
import type {
  FdmdataCustomComboApi,
  FdmdataDataJustSkuApi,
} from '#/api/fdmdata/datajustsku';

export type SkuListTab =
  | 'pattern'
  | 'finished'
  | 'combo'
  | 'accessory'
  | 'custom_combo'
  | 'blank';

export type SkuDisplayRow = Partial<
  FdmdataDataJustSkuApi.DataJustSku &
    FdmdataDataJustAccessoryApi.Accessory &
    FdmdataCustomComboApi.CustomComboRow
> & { id: number };

export function displaySkuValue(value: unknown): string {
  if (value === undefined || value === null) return '—';
  return String(value).trim() || '—';
}

export function formatSkuMoney(value: unknown): string {
  if (
    (typeof value !== 'number' && typeof value !== 'string') ||
    (typeof value === 'string' && !value.trim())
  )
    return '—';
  const amount = Number(value);
  return Number.isFinite(amount)
    ? amount.toLocaleString('zh-CN', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
    : '—';
}

export function getAccessoryKindLabel(value: unknown): string {
  const labels: Record<string, string> = {
    CARTON: '纸箱',
    COLOR_BOX: '彩盒',
    NET_BAG: '网包',
    ROPE: '捆绳',
    VELCRO: '魔术扣',
    MAGIC_TAPE: '魔术扣',
    SUPPORT_PAD: '平板支撑垫',
    BAG: '袋类',
  };
  return labels[String(value).trim().toUpperCase()] ?? displaySkuValue(value);
}

export function getAccessoryMatchLabel(value: unknown): string {
  const labels: Record<string, string> = {
    UNIVERSAL: '通用',
    SPEC_EXACT: '按规格匹配',
    WIDTH_EXACT: '按宽度匹配',
    WIDTH_MAX: '宽度上限',
    SPEC_SET: '多个规格',
  };
  return labels[String(value).trim().toUpperCase()] ?? displaySkuValue(value);
}

export const SKU_PLATFORM_PRICES = [
  { key: 'tmallPrice', label: '天猫' },
  { key: 'pddPrice', label: '拼多多' },
  { key: 'douyinPrice', label: '抖音' },
  { key: 'sphPrice', label: '视频号' },
  { key: 'xhsPrice', label: '小红书' },
  { key: 'jdPrice', label: '京东' },
] as const;
