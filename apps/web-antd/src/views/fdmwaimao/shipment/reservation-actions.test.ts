import type { FdmWaimaoShipmentApi } from '#/api/fdmwaimao/shipment';

import { describe, expect, it } from 'vitest';

import {
  availableShipmentReservationAction,
  ensureShipmentReservationCommand,
  isExpectedShipmentReservationResult,
  isShipmentDraftEditable,
  isShipmentReservationCommandCurrent,
} from './reservation-actions';

function detail(
  overrides: Partial<FdmWaimaoShipmentApi.Detail> = {},
): FdmWaimaoShipmentApi.Detail {
  return {
    companyId: '9223372036854775701',
    confirmAvailable: false,
    contractOrderId: '9223372036854775702',
    contractOrderVersion: 3,
    contractSnapshotHash: 'a'.repeat(64),
    creationIdempotencyKey: 'shipment-draft:fixture-1',
    creationRequestHash: 'b'.repeat(64),
    customerId: '9223372036854775703',
    fulfillmentPlanConfirmedSnapshotHash: 'c'.repeat(64),
    fulfillmentPlanId: '9223372036854775704',
    fulfillmentPlanVersion: 5,
    id: '9223372036854775806',
    lineCount: 1,
    lines: [],
    nextRequiredAction: 'RESERVE_WMS_STOCK',
    ownerUserId: '9223372036854775705',
    readinessMaterialized: true,
    shipmentNo: 'SHIP-20260831-1',
    sourceCount: 1,
    status: 'DRAFT',
    version: 9,
    wmsOrders: [],
    ...overrides,
  };
}

