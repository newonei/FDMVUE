export type ReceiptWorkspaceKey = 'consumption' | 'receipt';

export function normalizeReceiptWorkspace(
  workspace: unknown,
  legacyType: unknown,
): ReceiptWorkspaceKey {
  if (workspace === 'consumption' || workspace === 'receipt') {
    return workspace;
  }
  // Bank receipt and allocation used to be workspaces on this route. Keep old
  // bookmarks safe, but always land them on the canonical direct receipt list.
  if (workspace === 'allocation' || workspace === 'bank') return 'receipt';
  if (legacyType === 'consumption' || legacyType === 'receipt') {
    return legacyType;
  }
  return 'receipt';
}

export function selectAuthorizedReceiptWorkspace(
  requested: ReceiptWorkspaceKey,
  authorized: readonly ReceiptWorkspaceKey[],
): ReceiptWorkspaceKey {
  return authorized.includes(requested)
    ? requested
    : (authorized[0] ?? requested);
}

export function receiptWorkspaceRouteQuery(target: ReceiptWorkspaceKey) {
  return {
    type: target === 'receipt' || target === 'consumption' ? target : undefined,
    workspace: target,
  };
}
