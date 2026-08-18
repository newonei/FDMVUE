import type { FdmCreativeApi } from '#/api/fdmcreative';

import { describe, expect, it } from 'vitest';

import {
  canApplyCanvasPatch,
  groupCanvasPatchOperations,
  patchHasDestructiveOperation,
} from './canvas-patch-preview-state';

describe('canvasPatch preview state', () => {
  const patch = {
    baseDraftVersion: 8,
    operations: [
      { operationId: 'add', type: 'ADD_NODE' },
      { operationId: 'config', type: 'UPDATE_NODE_CONFIG' },
      { operationId: 'rename', type: 'RENAME_NODE' },
      { operationId: 'move', type: 'MOVE_NODE' },
      { operationId: 'connect', type: 'CONNECT' },
      { operationId: 'disconnect', type: 'DISCONNECT' },
      { operationId: 'delete', type: 'DELETE_NODE' },
    ],
    schemaVersion: 1,
  } satisfies FdmCreativeApi.CanvasPatch;

  it('groups every operation for a readable review and flags destructive ones', () => {
    expect(groupCanvasPatchOperations(patch)).toEqual([
      expect.objectContaining({ key: 'add', label: '新增节点' }),
      expect.objectContaining({ key: 'update', operations: expect.any(Array) }),
      expect.objectContaining({ key: 'connect', label: '新增连线' }),
      expect.objectContaining({ key: 'disconnect', label: '断开连线' }),
      expect.objectContaining({ key: 'delete', label: '删除节点' }),
    ]);
    expect(patchHasDestructiveOperation(patch)).toBe(true);
  });

  it('does not offer an apply action after an optimistic client-side version conflict', () => {
    const run = {
      attemptNo: 1,
      baseDraftVersion: 8,
      conversationId: '100',
      id: '200',
      patch,
      projectId: '300',
      requestMessageId: '400',
      status: 'READY' as const,
    };
    expect(canApplyCanvasPatch(run, 8, true)).toBe(true);
    expect(canApplyCanvasPatch(run, 9, true)).toBe(false);
    expect(canApplyCanvasPatch(run, 8, false)).toBe(false);
  });
});
