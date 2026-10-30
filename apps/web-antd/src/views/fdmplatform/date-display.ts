import { formatDate, formatDateTime } from '@vben/utils';

// Business dates are calendar dates, including legacy fields whose names end in At.
const dateFields = new Set([
  'actualDate',
  'businessDate',
  'costDate',
  'deliveryDate',
  'dueDate',
  'exchangeRateDate',
  'expenseDate',
  'invoiceDate',
  'issuedAt',
  'occurredDate',
  'paidAt',
  'plannedDate',
  'promisedDate',
  'rateDate',
  'receivedAt',
  'requestedDate',
  'requiredDate',
  'shippedDate',
  'signedDate',
  'sourceDate',
  'validFrom',
  'validUntil',
]);

const dateTimeFields = new Set([
  'assignedAt',
  'at',
  'cancelledAt',
  'closedAt',
  'completedAt',
  'confirmedAt',
  'created_at',
  'createdAt',
  'createTime',
  'exchangeRateFetchedAt',
  'expiresAt',
  'fetchedAt',
  'lastSyncedAt',
  'occurredAt',
  'openedAt',
  'resolvedAt',
  'reviewedAt',
  'sourceUpdatedAt',
  'submittedAt',
  'updated_at',
  'updatedAt',
  'updateTime',
]);

/** Formats only known temporal fields; identifiers, amounts and durations stay untouched. */
export function formatTemporalField(
  key: string,
  value: unknown,
): string | undefined {
  const field = key.split('.').at(-1) ?? key;
  const dateOnly = dateFields.has(field);
  if (!dateOnly && !dateTimeFields.has(field)) return undefined;
  if (
    value === null ||
    value === undefined ||
    value === '' ||
    (typeof value !== 'number' &&
      typeof value !== 'string' &&
      !(value instanceof Date))
  )
    return '—';

  // A LocalDate has no timezone: switching the display timezone must not change it.
  if (
    dateOnly &&
    typeof value === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(value)
  ) {
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return Number.isFinite(parsed.getTime()) &&
      parsed.toISOString().startsWith(value)
      ? value
      : '—';
  }

  const formatted = dateOnly ? formatDate(value) : formatDateTime(value);
  return /^\d{4}-\d{2}-\d{2}(?: \d{2}:\d{2}:\d{2})?$/.test(formatted)
    ? formatted
    : '—';
}
