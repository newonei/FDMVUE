import type { FdmWaimaoShipmentApi } from '#/api/fdmwaimao/shipment';

import { describe, expect, it } from 'vitest';

import {
  canRecoverShipmentHandoff,
  ensureShipmentHandoffRecoveryCommand,
  isExpectedShipmentHandoffRecoveryResult,
  isShipmentHandoffRecoveryCommandCurrent,
} from './handoff-recovery-actions';

function detail(
  overrides: Partial<FdmWaimaoShipmentApi.Detail> = {},
): FdmWaimaoShipmentApi.Detail {
  return {
    companyId: '1',
    confirmAvailable: false,
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
    nextRequiredAction: 'WAREHOUSE_HANDOFF_RECOVERY_REQUIRED',
    ownerUserId: '5',
    readinessMaterialized: true,
    reservationId: '9223372036854775807',
    reservationStatus: 'HANDOFF_PENDING',
    reservationVersion: 2,
    shipmentNo: 'SHIP-20260831-1',
    sourceCount: 1,
    status: 'CONFIRMED',
    version: 11,
    warehouseHandoffRecoveryRequired: true,
    warehouseOutboundOrders: [],
    ...overrides,
  };
}

describe('shipment handoff recovery action policy', () => {
  it('appears only for the server-declared dead-letter recovery state', () => {
    expect(canRecoverShipmentHandoff(detail(), true)).toBe(true);
    expect(canRecoverShipmentHandoff(detail(), false)).toBe(false);
    expect(
      canRecoverShipmentHandoff(
        detail({ nextRequiredAction: 'WAREHOUSE_HANDOFF_PENDING' }),
        true,
      ),
    ).toBe(false);
    expect(
      canRecoverShipmentHandoff(
        detail({ reservationStatus: 'HANDED_OFF' }),
        true,
      ),
    ).toBe(false);
    expect(
      canRecoverShipmentHandoff(
        detail({ warehouseHandoffRecoveryRequired: false }),
        true,
      ),
    ).toBe(false);
  });

  it('reuses the command only while shipment version and audit reason are unchanged', () => {
    const source = detail();
    let sequence = 0;
    const createKey = () => `shipment-handoff-recovery:key-${++sequence}`;
    const first = ensureShipmentHandoffRecoveryCommand(
      undefined,
      source,
      'WAREHOUSE 已恢复',
      createKey,
    );
    const replay = ensureShipmentHandoffRecoveryCommand(
      first,
      source,
      'WAREHOUSE 已恢复',
      createKey,
    );
    const changedReason = ensureShipmentHandoffRecoveryCommand(
      first,
      source,
      '已修复 WAREHOUSE 数据',
      createKey,
    );

    expect(replay).toBe(first);
    expect(changedReason.idempotencyKey).toBe(
      'shipment-handoff-recovery:key-2',
    );
    expect(isShipmentHandoffRecoveryCommandCurrent(first, source, true)).toBe(
      true,
    );
  });

  it('accepts only the exact redrive receipt for the same shipment version', () => {
    const command = {
      expectedShipmentVersion: 11,
      idempotencyKey: 'shipment-handoff-recovery:stable-key-1',
      reason: 'WAREHOUSE 已恢复',
      shipmentId: '9223372036854775806',
    };
    const result: FdmWaimaoShipmentApi.HandoffRecoveryResult = {
      availableAt: '2026-08-31T07:30:00',
      eventId: '550e8400-e29b-41d4-a716-446655440000',
      nextRequiredAction: 'WAREHOUSE_HANDOFF_PENDING',
      outboxId: '9223372036854775808',
      outboxVersion: 8,
      recovered: true,
      shipmentId: command.shipmentId,
      shipmentVersion: 11,
      status: 'PENDING',
    };

    expect(isExpectedShipmentHandoffRecoveryResult(result, command)).toBe(true);
    expect(
      isExpectedShipmentHandoffRecoveryResult(
        { ...result, eventId: 'not-a-uuid' },
        command,
      ),
    ).toBe(false);
    expect(
      isExpectedShipmentHandoffRecoveryResult(
        { ...result, shipmentVersion: 12 },
        command,
      ),
    ).toBe(false);
  });
});
