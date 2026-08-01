import { describe, expect, it } from 'vitest';

import {
  LEGACY_ROUTE_REDIRECTS,
  resolveLegacyRoutePath,
} from './legacy-route-redirects';

describe('legacy dashboard route redirects', () => {
  it.each(LEGACY_ROUTE_REDIRECTS)('migrates $from to $to', ({ from, to }) => {
    expect(resolveLegacyRoutePath(from)).toBe(to);
  });

  it('keeps current routes unchanged', () => {
    expect(resolveLegacyRoutePath('/fdmcreative/workbench')).toBe(
      '/fdmcreative/workbench',
    );
  });
});
