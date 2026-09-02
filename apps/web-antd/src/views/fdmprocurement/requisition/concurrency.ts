export const PROCUREMENT_CONCURRENT_MODIFICATION = 1_209_001_003;

function nestedCode(value: unknown): unknown {
  if (!value || typeof value !== 'object') return undefined;
  const record = value as Record<string, unknown>;
  return (
    record.code ??
    (record.data as Record<string, unknown> | undefined)?.code ??
    (
      (record.response as Record<string, unknown> | undefined)?.data as
        | Record<string, unknown>
        | undefined
    )?.code
  );
}

export function isProcurementVersionConflict(cause: unknown) {
  return Number(nestedCode(cause)) === PROCUREMENT_CONCURRENT_MODIFICATION;
}

/** CAS conflicts invalidate the command identity; transient failures retain it for idempotent retry. */
export function shouldClearProductBindingCommandKey(cause: unknown) {
  return isProcurementVersionConflict(cause);
}
