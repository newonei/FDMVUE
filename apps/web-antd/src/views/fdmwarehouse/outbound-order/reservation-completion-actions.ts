import type { FdmWarehouseOutboundOrderApi } from '#/api/fdmwarehouse/outbound-order';

type ReservationCompletionSource = Pick<
  FdmWarehouseOutboundOrderApi.OutboundOrder,
  | 'consumedAt'
  | 'outboundOrderId'
  | 'reservationAttemptStatus'
  | 'reservationBacked'
  | 'reservationVersionAtHandoff'
  | 'status'
>;

export type ReservationCompletionCommand =
  FdmWarehouseOutboundOrderApi.CompleteRequest;

const POSITIVE_INTEGER = /^[1-9]\d*$/;
const IDEMPOTENCY_KEY = /^[A-Za-z0-9._:/-]+$/;
const STORAGE_PREFIX = 'fdmwarehouse:reservation-completion:';

export interface ReservationCompletionStorage {
  getItem(key: string): null | string;
  removeItem(key: string): void;
  setItem(key: string, value: string): void;
}

/**
 * The browser may offer the command only for a complete server-published handoff identity.
 * This is a presentation guard; the server still re-reads and verifies the whole attempt.
 */
export function canCompleteReservationAttempt(
  source: null | ReservationCompletionSource | undefined,
): source is ReservationCompletionSource & {
  outboundOrderId: string;
  reservationVersionAtHandoff: number;
} {
  const outboundOrderId = normalizeLongId(source?.outboundOrderId);
  return (
    !!source &&
    source.reservationBacked === true &&
    source.reservationAttemptStatus === 'HANDED_OFF' &&
    source.status === 0 &&
    (source.consumedAt === null || source.consumedAt === undefined) &&
    outboundOrderId !== undefined &&
    Number.isInteger(source.reservationVersionAtHandoff) &&
    (source.reservationVersionAtHandoff ?? 0) > 0
  );
}

/** Reject unsafe JS numbers and normalize every accepted Java Long to decimal text. */
export function normalizeLongId(value: null | number | string | undefined) {
  if (typeof value === 'string') {
    return POSITIVE_INTEGER.test(value) ? value : undefined;
  }
  if (typeof value === 'number' && Number.isSafeInteger(value) && value > 0) {
    return String(value);
  }
  return undefined;
}

/** Reuse the same key after an uncertain network result; rotate only when identity changes. */
export function ensureReservationCompletionCommand(
  current: ReservationCompletionCommand | undefined,
  source: ReservationCompletionSource,
  createIdempotencyKey: () => string,
): ReservationCompletionCommand {
  if (!canCompleteReservationAttempt(source)) {
    throw new Error('Reservation-backed outbound order is not completable');
  }
  const outboundOrderId = normalizeLongId(source.outboundOrderId)!;
  if (
    current?.outboundOrderId === outboundOrderId &&
    current.expectedReservationVersion === source.reservationVersionAtHandoff
  ) {
    return current;
  }
  return {
    expectedReservationVersion: source.reservationVersionAtHandoff,
    idempotencyKey: createIdempotencyKey(),
    outboundOrderId,
  };
}

function storageKey(source: ReservationCompletionSource) {
  const outboundOrderId = normalizeLongId(source.outboundOrderId);
  return outboundOrderId ? `${STORAGE_PREFIX}${outboundOrderId}` : undefined;
}

function isStoredCommand(
  value: unknown,
  outboundOrderId: string,
  expectedReservationVersion: number | undefined,
): value is ReservationCompletionCommand {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const candidate = value as Partial<ReservationCompletionCommand>;
  return (
    candidate.outboundOrderId === outboundOrderId &&
    candidate.expectedReservationVersion === expectedReservationVersion &&
    Number.isInteger(candidate.expectedReservationVersion) &&
    (candidate.expectedReservationVersion ?? 0) > 0 &&
    typeof candidate.idempotencyKey === 'string' &&
    candidate.idempotencyKey.length > 0 &&
    candidate.idempotencyKey.length <= 192 &&
    IDEMPOTENCY_KEY.test(candidate.idempotencyKey)
  );
}

/** Restore only the exact order/version command; corrupt or stale values are discarded. */
export function loadReservationCompletionCommand(
  storage: ReservationCompletionStorage | undefined,
  source: ReservationCompletionSource,
): ReservationCompletionCommand | undefined {
  const key = storageKey(source);
  const outboundOrderId = normalizeLongId(source.outboundOrderId);
  if (!storage || !key || !outboundOrderId) {
    return undefined;
  }
  try {
    const raw = storage.getItem(key);
    if (!raw) {
      return undefined;
    }
    const parsed: unknown = JSON.parse(raw);
    if (
      isStoredCommand(
        parsed,
        outboundOrderId,
        source.reservationVersionAtHandoff,
      )
    ) {
      return parsed;
    }
    storage.removeItem(key);
  } catch {
    try {
      storage.removeItem(key);
    } catch {
      // Storage can be unavailable in privacy mode; the server remains idempotent.
    }
  }
  return undefined;
}

/** Persist before sending so closing/reopening after an uncertain response reuses the same key. */
export function saveReservationCompletionCommand(
  storage: ReservationCompletionStorage | undefined,
  command: ReservationCompletionCommand,
) {
  const key = `${STORAGE_PREFIX}${command.outboundOrderId}`;
  try {
    storage?.setItem(key, JSON.stringify(command));
  } catch {
    // Best-effort browser recovery aid; server-side idempotency is still authoritative.
  }
}

export function clearReservationCompletionCommand(
  storage: ReservationCompletionStorage | undefined,
  source: ReservationCompletionSource,
) {
  const key = storageKey(source);
  if (!storage || !key) {
    return;
  }
  try {
    storage.removeItem(key);
  } catch {
    // Ignore unavailable browser storage after a verified server result.
  }
}

export function isExpectedReservationCompletionReceipt(
  receipt: FdmWarehouseOutboundOrderApi.CompleteResponse,
  command: ReservationCompletionCommand,
) {
  return (
    POSITIVE_INTEGER.test(receipt.reservationId) &&
    Number.isInteger(receipt.attemptNo) &&
    receipt.attemptNo > 0 &&
    receipt.resultVersion === command.expectedReservationVersion + 1 &&
    Number.isInteger(receipt.orderCount) &&
    receipt.orderCount > 0 &&
    Number.isInteger(receipt.lineCount) &&
    receipt.lineCount > 0 &&
    Number.isInteger(receipt.inventoryCount) &&
    receipt.inventoryCount > 0 &&
    typeof receipt.newlyCreated === 'boolean' &&
    typeof receipt.consumedAt === 'string' &&
    !Number.isNaN(Date.parse(receipt.consumedAt))
  );
}
