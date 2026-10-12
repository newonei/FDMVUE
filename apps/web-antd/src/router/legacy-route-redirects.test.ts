import { describe, expect, it } from 'vitest';

import {
  LEGACY_FALLBACK_REDIRECTS,
  LEGACY_ROUTE_REDIRECTS,
  resolveLegacyFallbackPath,
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

describe('factory menu fallback redirects', () => {
  it.each(LEGACY_FALLBACK_REDIRECTS)(
    'sends $from to $to when the old page is gone',
    ({ from, to }) => {
      expect(resolveLegacyFallbackPath(from)).toBe(to);
    },
  );

  it('leaves other paths alone', () => {
    expect(resolveLegacyFallbackPath('/gongchang/dashboard')).toBeUndefined();
    expect(resolveLegacyRoutePath('/gongchang/stage-stock')).toBe(
      '/gongchang/stage-stock',
    );
  });
});
