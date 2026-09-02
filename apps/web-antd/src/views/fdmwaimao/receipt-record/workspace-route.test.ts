import { describe, expect, it } from 'vitest';

import { resolveFdmWaimaoAiSurface } from '#/views/fdm-trade-shared/ai-assistant/surfaces';

import {
  normalizeReceiptWorkspace,
  receiptWorkspaceRouteQuery,
  selectAuthorizedReceiptWorkspace,
} from './workspace-route';

describe('receipt workspace route authorization fallback', () => {
  it.each([
    ['receipt', 'receipt-record', 'fdmwaimao:receipt-record:query'],
    ['consumption', 'consumption-record', 'fdmwaimao:consumption-record:query'],
  ] as const)(
    'syncs a %s-only user from the direct receipt route to the exact AI page key',
    (authorizedWorkspace, pageKey, queryPermission) => {
      const requested = normalizeReceiptWorkspace(undefined, undefined);
      const selected = selectAuthorizedReceiptWorkspace(requested, [
        authorizedWorkspace,
      ]);
      const resolved = resolveFdmWaimaoAiSurface(
        '/fdmwaimao/receipt-record',
        receiptWorkspaceRouteQuery(selected),
      );

      expect(requested).toBe('receipt');
      expect(selected).toBe(authorizedWorkspace);
      expect(resolved).toMatchObject({ pageKey, queryPermission });
    },
  );

  it.each(['bank', 'allocation'])(
    'maps the removed %s workspace to direct receipt',
    (workspace) => {
      expect(normalizeReceiptWorkspace(workspace, undefined)).toBe('receipt');
    },
  );

  it('keeps consumption as the only separate non-cash workspace', () => {
    expect(normalizeReceiptWorkspace(undefined, 'consumption')).toBe(
      'consumption',
    );
    expect(receiptWorkspaceRouteQuery('receipt')).toEqual({
      type: 'receipt',
      workspace: 'receipt',
    });
  });
});
