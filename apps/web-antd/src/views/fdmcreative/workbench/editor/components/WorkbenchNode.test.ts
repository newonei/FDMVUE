import { createApp, nextTick } from 'vue';
import { describe, expect, it, vi } from 'vitest';

import WorkbenchNode from './WorkbenchNode.vue';

vi.mock('@vben/icons', () => ({
  IconifyIcon: { render: () => null },
}));

describe('workbench node', () => {
  it('reacts to X6 runtime status changes across the AI lifecycle', async () => {
    const nodeData: Record<string, unknown> = {
      config: {},
      name: '图片生成',
      status: 'PENDING',
      type: 'image-generate',
    };
    const listeners = new Map<string, () => void>();
    const node = {
      getData: () => nodeData,
      getSize: () => ({ height: 180, width: 260 }),
      off: vi.fn(),
      on: (event: string, listener: () => void) =>
        listeners.set(event, listener),
    };
    const container = document.createElement('div');
    const app = createApp(WorkbenchNode);
    app.provide('getNode', () => node);
    app.mount(container);
    const statusLabel = () =>
      container.querySelector<HTMLElement>('.status-label');

    expect(statusLabel()?.textContent?.trim()).toBe('排队中');

    nodeData.status = 'WAITING_AI';
    listeners.get('change:data')?.();
    await nextTick();
    expect(statusLabel()?.textContent?.trim()).toBe('模型生成中');
    expect(statusLabel()?.classList.contains('status-waiting_ai')).toBe(true);

    nodeData.status = 'ARCHIVING_AI';
    listeners.get('change:data')?.();
    await nextTick();
    expect(statusLabel()?.textContent?.trim()).toBe('结果归档中');

    app.unmount();
  });
});
