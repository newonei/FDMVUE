import type { FdmCreativeApi } from '#/api/fdmcreative';

import { describe, expect, it } from 'vitest';

import {
  aggregateLoopNodeRuns,
  canvasNodeIdForRun,
  parseLoopRunNodeId,
} from './loop-run';

function run(
  id: number,
  nodeId: string,
  status: FdmCreativeApi.NodeRunStatus,
): FdmCreativeApi.NodeRun {
  return {
    attemptNo: 1,
    id,
    nodeId,
    nodeType: 'image-generate',
    status,
  };
}

describe('loop execution node ids', () => {
  it('maps expanded iteration ids back to the canvas node', () => {
    expect(parseLoopRunNodeId('image-a::loop::3')).toEqual({
      baseNodeId: 'image-a',
      iteration: 3,
    });
    expect(canvasNodeIdForRun('ordinary-node')).toBe('ordinary-node');
  });

  it('aggregates iteration status and keeps the latest successful output', () => {
    const first = {
      ...run(1, 'image-a::loop::1', 'SUCCEEDED'),
      outputJson: '{"round":1}',
    };
    const second = run(2, 'image-a::loop::2', 'WAITING_AI');
    expect(aggregateLoopNodeRuns([first, second])).toEqual([
      expect.objectContaining({
        id: 2,
        nodeId: 'image-a',
        outputJson: '{"round":1}',
        status: 'WAITING_AI',
      }),
    ]);
  });

  it('surfaces a failed iteration on the original canvas node', () => {
    expect(
      aggregateLoopNodeRuns([
        run(1, 'image-a::loop::1', 'SUCCEEDED'),
        { ...run(2, 'image-a::loop::2', 'FAILED'), errorMessage: 'quota' },
      ])[0],
    ).toEqual(
      expect.objectContaining({
        errorMessage: 'quota',
        id: 2,
        nodeId: 'image-a',
        status: 'FAILED',
      }),
    );
  });
});
