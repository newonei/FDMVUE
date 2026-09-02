export type PurchaseReturnReverseReasonValidation =
  | { error: string; valid: false }
  | { reason: string; valid: true };

function containsControlCharacter(value: string) {
  return [...value].some((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint <= 31 || (codePoint >= 127 && codePoint <= 159);
  });
}

/** Matches the backend audit boundary: trim first, then require 1..500 safe characters. */
export function validatePurchaseReturnReverseReason(
  rawReason: string,
): PurchaseReturnReverseReasonValidation {
  if (containsControlCharacter(rawReason)) {
    return { error: '反过账原因不能包含控制字符', valid: false };
  }
  const reason = rawReason.trim();
  if (!reason) return { error: '请填写反过账原因', valid: false };
  if (reason.length > 500) {
    return { error: '反过账原因不能超过 500 个字符', valid: false };
  }
  return { reason, valid: true };
}
