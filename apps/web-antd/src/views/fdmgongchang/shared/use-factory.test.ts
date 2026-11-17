/* eslint-disable vue/one-component-per-file -- Multiple cached pages are needed to verify factory context isolation. */
import type { App } from 'vue';

import { createApp, defineComponent, h, KeepAlive, nextTick, ref } from 'vue';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { useFactory } from './use-factory';

const api = vi.hoisted(() => ({
  getMyFactories: vi.fn(),
  setCurrentFactoryId: vi.fn(),
}));
vi.mock('#/api/fdmgongchang/factory', () => api);

describe('cached factory page', () => {
  let app: App | undefined;

  afterEach(() => {
    app?.unmount();
    app = undefined;
    localStorage.removeItem('fdmgongchang:factory-id');
    vi.clearAllMocks();
  });

  it('restores its factory header and edits on activation without reloading factories', async () => {
    api.getMyFactories.mockResolvedValue({
      canSeeAll: true,
      defaultFactoryId: 1,
      factories: [{ id: 1 }, { id: 2 }],
    });
    const pages: Record<string, ReturnType<typeof useFactory>> = {};
    const active = ref('A');
    const FactoryPage = defineComponent({
      props: { id: { required: true, type: String } },
      setup(props) {
        const factory = useFactory();
        const draft = ref('');
        pages[props.id] = factory;
        return () => h('input', {
          onInput: (event: Event) => {
            draft.value = (event.target as HTMLInputElement).value;
          },
          value: draft.value,
        });
      },
    });
    const root = document.createElement('div');
    app = createApp({
      render: () => h(KeepAlive, null, {
        default: () => h(FactoryPage, { id: active.value, key: active.value }),
      }),
    });
    app.mount(root);
    await pages.A!.load();
    const input = root.querySelector('input')!;
    input.value = '待调整的筛选条件';
    input.dispatchEvent(new Event('input'));
    await nextTick();

    active.value = 'B';
    await nextTick();
    await pages.B!.load();
    pages.B!.select(2);
    expect(api.setCurrentFactoryId).toHaveBeenLastCalledWith(2);

    active.value = 'A';
    await nextTick();
    expect(root.querySelector('input')).toBe(input);
    expect(input.value).toBe('待调整的筛选条件');
    expect(pages.A!.factoryId.value).toBe(1);
    expect(api.setCurrentFactoryId).toHaveBeenLastCalledWith(1);
    expect(api.getMyFactories).toHaveBeenCalledTimes(2);

    active.value = 'B';
    await nextTick();
    expect(api.setCurrentFactoryId).toHaveBeenLastCalledWith(2);
  });

  it('defers hidden initialization and searches until activation restores its own header', async () => {
    const factories = {
      canSeeAll: true,
      defaultFactoryId: 1,
      factories: [{ id: 1 }, { id: 2 }],
    };
    let finishLoading!: (value: typeof factories) => void;
    api.getMyFactories.mockResolvedValueOnce(factories);
    api.getMyFactories.mockImplementationOnce(() => new Promise((resolve) => {
      finishLoading = resolve;
    }));
    const pages: Record<string, ReturnType<typeof useFactory>> = {};
    const active = ref('A');
    const FactoryPage = defineComponent({
      props: { id: { required: true, type: String } },
      setup(props) {
        pages[props.id] = useFactory();
        return () => h('div');
      },
    });
    app = createApp({
      render: () => h(KeepAlive, null, {
        default: () => h(FactoryPage, { id: active.value, key: active.value }),
      }),
    });
    app.mount(document.createElement('div'));
    await pages.A!.load();
    active.value = 'B';
    await nextTick();
    const initialized = vi.fn();
    const pendingLoad = pages.B!.load().then(initialized);
    active.value = 'A';
    await nextTick();
    localStorage.setItem('fdmgongchang:factory-id', '2');
    finishLoading(factories);
    await Promise.resolve();
    await Promise.resolve();
    expect(api.setCurrentFactoryId).toHaveBeenLastCalledWith(1);
    expect(initialized).not.toHaveBeenCalled();
    expect(pages.B!.factoryId.value).toBeNull();
    expect(pages.B!.loaded.value).toBe(false);

    const searched = vi.fn();
    const pendingSearch = pages.B!.whenActive().then((ready) => {
      if (ready) searched();
    });
    await Promise.resolve();
    expect(searched).not.toHaveBeenCalled();
    active.value = 'B';
    await nextTick();
    await Promise.all([pendingLoad, pendingSearch]);
    expect(api.setCurrentFactoryId).toHaveBeenLastCalledWith(2);
    expect(initialized).toHaveBeenCalledOnce();
    expect(searched).toHaveBeenCalledOnce();

    active.value = 'A';
    await nextTick();
    const closedSearch = pages.B!.whenActive();
    app.unmount();
    app = undefined;
    await expect(closedSearch).resolves.toBe(false);
  });
});
