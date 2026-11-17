/* eslint-disable vue/one-component-per-file -- Route fixtures represent the three cached department pages. */
import {
  createApp,
  defineComponent,
  h,
  KeepAlive,
  nextTick,
  ref,
  watch,
} from 'vue';
import { createMemoryHistory, createRouter, RouterView } from 'vue-router';

import { describe, expect, it } from 'vitest';

import { useOwnedRoute } from './useOwnedRoute';

describe('cached department route context', () => {
  it('keeps each menu query and local edits while supporting new links to the same page', async () => {
    const contexts: Record<string, ReturnType<typeof useOwnedRoute>> = {};
    const notifications: Record<string, number> = {};
    const page = (name: string) =>
      defineComponent({
        name,
        setup() {
          const route = useOwnedRoute();
          contexts[name] = route;
          const draft = ref('');
          notifications[name] = 0;
          watch(
            () => route.query,
            () => {
              notifications[name] = (notifications[name] ?? 0) + 1;
            },
          );
          return () =>
            h('input', {
              value: draft.value,
              onInput: (event: Event) => {
                draft.value = (event.target as HTMLInputElement).value;
              },
            });
        },
      });
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/fdmprocurement/orders', component: page('Purchase') },
        { path: '/fdmwaimao/contracts', component: page('Trade') },
        { path: '/neixiao/contracts', component: page('Domestic') },
      ],
    });
    await router.push('/fdmprocurement/orders?view=refunds&contractId=p1');
    const host = document.createElement('div');
    const app = createApp({
      render: () =>
        h(RouterView, null, {
          default: ({
            Component,
            route,
          }: {
            Component: object;
            route: { path: string };
          }) => h(KeepAlive, null, () => h(Component, { key: route.path })),
        }),
    });
    app.use(router);
    app.mount(host);
    try {
      const input = host.querySelector('input')!;
      input.value = '采购未保存调整';
      input.dispatchEvent(new Event('input'));
      await nextTick();
      await router.push('/fdmwaimao/contracts?view=shipments&contractId=t1');
      await router.push('/neixiao/contracts?view=invoices&contractId=d1');
      await nextTick();
      expect(contexts.Purchase?.query).toEqual({
        view: 'refunds',
        contractId: 'p1',
      });
      expect(contexts.Trade?.query.contractId).toBe('t1');
      expect(contexts.Domestic?.query.contractId).toBe('d1');
      expect(notifications.Purchase).toBe(0);

      await router.push('/fdmprocurement/orders');
      await nextTick();
      expect(host.querySelector('input')).toBe(input);
      expect(input.value).toBe('采购未保存调整');
      expect(contexts.Purchase?.query).toEqual({
        view: 'refunds',
        contractId: 'p1',
      });
      await router.push('/fdmprocurement/orders?view=orders&contractId=p2');
      await nextTick();
      expect(contexts.Purchase?.query).toEqual({
        view: 'orders',
        contractId: 'p2',
      });
      expect(input.value).toBe('采购未保存调整');
      expect(contexts.Trade?.query.contractId).toBe('t1');
      await router.push('/fdmprocurement/orders');
      await nextTick();
      expect(contexts.Purchase?.query).toEqual({});
    } finally {
      app.unmount();
    }
  });
});
