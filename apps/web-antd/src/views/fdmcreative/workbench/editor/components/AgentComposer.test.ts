import { createApp, nextTick } from 'vue';

import { afterEach, describe, expect, it, vi } from 'vitest';

import AgentComposer from './AgentComposer.vue';

vi.mock('@vben/icons', () => ({
  IconifyIcon: { render: () => null },
}));

describe('agent composer permissions', () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  it('keeps a viewer read-only: history can be displayed but no message or apply controls are rendered', async () => {
    const container = document.createElement('div');
    document.body.append(container);
    const app = createApp(AgentComposer, {
      canEdit: false,
      draftVersion: 7,
      enabled: true,
      nodes: [],
      projectId: 12,
    });
    app.directive('access', () => {});
    app.mount(container);
    await nextTick();

    expect(container.textContent).toContain('当前为只读协作角色');
    expect(container.querySelector('textarea')).toBeNull();
    expect(container.querySelector('button')).toBeNull();

    app.unmount();
  });
});
