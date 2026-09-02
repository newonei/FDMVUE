import { createApp, nextTick } from 'vue';

import { describe, expect, it } from 'vitest';

import ProductStatusTag from './ProductStatusTag.vue';

describe('productStatusTag', () => {
  it('uses numeric CommonStatus labels', async () => {
    const enabled = document.createElement('div');
    const enabledApp = createApp(ProductStatusTag, { status: 0 });
    enabledApp.mount(enabled);
    await nextTick();
    expect(enabled.textContent).toContain('已启用');
    enabledApp.unmount();
    const disabled = document.createElement('div');
    const disabledApp = createApp(ProductStatusTag, { status: 1 });
    disabledApp.mount(disabled);
    await nextTick();
    expect(disabled.textContent).toContain('已停用');
    disabledApp.unmount();
  });
});
