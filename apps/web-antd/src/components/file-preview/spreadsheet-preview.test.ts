import { createApp, h, nextTick, reactive } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import SpreadsheetPreview from './spreadsheet-preview.vue';

class PreviewWorker {
  static instances: PreviewWorker[] = [];
  onmessage?: (event: { data: unknown }) => void;
  onerror?: () => void;
  postMessage = vi.fn();
  terminate = vi.fn();
  constructor() { PreviewWorker.instances.push(this); }
  message(data: unknown) { this.onmessage?.({ data }); }
}

let host: HTMLDivElement;
let cleanup: (() => void) | undefined;
const blob = () => ({ size: 20, arrayBuffer: async () => new ArrayBuffer(20) }) as Blob;
async function flush() { for (let index = 0; index < 5; index++) { await Promise.resolve(); await nextTick(); } }
async function mount() {
  const props = reactive({ blob: blob(), fileName: '测试.xlsx' });
  const fallback = vi.fn();
  host = document.createElement('div');
  document.body.append(host);
  const app = createApp({ render: () => h(SpreadsheetPreview, { ...props, onFallback: fallback }) });
  app.mount(host);
  cleanup = () => app.unmount();
  await flush();
  return { props, fallback, worker: PreviewWorker.instances.at(-1)! };
}

beforeEach(() => {
  PreviewWorker.instances = [];
  vi.stubGlobal('Worker', PreviewWorker);
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
});
afterEach(() => { cleanup?.(); cleanup = undefined; host?.remove(); vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('spreadsheet preview lifecycle', () => {
  it('uses a worker with transferred data and renders cell strings without HTML execution', async () => {
    const { worker, fallback } = await mount();
    expect(worker.postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'open', fileName: '测试.xlsx', buffer: expect.any(ArrayBuffer) }), [expect.any(ArrayBuffer)]);
    worker.message({ type: 'ready', parseMilliseconds: 25, sheets: [{ name: '采购', rows: 1, columns: 1, hidden: false, rowOffsets: new Float64Array([0, 28]), columnOffsets: new Float64Array([0, 120]) }] });
    await flush();
    const request = worker.postMessage.mock.calls.at(-1)![0];
    worker.message({ type: 'viewport', id: request.id, cells: [{ row: 0, column: 0, endRow: 0, endColumn: 0, text: '<img src=x onerror=alert(1)>', numeric: false }] });
    await flush();
    expect(host.querySelector('[role=gridcell]')?.textContent).toBe('<img src=x onerror=alert(1)>');
    expect(host.querySelector('img,script')).toBeNull();
    expect(host.textContent).not.toContain('25 ms');
    (host.querySelector('[role=gridcell]') as HTMLButtonElement).click();
    await flush();
    expect(host.querySelector('.spreadsheet-address')?.textContent).toBe('A1');
    (host.querySelector('.spreadsheet-actions button') as HTMLButtonElement).click();
    expect(fallback).toHaveBeenCalledOnce();
  });

  it('terminates parsing when the file changes and ignores late messages', async () => {
    const { props, worker } = await mount();
    props.blob = blob();
    await flush();
    expect(worker.terminate).toHaveBeenCalledOnce();
    worker.message({ type: 'error', message: 'old error' });
    await flush();
    expect(host.textContent).not.toContain('old error');
    const latest = PreviewWorker.instances.at(-1)!;
    cleanup!(); cleanup = undefined;
    expect(latest.terminate).toHaveBeenCalledOnce();
  });

  it('resets the viewport when replacing a scrolled workbook with another first sheet', async () => {
    const { props, worker } = await mount();
    const metadata = (rows: number) => [{ name: '采购', rows, columns: 20, hidden: false,
      rowOffsets: Float64Array.from({ length: rows + 1 }, (_, index) => index * 28),
      columnOffsets: Float64Array.from({ length: 21 }, (_, index) => index * 120) }];
    worker.message({ type: 'ready', parseMilliseconds: 1, sheets: metadata(10000) });
    await flush();
    const viewport = host.querySelector('.spreadsheet-viewport') as HTMLDivElement;
    viewport.scrollTop = 279000;
    viewport.scrollLeft = 1800;
    viewport.dispatchEvent(new Event('scroll'));
    await new Promise((resolve) => requestAnimationFrame(resolve));
    await flush();
    expect(worker.postMessage.mock.calls.at(-1)![0].firstRow).toBeGreaterThan(9000);
    props.blob = blob();
    await flush();
    const nextWorker = PreviewWorker.instances.at(-1)!;
    nextWorker.message({ type: 'ready', parseMilliseconds: 1, sheets: metadata(35) });
    await flush();
    expect(nextWorker.postMessage.mock.calls.at(-1)![0]).toMatchObject({ type: 'viewport', sheet: 0, firstRow: 0, firstColumn: 0 });
    expect(host.querySelector('.spreadsheet-row-headers .spreadsheet-header')?.textContent).toBe('1');
    expect(host.querySelector('.spreadsheet-column-headers .spreadsheet-header')?.textContent).toBe('A');
  });

  it('stops an overlong parser and offers an explicit fallback without silently dropping data', async () => {
    vi.useFakeTimers();
    const { worker, fallback } = await mount();
    await vi.advanceTimersByTimeAsync(15_000);
    await flush();
    expect(host.textContent).toContain('已停止快速预览');
    expect(worker.terminate).toHaveBeenCalledOnce();
    expect(fallback).not.toHaveBeenCalled();
    (host.querySelector('.spreadsheet-state button') as HTMLButtonElement).click();
    expect(fallback).toHaveBeenCalledOnce();
  });
});
