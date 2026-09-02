import type { FdmWaimaoShipmentApi } from '#/api/fdmwaimao/shipment';

type RecoverySource = Pick<
  FdmWaimaoShipmentApi.Detail,
  | 'id'
  | 'nextRequiredAction'
  | 'reservationStatus'
  | 'status'
  | 'version'
  | 'wmsHandoffRecoveryRequired'
>;

export interface ShipmentHandoffRecoveryCommandIdentity {
  expectedShipmentVersion: number;
  idempotencyKey: string;
  reason: string;
  shipmentId: FdmWaimaoShipmentApi.JavaLongString;
}

const POSITIVE_LONG = /^[1-9]\d*$/;
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function canRecoverShipmentHandoff(
  source: null | undefined | unknown,
  permitted: boolean,
): source is RecoverySource {
  if (!permitted || !source || typeof source !== 'object') return false;
  const candidate = source as Partial<RecoverySource>;
  return (
    candidate.status === 'CONFIRMED' &&
    candidate.reservationStatus === 'HANDOFF_PENDING' &&
    candidate.nextRequiredAction === 'WMS_HANDOFF_RECOVERY_REQUIRED' &&
    candidate.wmsHandoffRecoveryRequired === true &&
    typeof candidate.id === 'string' &&
    POSITIVE_LONG.test(candidate.id) &&
    Number.isInteger(candidate.version) &&
    (candidate.version ?? 0) > 0
  );
}

export function ensureShipmentHandoffRecoveryCommand(
  current: ShipmentHandoffRecoveryCommandIdentity | undefined,
  source: RecoverySource,
  reason: string,
  createIdempotencyKey: () => string,
): ShipmentHandoffRecoveryCommandIdentity {
  if (
    current?.shipmentId === source.id &&
    current.expectedShipmentVersion === source.version &&
    current.reason === reason
  ) {
    return current;
  }
  return {
    expectedShipmentVersion: source.version,
    idempotencyKey: createIdempotencyKey(),
    reason,
    shipmentId: source.id,
  };
}

export function isShipmentHandoffRecoveryCommandCurrent(
  command: ShipmentHandoffRecoveryCommandIdentity | undefined,
  source: FdmWaimaoShipmentApi.Detail | null | undefined,
  permitted: boolean,
) {
  return (
    !!command &&
    canRecoverShipmentHandoff(source, permitted) &&
    command.shipmentId === source.id &&
    command.expectedShipmentVersion === source.version
  );
}

export function isExpectedShipmentHandoffRecoveryResult(
  result: FdmWaimaoShipmentApi.HandoffRecoveryResult,
  command: ShipmentHandoffRecoveryCommandIdentity,
) {
  return (
    result.shipmentId === command.shipmentId &&
    result.shipmentVersion === command.expectedShipmentVersion &&
    POSITIVE_LONG.test(result.outboxId) &&
    Number.isInteger(result.outboxVersion) &&
    result.outboxVersion > 0 &&
    UUID.test(result.eventId) &&
    result.status === 'PENDING' &&
    typeof result.recovered === 'boolean' &&
    !!result.availableAt &&
    result.nextRequiredAction === 'WMS_HANDOFF_PENDING'
  );
}
