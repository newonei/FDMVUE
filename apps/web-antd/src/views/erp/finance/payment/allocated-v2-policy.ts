export interface AllocatedV2State {
  sourceMode?: null | string;
  status?: null | number;
  postingVersion?: null | number;
  version?: null | number;
}

export type ReverseReasonValidation =
  | { error: string; valid: false }
  | { reason: string; valid: true };

const PROCESS_STATUS = 10;
const APPROVED_STATUS = 20;

export function isAllocatedV2(row?: AllocatedV2State | null) {
  return row?.sourceMode === 'ALLOCATED_V2';
}

function hasUsableVersions(row: AllocatedV2State) {
  return (
    Number.isInteger(row.version) &&
    Number(row.version) >= 0 &&
    Number.isInteger(row.postingVersion) &&
    Number(row.postingVersion) >= 0
  );
}

/**
 * A V2 head is editable only while it is not balance-effective. A first draft uses posting
 * version 0; a reversed draft uses the next even version and remains auditable/editable.
 */
export function canEditAllocatedV2(row?: AllocatedV2State | null) {
  return Boolean(
    row &&
    isAllocatedV2(row) &&
    row.status === PROCESS_STATUS &&
    hasUsableVersions(row) &&
    Number(row.postingVersion) % 2 === 0,
  );
}

export function canPostAllocatedV2(row?: AllocatedV2State | null) {
  return canEditAllocatedV2(row);
}

export function canReverseAllocatedV2(row?: AllocatedV2State | null) {
  return Boolean(
    row &&
    isAllocatedV2(row) &&
    row.status === APPROVED_STATUS &&
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
export function validateAllocatedV2ReverseReason(
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
