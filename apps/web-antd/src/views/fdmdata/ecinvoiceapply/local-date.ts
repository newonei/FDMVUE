function formatLocalDateParts(
  yearValue: unknown,
  monthValue: unknown,
  dayValue: unknown,
): string | undefined {
  const year = Number(yearValue);
  const month = Number(monthValue);
  const day = Number(dayValue);
  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day) ||
    year < 1 ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31
  ) {
    return undefined;
  }

  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    return undefined;
  }
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** 将接口 LocalDate 的字符串或 [年, 月, 日] 数组转换为 DatePicker 的 valueFormat 字符串。 */
export function normalizeLocalDateForForm(value: unknown): string | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  if (Array.isArray(value) && value.length >= 3) {
    return formatLocalDateParts(value[0], value[1], value[2]);
  }

  if (typeof value !== 'string') {
    return undefined;
  }
  const normalized = value.trim();
  if (!normalized) return undefined;

  const match = normalized.match(
    /^(\d{1,4})[-/,](\d{1,2})[-/,](\d{1,2})(?:[ T].*)?$/,
  );
  return match ? formatLocalDateParts(match[1], match[2], match[3]) : undefined;
}
