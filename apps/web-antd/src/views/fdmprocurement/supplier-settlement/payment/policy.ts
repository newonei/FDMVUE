export interface SupplierPaymentState {
  status?: null | string;
  postingVersion?: null | number;
  version?: null | number;
}

export type ReverseReasonValidation =
  | { error: string; valid: false }
  | { reason: string; valid: true };

const DRAFT_STATUS = 'DRAFT';
const POSTED_STATUS = 'POSTED';

export function isSupplierPayment(row?: null | SupplierPaymentState) {
  return Boolean(
    row && (row.status === DRAFT_STATUS || row.status === POSTED_STATUS),
  );
}

function hasUsableVersions(row: SupplierPaymentState) {
  return (
    Number.isInteger(row.version) &&
    Number(row.version) >= 0 &&
    Number.isInteger(row.postingVersion) &&
    Number(row.postingVersion) >= 0
  );
}

/**
 * A supplier payment head is editable only while it is not balance-effective. A first draft uses posting
 * version 0; a reversed draft uses the next even version and remains auditable/editable.
 */
export function canEditSupplierPayment(row?: null | SupplierPaymentState) {
  return Boolean(
    row &&
    isSupplierPayment(row) &&
    row.status === DRAFT_STATUS &&
    hasUsableVersions(row) &&
    Number(row.postingVersion) % 2 === 0,
  );
}

export function canPostSupplierPayment(row?: null | SupplierPaymentState) {
  return canEditSupplierPayment(row);
}

export function canReverseSupplierPayment(row?: null | SupplierPaymentState) {
  return Boolean(
    row &&
    isSupplierPayment(row) &&
    row.status === POSTED_STATUS &&
    hasUsableVersions(row) &&
    Number(row.postingVersion) % 2 === 1,
  );
}

function containsControlCharacter(value: string) {
  return [...value].some((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint <= 31 || (codePoint >= 127 && codePoint <= 159);
  });
}

/** Matches the backend canonical reversal boundary: trimmed, safe and 1..500 characters. */
export function validateSupplierPaymentReverseReason(
  rawReason: string,
): ReverseReasonValidation {
  if (containsControlCharacter(rawReason)) {
    return { error: '冲销原因不能包含控制字符', valid: false };
  }
  const reason = rawReason.trim();
  if (!reason) return { error: '请填写冲销原因', valid: false };
  if (reason.length > 500) {
    return { error: '冲销原因不能超过 500 个字符', valid: false };
  }
  return { reason, valid: true };
}
