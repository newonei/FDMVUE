import type { FdmProductApi } from '#/api/fdmproduct/product';

export function productStatusMeta(status: FdmProductApi.CommonStatus) {
  return status === 0
    ? { color: 'success', label: '已启用' }
    : { color: 'default', label: '已停用' };
}

export function formatProductDateTime(value?: null | number | string) {
  if (value === null || value === undefined || value === '') return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat('zh-CN', {
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date);
}

export function formatReferencePrice(
  currency?: null | string,
  amount?: null | string,
) {
  if (!amount) return '未设置';
  return `${currency || '—'} ${amount}`;
}
