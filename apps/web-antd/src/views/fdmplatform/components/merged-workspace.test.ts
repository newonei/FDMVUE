/* eslint-disable vue/one-component-per-file -- Route fixtures stand in for the merged department pages. */
import type { CompletionScope as Scope } from '../documents/completion-scope';

import { createApp, defineComponent, h, nextTick } from 'vue';
import {
  createMemoryHistory,
  createRouter,
  RouterView,
  useRoute,
} from 'vue-router';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  completionFilter,
  defaultCompletionScope,
} from '../documents/completion-scope';
import CompletionScope from './CompletionScope.vue';
import MergedWorkspace from './MergedWorkspace.vue';

const view = (name: string) =>
  defineComponent({
    props: { kind: { type: String, default: '' } },
    setup(props) {
      const route = useRoute();
      return () =>
        h(
          'p',
          { 'data-view': name },
          `${props.kind}:${route.query.documentId ?? ''}`,
        );
    },
  });
const disposals: (() => void)[] = [];
afterEach(() => {
  while (disposals.length > 0) disposals.pop()!();
});
async function mount(location: string) {
  const views = [
    {
      key: 'receipts',
      title: '回款记录',
      component: view('receipts'),
      props: { kind: 'receipts' },
    },
    {
      key: 'refunds',
      title: '退款与冲销',
      component: view('refunds'),
      props: { kind: 'refunds' },
    },
  ];
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      {
        path: '/caiwu/platform-receipts',
        component: defineComponent({
          render: () => h(MergedWorkspace, { views }),
        }),
      },
    ],
  });
  await router.push(location);
  await router.isReady();
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp({ render: () => h(RouterView) });
  app.use(router);
  app.mount(host);
  disposals.push(() => {
    app.unmount();
    host.remove();
  });
  await nextTick();
  return { host, router };
}

describe('merged department page', () => {
  it('shows the tab named by ?view= and falls back to the first tab', async () => {
    const { host } = await mount(
      '/caiwu/platform-receipts?view=refunds&documentId=r1',
    );
    expect(host.querySelector('[data-view]')?.textContent).toBe('refunds:r1');
    const fallback = await mount('/caiwu/platform-receipts?view=unknown');
    expect(fallback.host.querySelector('[data-view]')?.textContent).toBe(
      'receipts:',
    );
  });

  it('switching tabs keeps only the contract filter', async () => {
    const { host, router } = await mount(
      '/caiwu/platform-receipts?contractId=c1&documentId=r1&status=PENDING',
    );
    const tab = [...host.querySelectorAll<HTMLElement>('[role="tab"]')].find(
      (entry) => entry.textContent?.includes('退款与冲销'),
    )!;
    tab.click();
    await vi.waitFor(() =>
      expect(router.currentRoute.value.query).toEqual({
        view: 'refunds',
        contractId: 'c1',
      }),
    );
    await nextTick();
    expect(host.querySelector('[data-view]')?.textContent).toBe('refunds:');
  });
});

describe('completion scope', () => {
  it('maps scopes to the server filter and keeps a contract context complete', () => {
    expect(completionFilter('current')).toBe(false);
    expect(completionFilter('pending')).toBe(true);
    expect(completionFilter('all')).toBeUndefined();
    expect(defaultCompletionScope()).toBe('current');
    expect(defaultCompletionScope('contract-1')).toBe('all');
  });

  it('stays hidden while nothing awaits completion and switches the scope otherwise', async () => {
    const host = document.createElement('div');
    document.body.append(host);
    let scope: Scope = 'current';
    const changes: string[] = [];
    const render = (pendingTotal: number) =>
      h(CompletionScope, {
        modelValue: scope,
        pendingTotal,
        'onUpdate:modelValue': (value: Scope) => (scope = value),
        onChange: (value: string) => changes.push(value),
      });
    const hidden = createApp({ render: () => render(0) });
    hidden.mount(host);
    expect(host.textContent).toBe('');
    hidden.unmount();
    const shown = createApp({ render: () => render(12) });
    shown.mount(host);
    disposals.push(() => {
      shown.unmount();
      host.remove();
    });
    expect(host.textContent).toContain('待补齐历史单据 12');
    [...host.querySelectorAll('button')]
      .find((button) => button.textContent?.includes('待补齐'))!
      .click();
    expect(scope).toBe('pending');
    expect(changes).toEqual(['pending']);
  });
});
