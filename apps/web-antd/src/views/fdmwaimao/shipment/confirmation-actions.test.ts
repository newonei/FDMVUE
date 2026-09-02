import type { FdmWaimaoShipmentApi } from '#/api/fdmwaimao/shipment';

import { describe, expect, it } from 'vitest';

import {
  canConfirmShipment,
  ensureShipmentConfirmationCommand,
  isExpectedShipmentConfirmationResult,
  isShipmentConfirmationCommandCurrent,
} from './confirmation-actions';

function detail(
  overrides: Partial<FdmWaimaoShipmentApi.Detail> = {},
): FdmWaimaoShipmentApi.Detail {
  return {
    companyId: '1',
    confirmAvailable: true,
    contractOrderId: '2',
    contractOrderVersion: 3,
    contractSnapshotHash: 'a'.repeat(64),
    creationIdempotencyKey: 'shipment-draft:fixture-1',
    creationRequestHash: 'b'.repeat(64),
    customerId: '3',
    fulfillmentPlanConfirmedSnapshotHash: 'c'.repeat(64),
    fulfillmentPlanId: '4',
    fulfillmentPlanVersion: 5,
    id: '9223372036854775806',
    lineCount: 1,
    lines: [],
    nextRequiredAction: 'SHIPMENT_CONFIRMATION',
    ownerUserId: '5',
    readinessMaterialized: true,
    reservationId: '9223372036854775807',
    reservationStatus: 'ACTIVE',
    reservationVersion: 1,
    shipmentNo: 'SHIP-20260831-1',
    sourceCount: 1,
    status: 'DRAFT',
    version: 10,
    warehouseOutboundOrders: [],
    ...overrides,
  };
}

describe('shipment confirmation action policy', () => {
  it('requires permission and the complete server-published confirmation boundary', () => {
    expect(canConfirmShipment(detail(), true)).toBe(true);
    expect(canConfirmShipment(detail(), false)).toBe(false);
    expect(canConfirmShipment(detail({ confirmAvailable: false }), true)).toBe(
      false,
    );
    expect(
      canConfirmShipment(
        detail({ reservationStatus: 'HANDOFF_PENDING' }),
        true,
      ),
    ).toBe(false);
    expect(canConfirmShipment(detail({ reservationVersion: 0 }), true)).toBe(
      false,
    );
  });

  it('reuses one command identity for an uncertain retry', () => {
    const source = detail();
    let sequence = 0;
    const first = ensureShipmentConfirmationCommand(
      undefined,
      source,
      () => `shipment-confirm:key-${++sequence}`,
    );
    const replay = ensureShipmentConfirmationCommand(
      first,
      source,
      () => `shipment-confirm:key-${++sequence}`,
    );
    const changed = ensureShipmentConfirmationCommand(
      first,
      detail({ version: 11 }),
      () => `shipment-confirm:key-${++sequence}`,
    );

    expect(replay).toBe(first);
    expect(changed.idempotencyKey).toBe('shipment-confirm:key-2');
    expect(isShipmentConfirmationCommandCurrent(first, source, true)).toBe(
      true,
    );
    expect(
      isShipmentConfirmationCommandCurrent(
        first,
        detail({ confirmAvailable: false }),
        true,
      ),
    ).toBe(false);
  });

  it('accepts only the exact committed confirmation receipt', () => {
    const command = {
      expectedVersion: 10,
      idempotencyKey: 'shipment-confirm:stable-key-1',
      shipmentId: '9223372036854775806',
    };
    const receipt: FdmWaimaoShipmentApi.ConfirmResult = {
      confirmedSnapshotHash: 'd'.repeat(64),
      created: true,
      nextRequiredAction: 'WAREHOUSE_HANDOFF_PENDING',
      outboxEventId: '550e8400-e29b-41d4-a716-446655440000',
      shipmentId: command.shipmentId,
      shipmentVersion: 11,
      status: 'CONFIRMED',
    };

    expect(isExpectedShipmentConfirmationResult(receipt, command)).toBe(true);
    expect(
      isExpectedShipmentConfirmationResult(
        { ...receipt, confirmedSnapshotHash: 'D'.repeat(64) },
        command,
      ),
    ).toBe(false);
    expect(
      isExpectedShipmentConfirmationResult(
        { ...receipt, shipmentVersion: 12 },
        command,
      ),
    ).toBe(false);
  });
});
