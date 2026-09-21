import type { FdmCreativeApi } from '#/api/fdmcreative';

import { describe, expect, it } from 'vitest';

import {
  canRetryNode,
  EXECUTION_STATUS_LABEL,
  taskProgress,
  workflowRunNodeIds,
} from './execution-feedback';

function node(
  id: number,
  status: FdmCreativeApi.NodeRunStatus,
): FdmCreativeApi.NodeRun {
  return { id, nodeId: `node-${id}`, status };
}

function execution(
  overrides: Partial<FdmCreativeApi.ExecutionDetail> = {},
): FdmCreativeApi.ExecutionDetail {
  return { id: 80, projectId: 33, status: 'RUNNING', ...overrides };
}

describe('execution completion and retry rules', () => {
  it('counts skipped and canceled nodes as finished while preserving a failed outcome', () => {
    const task = execution({
      status: 'FAILED',
      totalNodeCount: 4,
      nodeRuns: [
        node(1, 'SUCCEEDED'),
        node(2, 'FAILED'),
        node(3, 'SKIPPED'),
        node(4, 'CANCELED'),
      ],
    });
    expect(taskProgress(task)).toEqual({
      completed: 4,
      total: 4,
      percent: 100,
    });
    expect(EXECUTION_STATUS_LABEL[task.status]).toBe('失败');
    expect(EXECUTION_STATUS_LABEL.PARTIAL_SUCCESS).toBe('部分成功');
  });

  it('does not count waiting or cancellation requests as completed', () => {
    const task = execution({
      nodeRuns: [
        node(1, 'SUCCEEDED'),
        node(2, 'CANCEL_REQUESTED'),
        node(3, 'WAITING_AI'),
        node(4, 'BLOCKED'),
      ],
    });
    expect(taskProgress(task)).toEqual({ completed: 1, total: 4, percent: 25 });
  });

  it('handles empty and summary-only task records without invalid percentages', () => {
    expect(taskProgress(execution())).toEqual({
      completed: 0,
      total: 0,
      percent: 0,
    });
    expect(
      taskProgress(
        execution({
          totalNodeCount: 5,
          succeededNodeCount: 2,
          failedNodeCount: 1,
        }),
      ),
    ).toEqual({ completed: 3, total: 5, percent: 60 });
  });

  it.each(['CANCEL_REQUESTED', 'CANCELED'] as const)(
    'never retries a failed node when its execution is %s',
    (status) => {
      const failed = node(10, 'FAILED');
      expect(
        canRetryNode(execution({ status, nodeRuns: [failed] }), failed),
      ).toBe(false);
    },
  );

  it.each([
    'PENDING',
    'RUNNING',
    'WAITING_AI',
    'SUCCEEDED',
    'CANCELED',
    'SKIPPED',
    'STALE',
  ] as const)('does not retry a node in %s status', (status) => {
    const candidate = node(10, status);
    expect(canRetryNode(execution({ nodeRuns: [candidate] }), candidate)).toBe(
      false,
    );
  });

  it('rejects absent, unrelated, and stale failed-node selections', () => {
    const failed = node(10, 'FAILED');
    expect(canRetryNode(undefined, failed)).toBe(false);
    expect(
      canRetryNode(execution({ nodeRuns: [node(11, 'FAILED')] }), failed),
    ).toBe(false);
    expect(
      canRetryNode(execution({ nodeRuns: [node(10, 'SUCCEEDED')] }), failed),
    ).toBe(false);
  });

  it.each(['RUNNING', 'FAILED', 'PARTIAL_SUCCESS'] as const)(
    'allows retrying the failed node belonging to a %s task',
    (status) => {
      const failed = node(10, 'FAILED');
      expect(
        canRetryNode(execution({ status, nodeRuns: [failed] }), failed),
      ).toBe(true);
    },
  );
});

describe('workbench run scope', () => {
  const definition: FdmCreativeApi.WorkflowDefinition = {
    schemaVersion: 1,
    viewport: { x: 0, y: 0, zoom: 1 },
    nodes: ['input', 'generate', 'edit', 'output', 'unrelated'].map((id) => ({
      id,
      type: 'image-generate',
      name: id,
      config: {},
      ports: [],
      x: 0,
      y: 0,
      width: 100,
      height: 100,
    })),
    edges: [
      ['input', 'generate'],
      ['generate', 'edit'],
      ['edit', 'output'],
    ].map(([sourceNodeId, targetNodeId], index) => ({
      id: `edge-${index}`,
      sourceNodeId: sourceNodeId!,
      targetNodeId: targetNodeId!,
      sourcePortId: 'asset',
      targetPortId: 'reference',
    })),
  };

  it('validates/defaults only the single requested node, without unrelated models', () => {
    expect([...workflowRunNodeIds(definition, 'NODE', 'edit')]).toEqual([
      'edit',
    ]);
  });

  it('includes descendants but never reruns ancestors for a downstream request', () => {
    expect([...workflowRunNodeIds(definition, 'DOWNSTREAM', 'edit')]).toEqual([
      'edit',
      'output',
    ]);
  });

  it('includes the whole graph on every full request regardless of prior results', () => {
    expect([...workflowRunNodeIds(definition, 'FULL')]).toEqual([
      'input',
      'generate',
      'edit',
      'output',
      'unrelated',
    ]);
    expect(workflowRunNodeIds(definition, 'NODE', 'deleted').size).toBe(0);
  });
});
