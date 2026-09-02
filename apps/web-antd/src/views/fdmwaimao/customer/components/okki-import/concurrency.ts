export const CUSTOMER_PROFILE_VERSION_CONFLICT = 1_206_001_008;
export const OKKI_IMPORT_CONFIRM_REQUIRED = 1_206_001_004;
export const OKKI_IMPORT_PREVIEW_STALE = 1_206_002_010;

export function isBusinessCode(
  actual: null | number | string | undefined,
  expected: number,
) {
  return Number(actual) === expected;
}

export function isValidPreviewHash(value: null | string | undefined) {
  return /^[\da-f]{64}$/i.test(value ?? '');
}

export function isValidProfileVersion(value: null | number | undefined) {
  return Number.isSafeInteger(value) && Number(value) >= 0;
}
