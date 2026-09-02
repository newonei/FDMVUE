import type { FdmWaimaoShipmentApi } from '#/api/fdmwaimao/shipment';

export type ShipmentReadinessCommandAction = 'regenerate' | 'start';

interface ShipmentReadinessCommandBase {
  idempotencyKey: string;
  instruction?: string;
  modelId: FdmWaimaoShipmentApi.JavaLongString;
  shipmentId: FdmWaimaoShipmentApi.JavaLongString;
  warehouseId: FdmWaimaoShipmentApi.JavaLongString;
}

export interface ShipmentReadinessStartCommandIdentity extends ShipmentReadinessCommandBase {
  action: 'start';
  expectedVersion: number;
}

export interface ShipmentReadinessRegenerateCommandIdentity extends ShipmentReadinessCommandBase {
  action: 'regenerate';
  expectedVersion: FdmWaimaoShipmentApi.JavaLongString;
  generationRunId: FdmWaimaoShipmentApi.JavaLongString;
}

export type ShipmentReadinessCommandIdentity =
  | ShipmentReadinessRegenerateCommandIdentity
  | ShipmentReadinessStartCommandIdentity;

export type ShipmentReadinessStartCommandSeed = Omit<
  ShipmentReadinessStartCommandIdentity,
  'idempotencyKey'
>;
export type ShipmentReadinessRegenerateCommandSeed = Omit<
  ShipmentReadinessRegenerateCommandIdentity,
  'idempotencyKey'
>;
export type ShipmentReadinessCommandSeed =
  | ShipmentReadinessRegenerateCommandSeed
  | ShipmentReadinessStartCommandSeed;

export function isSameShipmentReadinessCommand(
  current: ShipmentReadinessCommandIdentity | undefined,
  seed: ShipmentReadinessCommandSeed,
): current is ShipmentReadinessCommandIdentity {
  return (
    current?.action === seed.action &&
    current.shipmentId === seed.shipmentId &&
    current.expectedVersion === seed.expectedVersion &&
    (current.action !== 'regenerate' ||
      (seed.action === 'regenerate' &&
        current.generationRunId === seed.generationRunId)) &&
    current.modelId === seed.modelId &&
    current.warehouseId === seed.warehouseId &&
    current.instruction === seed.instruction
  );
}

/**
 * An uncertain browser retry must replay the exact same command body and key.
 * Any source version, run, model, warehouse or instruction change creates a new command.
 */
export function ensureShipmentReadinessCommand(
  current: ShipmentReadinessCommandIdentity | undefined,
  seed: ShipmentReadinessStartCommandSeed,
  createIdempotencyKey: (action: ShipmentReadinessCommandAction) => string,
): ShipmentReadinessStartCommandIdentity;
export function ensureShipmentReadinessCommand(
  current: ShipmentReadinessCommandIdentity | undefined,
  seed: ShipmentReadinessRegenerateCommandSeed,
  createIdempotencyKey: (action: ShipmentReadinessCommandAction) => string,
): ShipmentReadinessRegenerateCommandIdentity;
export function ensureShipmentReadinessCommand(
  current: ShipmentReadinessCommandIdentity | undefined,
  seed: ShipmentReadinessCommandSeed,
  createIdempotencyKey: (action: ShipmentReadinessCommandAction) => string,
): ShipmentReadinessCommandIdentity {
  if (isSameShipmentReadinessCommand(current, seed)) return current;
  return {
    ...seed,
    idempotencyKey: createIdempotencyKey(seed.action),
  };
}
