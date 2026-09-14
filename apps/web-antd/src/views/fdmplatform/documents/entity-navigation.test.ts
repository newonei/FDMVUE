import { createApp, defineComponent, h, nextTick } from 'vue';
import { createMemoryHistory, createRouter } from 'vue-router';

import { describe, expect, it, vi } from 'vitest';

import { useEntityDetail } from './useEntityDetail';
async function harness(initial: string, load = async (id: string) => id) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/catalog', component: { render: () => null } }],
  });
  await router.push(initial);
  await router.isReady();
  const show = vi.fn();
  const close = vi.fn();
  const fail = vi.fn();
  let controls: ReturnType<typeof useEntityDetail<string>>;
  const app = createApp(
    defineComponent({
      setup() {
        controls = useEntityDetail('productId', load, show, close, fail);
        return () => h('div');
      },
    }),
  );
  app.use(router);
  app.mount(document.createElement('div'));
  await nextTick();
  return {
    router,
    show,
    close,
    fail,
    controls: controls!,
    dispose: () => app.unmount(),
  };
}
describe('entity drawer route lifecycle', () => {
  it('opens linked identity on refresh and updates an already mounted page', async () => {
    const view = await harness('/catalog?productId=a');
    await vi.waitFor(() => expect(view.show).toHaveBeenLastCalledWith('a'));
    await view.router.push('/catalog?productId=b');
    await vi.waitFor(() => expect(view.show).toHaveBeenLastCalledWith('b'));
    view.router.back();
    await vi.waitFor(() => expect(view.show).toHaveBeenLastCalledWith('a'));
    view.dispose();
  });
  it('closing removes only the detail query and does not reopen it', async () => {
    const view = await harness('/catalog?productId=a&keyword=mat');
    await vi.waitFor(() => expect(view.show).toHaveBeenCalledWith('a'));
    view.controls.close();
    await vi.waitFor(() =>
      expect(view.router.currentRoute.value.query).toEqual({ keyword: 'mat' }),
    );
    view.dispose();
  });
  it('does not let an earlier response reopen the drawer after closing', async () => {
    let finish: (value: string) => void = () => {};
    const view = await harness(
      '/catalog?productId=a',
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    view.controls.close();
    await nextTick();
    finish('stale');
    await nextTick();
    expect(view.show).not.toHaveBeenCalled();
    view.dispose();
  });
  it('reports a missing record without showing another list row', async () => {
    const view = await harness('/catalog?productId=missing', async () => {
      throw new Error('产品不存在');
    });
    await vi.waitFor(() =>
      expect(view.fail).toHaveBeenCalledWith(
        expect.stringContaining('产品不存在'),
      ),
    );
    expect(view.show).not.toHaveBeenCalled();
    view.dispose();
  });
  it('unmount invalidates a pending lookup', async () => {
    let finish: (value: string) => void = () => {};
    const view = await harness(
      '/catalog?productId=a',
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    view.dispose();
    finish('stale');
    await nextTick();
    expect(view.show).not.toHaveBeenCalled();
  });
});
