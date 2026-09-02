const POSITIVE_AMOUNT_PATTERN = /^(?:0|[1-9]\d{0,17})(?:\.\d{1,6})?$/;

export function expenseActionRequiresReason(action?: string) {
  return ['CANCEL', 'REJECT', 'REOPEN', 'VOID'].includes(action ?? '');
}

export function hasEveryExpensePermission(
  codes: string[],
  hasPermission: (code: string) => boolean,
) {
  return codes.every((code) => hasPermission(code));
}

export function hasExpenseSourcePermission(
  canQueryContract: boolean,
  canQueryShipment: boolean,
) {
  return canQueryContract || canQueryShipment;
}

export function isValidPositiveExpenseAmount(value: string) {
  const normalized = value.trim();
  return (
    POSITIVE_AMOUNT_PATTERN.test(normalized) && !/^0(?:\.0+)?$/.test(normalized)
  );
}
