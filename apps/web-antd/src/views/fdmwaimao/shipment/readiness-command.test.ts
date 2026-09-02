import { describe, expect, it, vi } from 'vitest';

import {
  ensureShipmentReadinessCommand,
  isSameShipmentReadinessCommand,
} from './readiness-command';

const startSeed = {
  action: 'start' as const,
  expectedVersion: 7,
  instruction: '优先整单发货',
  modelId: '8',
  shipmentId: '1001',
  warehouseId: '20',
};

describe('shipment readiness command identity', () => {
  it('reuses the exact key after an uncertain start timeout', () => {
    const createKey = vi.fn(() => 'shipment-readiness:start:stable');
    const first = ensureShipmentReadinessCommand(
      undefined,
      startSeed,
      createKey,
    );
    const replay = ensureShipmentReadinessCommand(
      first,
      { ...startSeed },
      createKey,
    );

    expect(replay).toBe(first);
    expect(replay.idempotencyKey).toBe('shipment-readiness:start:stable');
    expect(createKey).toHaveBeenCalledTimes(1);
  });

  it.each([
    { expectedVersion: 8 },
    { instruction: '允许拆批' },
    { modelId: '9' },
    { shipmentId: '1002' },
    { warehouseId: '21' },
  ])('rotates the key when a start fact changes: %o', (change) => {
    let sequence = 0;
    const createKey = () => `key-${++sequence}`;
    const first = ensureShipmentReadinessCommand(
      undefined,
      startSeed,
      createKey,
    );
    const next = ensureShipmentReadinessCommand(
      first,
      { ...startSeed, ...change },
      createKey,
    );

    expect(next.idempotencyKey).toBe('key-2');
    expect(isSameShipmentReadinessCommand(first, next)).toBe(false);
  });

  it('binds regenerate to the exact generation run and run version', () => {
    const first = ensureShipmentReadinessCommand(
      undefined,
      {
        ...startSeed,
        action: 'regenerate',
        expectedVersion: '3',
        generationRunId: '5001',
      },
      () => 'regenerate-key-1',
    );
    const next = ensureShipmentReadinessCommand(
      first,
      {
        ...startSeed,
        action: 'regenerate',
        expectedVersion: '4',
        generationRunId: '5001',
      },
      () => 'regenerate-key-2',
    );

    expect(next.idempotencyKey).toBe('regenerate-key-2');
  });
});
