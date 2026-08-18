import { formatDateTime } from '@vben/utils';

type DateTimeValue = null | number | string | undefined;

/**
 * Performance APIs serialize Java LocalDateTime values as epoch milliseconds in
 * the current backend configuration, while older records may still be ISO text.
 */
export function formatPerformanceDateTime(value: DateTimeValue): string {
  if (value === null || value === undefined || value === '') {
    return '-';
  }

  const normalized = typeof value === 'string' ? value.trim() : value;
  if (normalized === '') {
    return '-';
  }

  const dateValue =
    typeof normalized === 'string' && /^\d+$/.test(normalized)
      ? Number(normalized)
      : normalized;

  return formatDateTime(dateValue) || '-';
}

/**
 * Dashboard APIs return a decimal ratio in [0, 1], while the UI displays a
 * human-readable percentage. Keeping the conversion here prevents multiplying
 * a percentage twice across independent dashboard components.
 */
export function formatPerformanceRate(value?: null | number): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return '-';
  }

  return `${(value * 100).toFixed(1)}%`;
}
