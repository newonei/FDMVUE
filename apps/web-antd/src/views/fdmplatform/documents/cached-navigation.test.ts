/* eslint-disable vue/one-component-per-file -- Multiple cached route fixtures are required to exercise navigation between pages. */
import {
  createApp,
  defineComponent,
  h,
  KeepAlive,
  nextTick,
  ref,
  Teleport,
  watch,
} from 'vue';
import {
  createMemoryHistory,
  createRouter,
  RouterView,
  useRoute,
} from 'vue-router';

import { describe, expect, it, vi } from 'vitest';

import RelatedLink from './RelatedLink.vue';
import { useRouteOwner } from './useRouteOwner';
function page(name: string) {
  return defineComponent({
    name,
    setup() {
      const route = useRoute();
      const active = useRouteOwner();
      const open = ref(false);
      watch(
        () => [active.value, route.query.contractId, route.query.documentId],
        () => {
          open.value =
            active.value && typeof route.query.contractId === 'string';
        },
        { immediate: true, flush: 'post' },
      );
      return () =>
        h('section', {}, [
          h('span', name),
          h(
            Teleport,
            { to: 'body' },
            open.value && active.value
              ? [
                  h('div', { 'data-test-drawer': name }, [
                    h(
                      RelatedLink,
                      {
                        target: { type: 'contract', contractId: 'contract-a' },
                      },
                      () => 'HT-001 · 合同甲',
                    ),
                  ]),
                ]
              : [],
          ),
        ]);
    },
  });
}
async function setup() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/fdmwaimao/platform-contracts', component: page('Contracts') },
      { path: '/fdmwaimao/platform-requests', component: page('Requests') },
    ],
  });
  await router.push('/fdmwaimao/platform-contracts?contractId=contract-a');
  await router.isReady();
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp({
    render: () =>
      h(
        RouterView,
        {},
        {
          default: ({
            Component,
            route,
          }: {
            Component: object;
            route: { fullPath: string };
          }) => h(KeepAlive, {}, () => h(Component, { key: route.fullPath })),
        },
      ),
  });
  app.use(router);
  app.mount(host);
  await nextTick();
  return {
    router,
    dispose() {
      app.unmount();
      host.remove();
    },
  };
}
describe('related links with real router and cached full-path pages', () => {
  it('opens a cached contract from the actual document header link and closes the old teleported drawer', async () => {
    const view = await setup();
    await view.router.push(
      '/fdmwaimao/platform-requests?contractId=contract-a&documentId=request-a',
    );
    await nextTick();
    expect(document.querySelectorAll('[data-test-drawer]')).toHaveLength(1);
    expect(
      document.querySelector<HTMLElement>('[data-test-drawer]')?.dataset
        .testDrawer,
    ).toBe('Requests');
    const link = document.querySelector<HTMLAnchorElement>(
      '[data-test-drawer] a',
    )!;
    expect(link.getAttribute('href')).toBe(
      '/fdmwaimao/platform-contracts?contractId=contract-a',
    );
    link.click();
    await vi.waitFor(() =>
      expect(view.router.currentRoute.value.path).toBe(
        '/fdmwaimao/platform-contracts',
      ),
    );
    await nextTick();
    expect(document.querySelectorAll('[data-test-drawer]')).toHaveLength(1);
    expect(
      document.querySelector<HTMLElement>('[data-test-drawer]')?.dataset
        .testDrawer,
    ).toBe('Contracts');
    view.dispose();
  });
  it('does not reopen other cached query instances and restores the selected record on back', async () => {
    const view = await setup();
    await view.router.push(
      '/fdmwaimao/platform-requests?contractId=contract-a&documentId=request-a',
    );
    await view.router.push(
      '/fdmwaimao/platform-requests?contractId=contract-a&documentId=request-b',
    );
    await nextTick();
    expect(document.querySelectorAll('[data-test-drawer]')).toHaveLength(1);
    view.router.back();
    await vi.waitFor(() =>
      expect(view.router.currentRoute.value.query.documentId).toBe('request-a'),
    );
    await nextTick();
    expect(document.querySelectorAll('[data-test-drawer]')).toHaveLength(1);
    view.dispose();
  });
});