describe('shipment reservation action policy', () => {
  it('opens only the permission and server-state matching action', () => {
    const ready = detail();
    const active = detail({
      nextRequiredAction: 'SHIPMENT_CONFIRMATION',
      reservationId: '9223372036854775807',
      reservationStatus: 'ACTIVE',
    });
    const released = detail({
      nextRequiredAction: 'RE_RESERVE_WMS_STOCK',
      reservationId: '9223372036854775807',
      reservationStatus: 'RELEASED',
    });

    expect(availableShipmentReservationAction(ready, true)).toBe('RESERVE');
    expect(availableShipmentReservationAction(active, true)).toBe('RELEASE');
    expect(availableShipmentReservationAction(released, true)).toBe(
      'RERESERVE',
    );
    expect(availableShipmentReservationAction(ready, false)).toBeUndefined();
    expect(
      availableShipmentReservationAction(
        detail({ readinessMaterialized: false }),
        true,
      ),
    ).toBeUndefined();
    expect(
      availableShipmentReservationAction(
        detail({ nextRequiredAction: 'SHIPMENT_CONFIRMATION' }),
        true,
      ),
    ).toBeUndefined();
  });

  it('reuses one idempotency key for retry and creates a new key for a new action', () => {
    let sequence = 0;
    const createKey = (kind: 'RELEASE' | 'RESERVE') =>
      `shipment-reservation:${kind.toLowerCase()}:key-${++sequence}`;
    const seed = {
      expectedVersion: 9,
      kind: 'RESERVE' as const,
      shipmentId: '9223372036854775806',
    };

    const first = ensureShipmentReservationCommand(undefined, seed, createKey);
    const retry = ensureShipmentReservationCommand(first, seed, createKey);
    const nextVersion = ensureShipmentReservationCommand(
      retry,
      { ...seed, expectedVersion: 10 },
      createKey,
    );
    const release = ensureShipmentReservationCommand(
      nextVersion,
      {
        ...seed,
        expectedVersion: 10,
        kind: 'RELEASE',
        reason: '运输计划调整',
      },
      createKey,
    );
    const releaseRetry = ensureShipmentReservationCommand(
      release,
      {
        ...seed,
        expectedVersion: 10,
        kind: 'RELEASE',
        reason: '运输计划调整',
      },
      createKey,
    );
    const changedReason = ensureShipmentReservationCommand(
      releaseRetry,
      {
        ...seed,
        expectedVersion: 10,
        kind: 'RELEASE',
        reason: '客户改期',
      },
      createKey,
    );

    expect(retry).toBe(first);
    expect(retry.idempotencyKey).toBe('shipment-reservation:reserve:key-1');
    expect(nextVersion.idempotencyKey).toBe(
      'shipment-reservation:reserve:key-2',
    );
    expect(release.idempotencyKey).toBe('shipment-reservation:release:key-3');
    expect(releaseRetry).toBe(release);
    expect(changedReason.idempotencyKey).toBe(
      'shipment-reservation:release:key-4',
    );
  });

  it('invalidates a pending command when version, source or legal action changes', () => {
    const source = detail();
    const command = ensureShipmentReservationCommand(
      undefined,
      {
        expectedVersion: source.version,
        kind: 'RESERVE',
        shipmentId: source.id,
      },
      () => 'shipment-reservation:reserve:stable-key',
    );

    expect(isShipmentReservationCommandCurrent(command, source, true)).toBe(
      true,
    );
    expect(
      isShipmentReservationCommandCurrent(
        command,
        detail({ version: source.version + 1 }),
        true,
      ),
    ).toBe(false);
    expect(
      isShipmentReservationCommandCurrent(
        command,
        detail({ id: '9223372036854775808' }),
        true,
      ),
    ).toBe(false);
    expect(
      isShipmentReservationCommandCurrent(
        command,
        detail({
          nextRequiredAction: 'SHIPMENT_CONFIRMATION',
          reservationId: '9223372036854775807',
          reservationStatus: 'ACTIVE',
        }),
        true,
      ),
    ).toBe(false);
  });

  it('accepts only the exact string-ID receipt for the current command', () => {
    const command = {
      expectedVersion: 9,
      idempotencyKey: 'shipment-reservation:reserve:stable-key',
      kind: 'RESERVE' as const,
      shipmentId: '9223372036854775806',
    };
    const receipt: FdmWaimaoShipmentApi.ReservationResult = {
      confirmAvailable: false,
      created: true,
      expiresAt: '2026-08-31T12:30:00',
      idempotencyKey: command.idempotencyKey,
      nextRequiredAction: 'SHIPMENT_CONFIRMATION',
      requestHash: 'd'.repeat(64),
      reservationAttemptNo: 1,
      reservationId: '9223372036854775807',
      reservationSourceVersion: 9,
      reservationVersion: 1,
      reservedAt: '2026-08-31T12:00:00',
      shipmentId: command.shipmentId,
      shipmentVersion: 10,
      status: 'ACTIVE',
    };

    expect(isExpectedShipmentReservationResult(receipt, command)).toBe(true);
    expect(
      isExpectedShipmentReservationResult(
        { ...receipt, requestHash: 'D'.repeat(64) },
        command,
      ),
    ).toBe(false);
    expect(
      isExpectedShipmentReservationResult(
        { ...receipt, reservationVersion: 0 },
        command,
      ),
    ).toBe(false);
    expect(
      isExpectedShipmentReservationResult(
        {
          ...receipt,
          reservationId: 9_223_372_036_854_776_000 as unknown as string,
        },
        command,
      ),
    ).toBe(false);
  });

  it('locks ordinary draft editing only while a non-terminal reservation exists', () => {
    expect(isShipmentDraftEditable(detail())).toBe(true);
    expect(
      isShipmentDraftEditable(detail({ reservationStatus: 'ACTIVE' })),
    ).toBe(false);
    expect(
      isShipmentDraftEditable(detail({ reservationStatus: 'RELEASED' })),
    ).toBe(true);
    expect(
      isShipmentDraftEditable(detail({ reservationStatus: 'EXPIRED' })),
    ).toBe(true);
    expect(isShipmentDraftEditable(detail({ status: 'CANCELLED' }))).toBe(
      false,
    );
  });
});
