import type { FdmCreativeApi } from '#/api/fdmcreative';

export { patchHasDestructiveOperation } from './agent-run-state';

export type CanvasPatchPreviewGroupKey =
  | 'add'
  | 'connect'
  | 'delete'
  | 'disconnect'
  | 'update';

export interface CanvasPatchPreviewGroup {
  key: CanvasPatchPreviewGroupKey;
  label: string;
  operations: FdmCreativeApi.CanvasPatchOperation[];
}

export function canvasPatchOperationGroup(
  type: FdmCreativeApi.CanvasPatchOperationType,
): CanvasPatchPreviewGroupKey {
  if (type === 'ADD_NODE') return 'add';
  if (type === 'CONNECT') return 'connect';
  if (type === 'DISCONNECT') return 'disconnect';
  if (type === 'DELETE_NODE') return 'delete';
  return 'update';
}

export function groupCanvasPatchOperations(
  patch?: FdmCreativeApi.CanvasPatch,
): CanvasPatchPreviewGroup[] {
  const grouped = new Map<
    CanvasPatchPreviewGroupKey,
    FdmCreativeApi.CanvasPatchOperation[]
  >();
  for (const operation of patch?.operations ?? []) {
    const key = canvasPatchOperationGroup(operation.type);
    const values = grouped.get(key) ?? [];
    values.push(operation);
    grouped.set(key, values);
  }
  return [...grouped.entries()].map(([key, operations]) => ({
    key,
    label: {
      add: '新增节点',
      connect: '新增连线',
      delete: '删除节点',
      disconnect: '断开连线',
      update: '修改节点',
    }[key],
    operations,
  }));
}

/** A stale preview cannot be applied in the UI; the backend still makes the authoritative CAS decision. */
export function canApplyCanvasPatch(
  run: FdmCreativeApi.AgentRun | undefined,
  currentDraftVersion: number,
  canEdit: boolean,
) {
  return Boolean(
    canEdit &&
      run?.status === 'READY' &&
      run.patch &&
      run.patch.baseDraftVersion === currentDraftVersion,
  );
}
