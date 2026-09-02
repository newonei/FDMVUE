import type { FdmWaimaoShipmentApi } from '#/api/fdmwaimao/shipment';

type ConfirmationSource = Pick<
  FdmWaimaoShipmentApi.Detail,
  | 'confirmAvailable'
  | 'id'
  | 'nextRequiredAction'
  | 'readinessMaterialized'
  | 'reservationId'
  | 'reservationStatus'
  | 'reservationVersion'
  | 'status'
  | 'version'
>;

export interface ShipmentConfirmationCommandIdentity {
  expectedVersion: number;
  idempotencyKey: string;
  shipmentId: FdmWaimaoShipmentApi.JavaLongString;
}

const LOWER_SHA256 = /^[0-9a-f]{64}$/;
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function canConfirmShipment(
  source: null | undefined | unknown,
  permitted: boolean,
): source is ConfirmationSource {
  if (!permitted || !source || typeof source !== 'object') return false;
  const candidate = source as Partial<ConfirmationSource>;
  return (
    candidate.status === 'DRAFT' &&
    candidate.confirmAvailable === true &&
    candidate.readinessMaterialized === true &&
    candidate.nextRequiredAction === 'SHIPMENT_CONFIRMATION' &&
    candidate.reservationStatus === 'ACTIVE' &&
    typeof candidate.reservationId === 'string' &&
    /^[1-9]\d*$/.test(candidate.reservationId) &&
    Number.isInteger(candidate.reservationVersion) &&
    (candidate.reservationVersion ?? 0) > 0 &&
    Number.isInteger(candidate.version) &&
    (candidate.version ?? -1) >= 0
  );
}

export function ensureShipmentConfirmationCommand(
  current: ShipmentConfirmationCommandIdentity | undefined,
  source: ConfirmationSource,
  createIdempotencyKey: () => string,
): ShipmentConfirmationCommandIdentity {
  if (
    current?.shipmentId === source.id &&
    current.expectedVersion === source.version
  ) {
    return current;
  }
  return {
    expectedVersion: source.version,
    idempotencyKey: createIdempotencyKey(),
    shipmentId: source.id,
  };
}

export function isShipmentConfirmationCommandCurrent(
  command: ShipmentConfirmationCommandIdentity | undefined,
  source: FdmWaimaoShipmentApi.Detail | null | undefined,
  permitted: boolean,
) {
  return (
    !!command &&
    canConfirmShipment(source, permitted) &&
    command.shipmentId === source.id &&
    command.expectedVersion === source.version
  );
}

export function isExpectedShipmentConfirmationResult(
  result: FdmWaimaoShipmentApi.ConfirmResult,
  command: ShipmentConfirmationCommandIdentity,
) {
  return (
    result.shipmentId === command.shipmentId &&
    result.shipmentVersion === command.expectedVersion + 1 &&
    result.status === 'CONFIRMED' &&
    typeof result.created === 'boolean' &&
    LOWER_SHA256.test(result.confirmedSnapshotHash) &&
    UUID.test(result.outboxEventId) &&
    [
      'WMS_HANDOFF_PENDING',
      'WMS_HANDOFF_RECOVERY_REQUIRED',
      'WMS_OUTBOUND_PENDING',
    ].includes(result.nextRequiredAction)
  );
}
