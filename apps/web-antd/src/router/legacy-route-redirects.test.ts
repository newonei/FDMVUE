import { createMemoryHistory, createRouter } from 'vue-router';

import { describe, expect, it } from 'vitest';

import {
  LEGACY_FALLBACK_REDIRECTS,
  LEGACY_ROUTE_REDIRECTS,
  legacyFallback,
  resolveLegacyFallbackPath,
  resolveLegacyRoutePath,
} from './legacy-route-redirects';

describe('legacy dashboard route redirects', () => {
  it.each(LEGACY_ROUTE_REDIRECTS)('migrates $from to $to', ({ from, to }) => {
    expect(resolveLegacyRoutePath(from)).toBe(to);
  });

  it('keeps current routes unchanged', () => {
    expect(resolveLegacyRoutePath('/dashboard/workspace')).toBe(
      '/dashboard/workspace',
    );
  });
});

describe('regrouped menu fallback redirects', () => {
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

describe('authorized client configuration bookmarks', () => {
  it('preserves the old route before migration and only redirects to a granted new route', () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/:path(.*)*', name: 'FallbackNotFound', component: {} },
      ],
    });
    const bookmark = '/plugin-market/?tab=active%26recent#versions';
    expect(legacyFallback(router, router.resolve(bookmark))).toBeUndefined();
    const removeOld = router.addRoute({
      path: '/plugin-market',
      name: 'FdmPluginMarket',
      component: {},
    });
    expect(legacyFallback(router, router.resolve(bookmark))).toBeUndefined();
    removeOld();
    const removeNew = router.addRoute({
      path: '/client-config/plugin-market',
      name: 'FdmPluginMarket',
      component: {},
    });
    const target = legacyFallback(router, router.resolve(bookmark));
    expect(target?.replace).toBe(true);
    expect(router.resolve(target!).fullPath).toBe(
      '/client-config/plugin-market?tab=active%26recent#versions',
    );
    removeNew();
    expect(legacyFallback(router, router.resolve(bookmark))).toBeUndefined();
  });
});
