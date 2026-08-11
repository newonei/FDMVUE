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
    expect(statusLabel()?.classList.contains('status-waiting-ai')).toBe(true);

    nodeData.status = 'ARCHIVING_AI';
    listeners.get('change:data')?.();
    await nextTick();
    expect(statusLabel()?.textContent?.trim()).toBe('结果归档中');

    app.unmount();
  });

  it('shows the generated prompt without mutating the node configuration', async () => {
    const nodeData: Record<string, unknown> = {
      config: {
        language: 'ZH_CN',
        prompt: '把输入内容扩写为图片提示词',
        targetType: 'IMAGE',
      },
      display: {},
      name: '提示词生成器',
      status: 'IDLE',
      type: 'prompt-generator',
    };
    const listeners = new Map<string, () => void>();
    const node = {
      getData: () => nodeData,
      getSize: () => ({ height: 176, width: 202 }),
      off: vi.fn(),
      on: (event: string, listener: () => void) =>
        listeners.set(event, listener),
    };
    const container = document.createElement('div');
    const app = createApp(WorkbenchNode);
    app.provide('getNode', () => node);
    app.mount(container);

    expect(container.textContent).toContain('把输入内容扩写为图片提示词');
    expect(container.textContent).toContain('生成提示词');

    nodeData.display = { outputText: '电影感产品摄影，柔和侧光，浅景深' };
    nodeData.status = 'SUCCEEDED';
    listeners.get('change:data')?.();
    await nextTick();

    expect(container.textContent).toContain('电影感产品摄影，柔和侧光，浅景深');
    expect(container.textContent).toContain('查看生成提示词');
    expect((nodeData.config as Record<string, unknown>).prompt).toBe(
      '把输入内容扩写为图片提示词',
    );

    app.unmount();
  });

  it('summarizes video frame extraction and normalization settings', async () => {
    const nodeData: Record<string, unknown> = {
      config: { frameMode: 'TIME', timeSeconds: 3.5 },
      name: '视频抽帧',
      status: 'IDLE',
      type: 'video-frame-extract',
    };
    const listeners = new Map<string, () => void>();
    const node = {
      getData: () => nodeData,
      getSize: () => ({ height: 158, width: 202 }),
      off: vi.fn(),
      on: (event: string, listener: () => void) =>
        listeners.set(event, listener),
    };
    const container = document.createElement('div');
    const app = createApp(WorkbenchNode);
    app.provide('getNode', () => node);
    app.mount(container);

    expect(container.textContent).toContain('指定时间');
    expect(container.textContent).toContain('3.5 秒');

    nodeData.config = {
      fps: 24,
      height: 1080,
      resizeMode: 'FILL',
      width: 1920,
    };
    nodeData.name = '视频规格统一';
    nodeData.type = 'video-normalize';
    listeners.get('change:data')?.();
    await nextTick();

    expect(container.textContent).toContain('1920 × 1080');
    expect(container.textContent).toContain('24 FPS');
    expect(container.textContent).toContain('FILL');

    app.unmount();
  });
});
