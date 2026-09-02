import type { FdmWarehouseOutboundOrderApi } from '#/api/fdmwarehouse/outbound-order';

import { describe, expect, it } from 'vitest';

import {
  canCompleteReservationAttempt,
  clearReservationCompletionCommand,
  ensureReservationCompletionCommand,
  isExpectedReservationCompletionReceipt,
  loadReservationCompletionCommand,
  normalizeLongId,
  saveReservationCompletionCommand,
} from './reservation-completion-actions';

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    removeItem: (key: string) => values.delete(key),
    setItem: (key: string, value: string) => values.set(key, value),
  };
}

function order(
  overrides: Partial<FdmWarehouseOutboundOrderApi.OutboundOrder> = {},
): FdmWarehouseOutboundOrderApi.OutboundOrder {
  return {
    consumedAt: null,
    outboundOrderId: '1024',
    reservationAttemptStatus: 'HANDED_OFF',
    reservationBacked: true,
    reservationVersionAtHandoff: 3,
    status: 0,
    ...overrides,
  };
}

describe('fDM warehouse reservation-backed completion action policy', () => {
  it('offers completion only for a frozen HANDED_OFF PREPARE identity', () => {
    expect(canCompleteReservationAttempt(order())).toBe(true);
    expect(
      canCompleteReservationAttempt(order({ reservationBacked: false })),
    ).toBe(false);
    expect(
      canCompleteReservationAttempt(
        order({ reservationAttemptStatus: 'CONSUMED' }),
      ),
    ).toBe(false);
    expect(
      canCompleteReservationAttempt(order({ consumedAt: '2026-09-01' })),
    ).toBe(false);
    expect(
      canCompleteReservationAttempt(order({ reservationVersionAtHandoff: 0 })),
    ).toBe(false);
  });

  it('reuses a stable idempotency key for uncertain replay', () => {
    let sequence = 0;
    const source = order();
    const first = ensureReservationCompletionCommand(
      undefined,
      source,
      () => `fdmwarehouse-reservation-completion:key-${++sequence}`,
    );
    const replay = ensureReservationCompletionCommand(
      first,
      source,
      () => `fdmwarehouse-reservation-completion:key-${++sequence}`,
    );
    const nextAttempt = ensureReservationCompletionCommand(
      first,
      order({ reservationVersionAtHandoff: 4 }),
      () => `fdmwarehouse-reservation-completion:key-${++sequence}`,
    );

    expect(replay).toBe(first);
    expect(nextAttempt.idempotencyKey).toBe(
      'fdmwarehouse-reservation-completion:key-2',
    );
    expect(first.outboundOrderId).toBe('1024');
  });

  it('accepts serialized Long strings and rejects lossy browser numbers', () => {
    const longId = '9223372036854775807';
    expect(
      canCompleteReservationAttempt(order({ outboundOrderId: longId })),
    ).toBe(true);
    expect(normalizeLongId(longId)).toBe(longId);
    expect(normalizeLongId(1024)).toBe('1024');
    expect(normalizeLongId(Number(longId))).toBeUndefined();
    expect(
      canCompleteReservationAttempt(
        order({ outboundOrderId: Number(longId) as unknown as string }),
      ),
    ).toBe(false);
  });

  it('restores the exact command after close/reopen and clears it only when confirmed', () => {
    const storage = memoryStorage();
    const source = order({ outboundOrderId: '9223372036854775807' });
    const command = ensureReservationCompletionCommand(
      undefined,
      source,
      () => 'fdmwarehouse-reservation-completion:stable-reopen-key',
    );

    saveReservationCompletionCommand(storage, command);
    expect(loadReservationCompletionCommand(storage, source)).toEqual(command);
    expect(
      loadReservationCompletionCommand(
        storage,
        order({
          outboundOrderId: source.outboundOrderId,
          reservationVersionAtHandoff: 4,
        }),
      ),
    ).toBeUndefined();

    saveReservationCompletionCommand(storage, command);
    clearReservationCompletionCommand(storage, source);
    expect(loadReservationCompletionCommand(storage, source)).toBeUndefined();
  });

  it('accepts only the exact typed completion summary', () => {
    const command = {
      expectedReservationVersion: 3,
      idempotencyKey: 'fdmwarehouse-reservation-completion:stable-key',
      outboundOrderId: '1024',
    };
    const receipt: FdmWarehouseOutboundOrderApi.CompleteResponse = {
      attemptNo: 1,
      consumedAt: '2026-09-01T01:02:03Z',
      inventoryCount: 2,
      lineCount: 3,
      newlyCreated: true,
      orderCount: 2,
      reservationId: '9223372036854775807',
      resultVersion: 4,
    };

    expect(isExpectedReservationCompletionReceipt(receipt, command)).toBe(true);
    expect(
      isExpectedReservationCompletionReceipt(
        { ...receipt, resultVersion: 5 },
        command,
      ),
    ).toBe(false);
    expect(
      isExpectedReservationCompletionReceipt(
        { ...receipt, inventoryCount: 0 },
        command,
      ),
    ).toBe(false);
  });
});
