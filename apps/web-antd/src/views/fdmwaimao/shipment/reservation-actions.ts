import type { FdmWaimaoShipmentApi } from '#/api/fdmwaimao/shipment';

export type ShipmentReservationAction = 'RELEASE' | 'RERESERVE' | 'RESERVE';
export type ShipmentReservationCommandKind = 'RELEASE' | 'RESERVE';

type ReservationActionSource = Pick<
  FdmWaimaoShipmentApi.Detail,
  | 'nextRequiredAction'
  | 'readinessMaterialized'
  | 'reservationId'
  | 'reservationStatus'
  | 'status'
>;

export interface ShipmentReservationCommandIdentity {
  expectedVersion: number;
  idempotencyKey: string;
  kind: ShipmentReservationCommandKind;
  reason?: string;
  shipmentId: FdmWaimaoShipmentApi.JavaLongString;
}

export type ShipmentReservationCommandSeed = Omit<
  ShipmentReservationCommandIdentity,
  'idempotencyKey'
>;

const SHA256 = /^[0-9a-f]{64}$/;
const POSITIVE_LONG_STRING = /^[1-9]\d*$/;

export function availableShipmentReservationAction(
  source: unknown,
  permitted: boolean,
): ShipmentReservationAction | undefined {
  if (!source || typeof source !== 'object') return undefined;
  const candidate = source as Partial<ReservationActionSource>;
  if (
    !permitted ||
    candidate.status !== 'DRAFT' ||
    !candidate.readinessMaterialized
  ) {
    return undefined;
  }
  if (
    candidate.nextRequiredAction === 'RESERVE_WMS_STOCK' &&
    !candidate.reservationId &&
    !candidate.reservationStatus
  ) {
    return 'RESERVE';
  }
  if (
    candidate.nextRequiredAction === 'SHIPMENT_CONFIRMATION' &&
    !!candidate.reservationId &&
    candidate.reservationStatus === 'ACTIVE'
  ) {
    return 'RELEASE';
  }
  if (
    candidate.nextRequiredAction === 'RE_RESERVE_WMS_STOCK' &&
    !!candidate.reservationId &&
    (candidate.reservationStatus === 'EXPIRED' ||
      candidate.reservationStatus === 'RELEASED')
  ) {
    return 'RERESERVE';
  }
  return undefined;
}

export function reservationCommandKind(
  action: ShipmentReservationAction,
): ShipmentReservationCommandKind {
  return action === 'RELEASE' ? 'RELEASE' : 'RESERVE';
}

export function ensureShipmentReservationCommand(
  current: ShipmentReservationCommandIdentity | undefined,
  seed: ShipmentReservationCommandSeed,
  createIdempotencyKey: (kind: ShipmentReservationCommandKind) => string,
): ShipmentReservationCommandIdentity {
  if (
    current?.kind === seed.kind &&
    current.shipmentId === seed.shipmentId &&
    current.expectedVersion === seed.expectedVersion &&
    current.reason === seed.reason
  ) {
    return current;
  }
  return {
    ...seed,
    idempotencyKey: createIdempotencyKey(seed.kind),
  };
}

export function isShipmentReservationCommandCurrent(
  command: ShipmentReservationCommandIdentity | undefined,
  source:
    | null
    | (ReservationActionSource & { id: string; version: number })
    | undefined,
  permitted: boolean,
) {
  const action = availableShipmentReservationAction(source, permitted);
  return (
    !!command &&
    !!source &&
    command.shipmentId === source.id &&
    command.expectedVersion === source.version &&
    !!action &&
    command.kind === reservationCommandKind(action)
  );
}

export function isShipmentDraftEditable(source: unknown) {
  if (!source || typeof source !== 'object') return false;
  const candidate = source as Partial<
    Pick<FdmWaimaoShipmentApi.Detail, 'reservationStatus' | 'status'>
  >;
  return (
    candidate.status === 'DRAFT' &&
    (!candidate.reservationStatus ||
      candidate.reservationStatus === 'EXPIRED' ||
      candidate.reservationStatus === 'RELEASED')
  );
}

export function isExpectedShipmentReservationResult(
  result: FdmWaimaoShipmentApi.ReservationResult,
  command: ShipmentReservationCommandIdentity,
) {
  const reserve = command.kind === 'RESERVE';
  return (
    result.shipmentId === command.shipmentId &&
    result.shipmentVersion === command.expectedVersion + 1 &&
    typeof result.reservationId === 'string' &&
    POSITIVE_LONG_STRING.test(result.reservationId) &&
    Number.isInteger(result.reservationSourceVersion) &&
    result.reservationSourceVersion === command.expectedVersion &&
    Number.isInteger(result.reservationAttemptNo) &&
    result.reservationAttemptNo > 0 &&
    Number.isInteger(result.reservationVersion) &&
    result.reservationVersion > 0 &&
    result.idempotencyKey === command.idempotencyKey &&
    SHA256.test(result.requestHash) &&
    !!result.reservedAt &&
    !!result.expiresAt &&
    result.confirmAvailable === false &&
    (reserve
      ? result.status === 'ACTIVE' &&
        result.nextRequiredAction === 'SHIPMENT_CONFIRMATION'
      : (result.status === 'EXPIRED' || result.status === 'RELEASED') &&
        result.nextRequiredAction === 'RE_RESERVE_WMS_STOCK')
  );
}
