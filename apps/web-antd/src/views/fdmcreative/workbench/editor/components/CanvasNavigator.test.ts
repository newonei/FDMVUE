import { createApp, nextTick } from 'vue';

import { describe, expect, it, vi } from 'vitest';

import CanvasNavigator from './CanvasNavigator.vue';

vi.mock('@vben/icons', () => ({
  IconifyIcon: { render: () => null },
}));

describe('canvas navigator', () => {
  it('searches, filters and emits the node to locate', async () => {
    const container = document.createElement('div');
    const app = createApp(CanvasNavigator, {
      nodes: [
        {
          id: 'image-a',
          label: '参考图生图',
          name: '海报主图',
          status: 'FAILED',
          type: 'image-to-image',
        },
        {
          id: 'video-a',
          label: '视频生成',
          name: '片尾镜头',
          status: 'RUNNING',
          type: 'video-generate',
        },
      ],
      onLocate: (nodeId: string) => located.push(nodeId),
    });
    const located: string[] = [];
    app.mount(container);

    const input = container.querySelector<HTMLInputElement>('input');
    expect(input).not.toBeNull();
    input!.value = '海报';
    input!.dispatchEvent(new Event('input'));
    await nextTick();

    const results =
      container.querySelectorAll<HTMLButtonElement>('.navigator-node');
    expect(results).toHaveLength(1);
    expect(results[0]?.textContent).toContain('海报主图');
    results[0]?.click();
    expect(located).toEqual(['image-a']);

    app.unmount();
  });
});
