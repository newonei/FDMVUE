import type { FdmCreativeApi } from '#/api/fdmcreative';

import { describe, expect, it } from 'vitest';

import {
  buildSwapSortRequest,
  isCancelableDramaShotTask,
  isRetryableDramaShotTask,
  taskResultVersions,
} from './drama-shot-utils';

describe('drama shot helpers', () => {
  it('keeps P3 string node-run ids aligned with P5B numeric task ids', () => {
    const task = {
      nodeRunId: 902,
      status: 'SUCCEEDED',
    } as FdmCreativeApi.DramaShotTask;
    const versions = [
      { assets: [], nodeRunId: '901', selectionVersion: 1 },
      { assets: [], nodeRunId: '902', selectionVersion: 1 },
    ] as FdmCreativeApi.NodeResultVersion[];

    expect(taskResultVersions(task, versions)).toEqual([versions[1]]);
  });

  it('builds a two-row CAS sort swap without deriving ordering from card coordinates', () => {
    const first = {
      id: 11,
      sortOrder: 4,
      version: 7,
    } as FdmCreativeApi.DramaShot;
    const second = {
      id: 12,
      sortOrder: 5,
      version: 8,
    } as FdmCreativeApi.DramaShot;

    expect(buildSwapSortRequest(9, first, second)).toEqual({
      projectId: 9,
      items: [
        { expectedVersion: 7, shotId: 11, sortOrder: 5 },
        { expectedVersion: 8, shotId: 12, sortOrder: 4 },
      ],
    });
  });

  it('keeps cancel and retry states disjoint', () => {
    expect(isCancelableDramaShotTask('RUNNING')).toBe(true);
    expect(isCancelableDramaShotTask('FAILED')).toBe(false);
    expect(isRetryableDramaShotTask('FAILED')).toBe(true);
    expect(isRetryableDramaShotTask('RUNNING')).toBe(false);
  });
});
