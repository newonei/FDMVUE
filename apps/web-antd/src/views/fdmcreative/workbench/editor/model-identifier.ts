/**
 * Backend Long identifiers are serialized as strings to avoid losing precision
 * in JavaScript. Keep them as strings all the way back to the API.
 */
function normalizeModelIdentifier(value: unknown): string | undefined {
  if (typeof value === 'string') {
    const normalized = value.trim();
    return /^[1-9]\d*$/.test(normalized) ? normalized : undefined;
  }
  if (typeof value === 'number' && Number.isSafeInteger(value) && value > 0) {
    return String(value);
  }
  return undefined;
}

export { normalizeModelIdentifier };
