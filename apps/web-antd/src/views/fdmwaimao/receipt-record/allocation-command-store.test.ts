import { beforeEach, describe, expect, it } from 'vitest';

import {
  clearActiveAllocationGeneration,
  clearAllocationCommand,
  getOrCreateAllocationCommand,
  loadActiveAllocationGeneration,
  saveActiveAllocationGeneration,
} from './allocation-command-store';

describe('receipt allocation uncertain-retry command store', () => {
  beforeEach(() => window.sessionStorage.clear());

  it('reuses the key for the same identity and semantic fingerprint', async () => {
    const first = await getOrCreateAllocationCommand(
      'apply:9007199254740993:2',
      '{"reason":"confirmed"}',
      'allocation-apply',
    );
    const replay = await getOrCreateAllocationCommand(
      'apply:9007199254740993:2',
      '{"reason":"confirmed"}',
      'allocation-apply',
    );
    expect(replay).toBe(first);
  });

  it('rotates on changed facts and clears only after confirmed success', async () => {
    const first = await getOrCreateAllocationCommand(
      'draft:9007199254740993:3',
      '{"amount":"10"}',
      'allocation-draft',
    );
    const changed = await getOrCreateAllocationCommand(
      'draft:9007199254740993:3',
      '{"amount":"11"}',
      'allocation-draft',
    );
    expect(changed).not.toBe(first);

    clearAllocationCommand('draft:9007199254740993:3');
    const afterSuccess = await getOrCreateAllocationCommand(
      'draft:9007199254740993:3',
      '{"amount":"11"}',
      'allocation-draft',
    );
    expect(afterSuccess).not.toBe(changed);
  });

  it('stores no raw business fingerprint in session storage', async () => {
    await getOrCreateAllocationCommand(
      'materialize:9007199254740993:8',
      'customer=ACME;amount=1250.00;instruction=oldest invoice',
      'allocation-materialize',
    );
    const stored = Object.values(window.sessionStorage).join('');
    expect(stored).not.toContain('ACME');
    expect(stored).not.toContain('1250.00');
    expect(stored).not.toContain('oldest invoice');
  });

  it('persists only active run identity and rejects corrupt recovery state', () => {
    saveActiveAllocationGeneration({
      runId: '9007199254740993',
      runVersion: '8',
      sourceId: '9007199254740994',
      sourceVersion: 3,
    });
    expect(loadActiveAllocationGeneration()).toEqual({
      runId: '9007199254740993',
      runVersion: '8',
      sourceId: '9007199254740994',
      sourceVersion: 3,
    });
    const stored = Object.values(window.sessionStorage).join('');
    expect(stored).not.toContain('amount');
    expect(stored).not.toContain('customer');

    clearActiveAllocationGeneration();
    expect(loadActiveAllocationGeneration()).toBeUndefined();

    window.sessionStorage.setItem(
      'fdm:waimao:receipt-allocation:active-generation:v1',
      '{"runId":"not-an-id"}',
    );
    expect(loadActiveAllocationGeneration()).toBeUndefined();
  });
});
