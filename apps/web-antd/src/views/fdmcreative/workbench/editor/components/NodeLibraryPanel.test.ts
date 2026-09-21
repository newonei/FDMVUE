/* eslint-disable vue/one-component-per-file */
import { createApp, h, nextTick, ref } from 'vue';

import { describe, expect, it, vi } from 'vitest';

import NodeLibraryPanel from './NodeLibraryPanel.vue';

vi.mock('@vben/icons', () => ({
  IconifyIcon: { render: () => null },
}));

describe('node library panel', () => {
  it('adds with Enter or Space once without adding on the native click or key repeat', async () => {
    const onNodeAdd = vi.fn();
    const onNodeDragStart = vi.fn();
    const container = document.createElement('div');
    const app = createApp(NodeLibraryPanel, { onNodeAdd, onNodeDragStart });
    app.mount(container);
    await nextTick();
    const node = container.querySelector<HTMLButtonElement>('.library-node')!;
    for (const key of ['Enter', ' ']) {
      node.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key }));
      node.dispatchEvent(
        new KeyboardEvent('keydown', { bubbles: true, key, repeat: true }),
      );
      node.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key }));
      node.click();
    }
    expect(onNodeAdd.mock.calls).toEqual([
      ['creative-brief'],
      ['creative-brief'],
    ]);
    expect(onNodeDragStart).not.toHaveBeenCalled();
    node.dispatchEvent(
      new MouseEvent('mousedown', { bubbles: true, detail: 1 }),
    );
    node.dispatchEvent(
      new MouseEvent('mousedown', { bubbles: true, detail: 2 }),
    );
    node.dispatchEvent(
      new MouseEvent('dblclick', { bubbles: true, detail: 2 }),
    );
    expect(onNodeDragStart).toHaveBeenCalledOnce();
    expect(onNodeAdd).toHaveBeenCalledTimes(3);
    app.unmount();
  });

  it('keeps a compact entry available and expands before focusing search', async () => {
    const compact = ref(true);
    const panel = ref<{ focusSearch: () => Promise<void> }>();
    const container = document.createElement('div');
    document.body.append(container);
    const app = createApp({
      render: () =>
        h(NodeLibraryPanel, {
          compact: compact.value,
          onToggleCompact: () => {
            compact.value = !compact.value;
          },
          ref: panel,
        }),
    });
    app.mount(container);
    await nextTick();
    expect(
      container
        .querySelector('.node-library')
        ?.classList.contains('is-compact'),
    ).toBe(true);
    expect(container.querySelector('.library-node')).toBeNull();
    expect(container.querySelector('[aria-label="展开节点库"]')).not.toBeNull();
    container
      .querySelector<HTMLButtonElement>('[aria-label="搜索节点"]')
      ?.click();
    await nextTick();
    await nextTick();
    expect(compact.value).toBe(false);
    expect(document.activeElement).toBe(container.querySelector('input'));
    container
      .querySelector<HTMLButtonElement>('[aria-label="收起节点库"]')
      ?.click();
    await nextTick();
    expect(compact.value).toBe(true);
    await panel.value?.focusSearch();
    await nextTick();
    expect(document.activeElement).toBe(container.querySelector('input'));
    app.unmount();
    container.remove();
  });

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

    const firstNode =
      container.querySelector<HTMLButtonElement>('.library-node');
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

    const firstNode =
      container.querySelector<HTMLButtonElement>('.library-node');
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
    firstNode?.dispatchEvent(
      new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' }),
    );
    firstNode?.dispatchEvent(
      new KeyboardEvent('keydown', { bubbles: true, key: ' ' }),
    );
    expect(dragged).toEqual([]);
    expect(added).toEqual([]);

    app.unmount();
    container.remove();
  });
});
