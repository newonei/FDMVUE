import type { FdmgongchangProductionOrderApi as Api } from '#/api/fdmgongchang/production-order';

import dayjs from 'dayjs';

export const ORDER_STATUS: Record<Api.Status, { color: string; label: string }> = {
  ACCEPTED: { color: 'processing', label: '生产中' },
  CANCELLED: { color: 'default', label: '已撤回' },
  COMPLETED: { color: 'green', label: '已完成' },
  REJECTED: { color: 'red', label: '已退回' },
  SUBMITTED: { color: 'orange', label: '待接单' },
};

export function dateText(value: null | number[] | string | undefined) {
  if (!value) return '';
  if (Array.isArray(value)) {
    const [y, m, d] = value;
    return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }
  return String(value).slice(0, 10);
}

export function timeText(value: null | number | string | undefined) {
  return value ? dayjs(value).format('MM-DD HH:mm') : '';
}

export function num(value: null | number | string | undefined) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

/** 规格一行：尺寸 · 材质 · 颜色，没有时用规格原文。 */
export function specText(p: {
  color?: null | string;
  material?: null | string;
  size?: null | string;
  specification?: null | string;
}) {
  const parts = [p.size, p.material, p.color].filter(Boolean);
  return parts.length > 0 ? parts.join(' · ') : (p.specification ?? '').replaceAll('\n', ' ');
}
