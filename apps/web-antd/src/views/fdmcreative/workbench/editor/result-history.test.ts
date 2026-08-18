import type { FdmCreativeApi } from '#/api/fdmcreative';

import { describe, expect, it } from 'vitest';

import {
  defaultResultHistorySelection,
  resultBranchBlockedReason,
} from './result-history';

function version(
  nodeRunId: string,
  assets: FdmCreativeApi.NodeResultAsset[],
  selectionStatus: 'CURRENT' | 'STALE' = 'CURRENT',
): FdmCreativeApi.NodeResultVersion {
  return {
    assets,
    nodeRunId,
    selectionStatus,
    selectionVersion: 1,
  };
}

function asset(
  id: string,
  options: Partial<FdmCreativeApi.NodeResultAsset> = {},
): FdmCreativeApi.NodeResultAsset {
  return {
    adopted: false,
    availability: 'ACTIVE',
    deleteEligible: false,
    id,
    kind: 'IMAGE',
    url: `private://${id}.png`,
    ...options,
  };
}

describe('result history selection', () => {
  it('uses the adopted second output rather than only the first output', () => {
    const selected = defaultResultHistorySelection([
      version('100', [asset('101'), asset('102', { adopted: true })]),
    ]);

    expect(selected?.asset.id).toBe('102');
    expect(selected?.version.nodeRunId).toBe('100');
  });

  it('does not silently use a stale adopted output and falls back to newest readable output', () => {
    const selected = defaultResultHistorySelection([
      version('newest', [asset('201')]),
      version('stale-adoption', [asset('202', { adopted: true })], 'STALE'),
    ]);

    expect(selected?.asset.id).toBe('201');
  });

  it('skips expired or cleaned assets instead of offering a broken branch', () => {
    const selected = defaultResultHistorySelection([
      version('expired', [asset('301', { availability: 'EXPIRED', url: undefined })]),
      version('missing', [asset('302', { availability: 'MISSING', url: undefined })]),
    ]);

    expect(selected).toBeUndefined();
  });

  it('stops branch creation during an autosave conflict', () => {
    expect(resultBranchBlockedReason({ autosaveConflict: true, canEdit: true })).toContain('保存冲突');
    expect(resultBranchBlockedReason({ autosaveConflict: false, canEdit: false })).toContain('只读');
    expect(resultBranchBlockedReason({ autosaveConflict: false, canEdit: true })).toBeUndefined();
  });
});
