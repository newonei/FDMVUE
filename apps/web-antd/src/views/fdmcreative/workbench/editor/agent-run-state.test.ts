import { describe, expect, it } from 'vitest';

import {
  canExecuteAgent,
  canMutateAgent,
  isAgentRunActive,
  patchHasDestructiveOperation,
  suggestedExecutionRequest,
} from './agent-run-state';

describe('agent run view state', () => {
  it('separates durable planning states from terminal states', () => {
    expect(isAgentRunActive('PLANNING')).toBe(true);
    expect(isAgentRunActive('CANCEL_REQUESTED')).toBe(true);
    expect(isAgentRunActive('READY')).toBe(false);
    expect(isAgentRunActive('FAILED')).toBe(false);
  });

  it('keeps edit and run rights distinct in the workbench UI', () => {
    expect(canMutateAgent('OWNER')).toBe(true);
    expect(canMutateAgent('EDITOR')).toBe(true);
    expect(canMutateAgent('RUNNER')).toBe(false);
    expect(canMutateAgent('VIEWER')).toBe(false);
    expect(canExecuteAgent('RUNNER')).toBe(true);
    expect(canExecuteAgent('VIEWER')).toBe(false);
  });

  it('requires confirmation affordance for destructive proposals and preserves suggested scope', () => {
    expect(
      patchHasDestructiveOperation({
        baseDraftVersion: 3,
        operations: [
          { operationId: 'remove-edge', type: 'DISCONNECT' },
          { operationId: 'move', type: 'MOVE_NODE' },
        ],
        schemaVersion: 1,
      }),
    ).toBe(true);
    expect(
      suggestedExecutionRequest({
        attemptNo: 1,
        baseDraftVersion: 3,
        conversationId: '100',
        id: '200',
        projectId: '300',
        requestMessageId: '400',
        status: 'APPLIED',
        suggestedRunScope: 'NODE',
        suggestedStartNodeId: 'image-generate-1',
      }),
    ).toEqual({ scope: 'NODE', startNodeId: 'image-generate-1' });
    expect(
      suggestedExecutionRequest({
        attemptNo: 1,
        baseDraftVersion: 3,
        conversationId: '100',
        id: '200',
        projectId: '300',
        requestMessageId: '400',
        status: 'APPLIED',
        suggestedRunScope: 'NODE',
      }),
    ).toBeUndefined();
  });
});
