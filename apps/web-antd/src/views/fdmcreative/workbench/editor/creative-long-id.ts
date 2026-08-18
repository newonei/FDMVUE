/**
 * Java Long identifiers are serialized as decimal strings by the backend. Keep that form in UI
 * state, URLs and SSE subscriptions so a Snowflake-style value never passes through an unsafe
 * JavaScript number.
 */
export type CreativeLongId = string;

export function normalizeCreativeLongId(
  value: unknown,
): CreativeLongId | undefined {
  if (typeof value === 'string') {
    const normalized = value.trim();
    return /^[1-9]\d*$/.test(normalized) ? normalized : undefined;
  }
  if (typeof value === 'number' && Number.isSafeInteger(value) && value > 0) {
    return String(value);
  }
  return undefined;
}

export function requireCreativeLongId(
  value: unknown,
  fieldName = 'id',
): CreativeLongId {
  const normalized = normalizeCreativeLongId(value);
  if (!normalized) {
    throw new TypeError(`${fieldName} 必须是正整数形式的字符串`);
  }
  return normalized;
}
