import { describe, expect, it } from 'vitest';

import {
  canEditAllocatedV2,
  canPostAllocatedV2,
  canReverseAllocatedV2,
  isAllocatedV2,
  validateAllocatedV2ReverseReason,
} from './allocated-v2-policy';

describe('erp allocated payment V2 UI policy', () => {
  it('never routes legacy rows into V2 actions', () => {
    const legacy = {
      postingVersion: 0,
      sourceMode: 'LEGACY',
      status: 10,
      version: 0,
    };
    expect(isAllocatedV2(legacy)).toBe(false);
    expect(canEditAllocatedV2(legacy)).toBe(false);
    expect(canPostAllocatedV2(legacy)).toBe(false);
    expect(canReverseAllocatedV2(legacy)).toBe(false);
  });

  it('allows draft/reversed heads to edit and post only on an even posting version', () => {
    expect(
      canEditAllocatedV2({
        postingVersion: 0,
        sourceMode: 'ALLOCATED_V2',
        status: 10,
        version: 0,
      }),
    ).toBe(true);
    expect(
      canPostAllocatedV2({
        postingVersion: 2,
        sourceMode: 'ALLOCATED_V2',
        status: 10,
        version: 7,
      }),
    ).toBe(true);
    expect(
      canPostAllocatedV2({
        postingVersion: 1,
        sourceMode: 'ALLOCATED_V2',
        status: 10,
        version: 7,
      }),
    ).toBe(false);
  });

  it('allows reverse only for an approved odd posting version', () => {
    expect(
      canReverseAllocatedV2({
        postingVersion: 1,
        sourceMode: 'ALLOCATED_V2',
        status: 20,
        version: 1,
      }),
    ).toBe(true);
    expect(
      canReverseAllocatedV2({
        postingVersion: 2,
        sourceMode: 'ALLOCATED_V2',
        status: 20,
        version: 2,
      }),
    ).toBe(false);
  });

  it('requires a canonical auditable reverse reason', () => {
    expect(validateAllocatedV2ReverseReason('  银行退票  ')).toEqual({
      reason: '银行退票',
      valid: true,
    });
    expect(validateAllocatedV2ReverseReason('   ')).toMatchObject({
      valid: false,
    });
    expect(validateAllocatedV2ReverseReason('a'.repeat(501))).toMatchObject({
      valid: false,
    });
    expect(validateAllocatedV2ReverseReason('第一行\n第二行')).toMatchObject({
      valid: false,
    });
  });
});
