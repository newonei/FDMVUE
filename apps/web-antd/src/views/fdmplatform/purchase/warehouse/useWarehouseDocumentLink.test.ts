import { createApp, defineComponent, h } from 'vue';
import { createMemoryHistory, createRouter } from 'vue-router';

import { describe, expect, it, vi } from 'vitest';

import { useWarehouseDocumentLink } from './useWarehouseDocumentLink';

describe('warehouse document links', () => {
  it('opens the current document and preserves the tab when closing the link', async () => {
    const earlier = Promise.withResolvers<string>();
    const read = vi.fn((id: string) =>
      id === 'first' ? earlier.promise : Promise.resolve(id),
    );
    const show = vi.fn();
    const showError = vi.fn();
    const page = defineComponent({
      setup() {
        const { clearLink } = useWarehouseDocumentLink(
          'stockInId',
          read,
          show,
          showError,
        );
        return () => h('button', { onClick: clearLink }, 'Close');
      },
    });
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/warehouse', component: page }],
    });
    await router.push('/warehouse?view=stock-ins&stockInId=first');
    const host = document.createElement('div');
    const app = createApp(page).use(router);
    app.mount(host);
    try {
      expect(read).toHaveBeenCalledWith('first');
      await router.push('/warehouse?view=stock-ins&stockInId=second');
      await vi.waitFor(() => expect(show).toHaveBeenCalledWith('second'));
      earlier.resolve('first');
      await earlier.promise;
      expect(show).toHaveBeenCalledTimes(1);
      expect(showError).not.toHaveBeenCalled();

      host.querySelector('button')!.click();
      await vi.waitFor(() =>
        expect(router.currentRoute.value.query).toEqual({ view: 'stock-ins' }),
      );
    } finally {
      app.unmount();
    }
  });
});
