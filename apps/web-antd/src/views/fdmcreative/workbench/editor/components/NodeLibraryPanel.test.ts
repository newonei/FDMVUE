/* eslint-disable vue/one-component-per-file */
import { createApp, nextTick } from 'vue';

import { describe, expect, it, vi } from 'vitest';

import NodeLibraryPanel from './NodeLibraryPanel.vue';

vi.mock('@vben/icons', () => ({
  IconifyIcon: { render: () => null },
}));

describe('node library panel', () => {
  it('keeps double-click and drag gestures while exposing structured help', async () => {
    const added: string[] = [];
    const dragged: string[] = [];
    const container = document.createElement('div');
    document.body.append(container);
    const app = createApp(NodeLibraryPanel, {
      onNodeAdd: (type: string) => added.push(type),
      onNodeDragStart: (type: string) => dragged.push(type),
    });
    app.mount(container);
    await nextTick();

    const firstNode = container.querySelector<HTMLButtonElement>(
      '.library-node',
    );
    expect(firstNode).not.toBeNull();
    expect(firstNode?.getAttribute('aria-describedby')).toBe(
      'node-help-creative-brief',
    );

    firstNode?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    firstNode?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    expect(dragged).toEqual(['creative-brief']);
    expect(added).toEqual(['creative-brief']);

    app.unmount();
    container.remove();
  });

  it('keeps help focusable in readonly mode without allowing mutations', async () => {
    const added: string[] = [];
    const dragged: string[] = [];
    const container = document.createElement('div');
    document.body.append(container);
    const app = createApp(NodeLibraryPanel, {
      onNodeAdd: (type: string) => added.push(type),
      onNodeDragStart: (type: string) => dragged.push(type),
      readonly: true,
    });
    app.mount(container);
    await nextTick();

    const firstNode = container.querySelector<HTMLButtonElement>(
      '.library-node',
    );
    expect(firstNode?.disabled).toBe(false);
    expect(firstNode?.getAttribute('aria-disabled')).toBe('true');
    firstNode?.focus();
    expect(document.activeElement).toBe(firstNode);
    await nextTick();
    await new Promise((resolve) => setTimeout(resolve, 0));
    const help = document.body.querySelector('.node-help');
    expect(help?.textContent).toContain('用途');
    expect(help?.textContent).toContain('创作需求');
    expect(help?.textContent).toContain('适用场景');
    expect(help?.textContent).toContain('小提示');

    firstNode?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    firstNode?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    expect(dragged).toEqual([]);
    expect(added).toEqual([]);

    app.unmount();
    container.remove();
  });
});
