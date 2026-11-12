import type { UploadTaskContext } from './upload-task';

import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { describeUploadTask } from '#/components/upload-task/format';

import {
  resolveUploadErrorMessage,
  UPLOAD_TASK_CONCURRENCY,
  useUploadTaskStore,
} from './upload-task';

interface PendingUpload {
  context: UploadTaskContext;
  file: File;
  reject: (error: unknown) => void;
  resolve: (value: string) => void;
}

function createControllableRunner() {
  const pending: PendingUpload[] = [];
  const runner = vi.fn(
    (file: File, context: UploadTaskContext) =>
      new Promise<string>((resolve, reject) => {
        pending.push({ context, file, reject, resolve });
      }),
  );
  return { pending, runner };
}

function makeFile(name: string, size = 100) {
  return new File([new Uint8Array(size)], name, { type: 'image/png' });
}

async function flush() {
  await Promise.resolve();
  await Promise.resolve();
}

describe('upload task store', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('limits concurrent uploads and starts queued ones when a slot frees', async () => {
    const store = useUploadTaskStore();
    const { pending, runner } = createControllableRunner();
    const ids = Array.from({ length: UPLOAD_TASK_CONCURRENCY + 2 }, (_, i) =>
      store.add({ file: makeFile(`${i}.png`), upload: runner }),
    );

    expect(runner).toHaveBeenCalledTimes(UPLOAD_TASK_CONCURRENCY);
    expect(store.getTask(ids.at(-1))?.status).toBe('queued');

    pending[0]!.resolve('ok');
    await flush();

    expect(store.getTask(ids[0])?.status).toBe('success');
    expect(runner).toHaveBeenCalledTimes(UPLOAD_TASK_CONCURRENCY + 1);
  });

  it('moves to processing once the body is sent, then succeeds', async () => {
    const store = useUploadTaskStore();
    const { pending, runner } = createControllableRunner();
    const onSuccess = vi.fn();
    const id = store.add({
      file: makeFile('a.png'),
      onSuccess,
      upload: runner,
    });

    pending[0]!.context.onProgress(50, 100);
    expect(store.getTask(id)?.progress).toBe(0.5);
    expect(store.getTask(id)?.status).toBe('uploading');

    pending[0]!.context.onProgress(100, 100);
    expect(store.getTask(id)?.status).toBe('processing');
    expect(store.summary.processing).toBe(1);

    pending[0]!.resolve('https://cdn.example/a.png');
    await flush();

    expect(store.getTask(id)?.status).toBe('success');
    expect(onSuccess).toHaveBeenCalledWith('https://cdn.example/a.png');
    expect(store.hasActive).toBe(false);
  });

  it('aborts on cancel and can retry', async () => {
    const store = useUploadTaskStore();
    const { pending, runner } = createControllableRunner();
    const onSuccess = vi.fn();
    const id = store.add({
      file: makeFile('a.png'),
      onSuccess,
      upload: runner,
    });

    const firstSignal = pending[0]!.context.signal;
    store.cancel(id);
    expect(firstSignal.aborted).toBe(true);
    expect(store.getTask(id)?.status).toBe('canceled');

    // 已取消的请求即使晚到的结果也不应回填
    pending[0]!.resolve('late');
    await flush();
    expect(onSuccess).not.toHaveBeenCalled();
    expect(store.getTask(id)?.status).toBe('canceled');

    store.retry(id);
    expect(runner).toHaveBeenCalledTimes(2);
    expect(store.getTask(id)?.status).toBe('uploading');
    pending[1]!.resolve('second');
    await flush();
    expect(onSuccess).toHaveBeenCalledWith('second');
  });

  it('reports result recovery as processing and ignores late callbacks after retry', async () => {
    const store = useUploadTaskStore();
    const { pending, runner } = createControllableRunner();
    const id = store.add({ file: makeFile('a.png'), upload: runner });
    const first = pending[0]!.context;

    first.onProcessing?.('正在确认服务器上传结果');
    const task = store.getTask(id)!;
    expect(task).toMatchObject({
      processingAt: expect.any(Number),
      processingMessage: '正在确认服务器上传结果',
      progress: 0,
      speed: 0,
      status: 'processing',
    });
    expect(describeUploadTask(task, task.processingAt! + 2000)).toBe(
      '正在确认服务器上传结果 · 已等待 2秒',
    );

    store.cancel(id);
    first.onProcessing?.('已取消请求的迟到回调');
    expect(task.status).toBe('canceled');
    store.retry(id);
    expect(task).toMatchObject({
      processingAt: undefined,
      processingMessage: undefined,
      status: 'uploading',
    });
    first.onProcessing?.('上一轮的迟到回调');
    first.onProgress(100, 100);
    expect(task).toMatchObject({ progress: 0, status: 'uploading' });

    pending[1]!.context.onProcessing?.('正在确认服务器上传结果');
    pending[1]!.resolve('ok');
    await flush();
    pending[1]!.context.onProcessing?.('任务结束后的迟到回调');
    expect(task.status).toBe('success');
  });

  it('ignores callbacks from a failed run after it is retried', async () => {
    const store = useUploadTaskStore();
    const { pending, runner } = createControllableRunner();
    const id = store.add({ file: makeFile('a.png'), upload: runner });
    const first = pending[0]!.context;
    pending[0]!.reject(new Error('failure'));
    await flush();
    store.retry(id);

    // 失败不触发abort，必须通过运行实例身份拦住上一轮迟到事件。
    expect(first.signal.aborted).toBe(false);
    first.onProcessing?.('旧请求');
    first.onProgress(100, 100);
    expect(store.getTask(id)).toMatchObject({
      processingMessage: undefined,
      progress: 0,
      status: 'uploading',
    });
    pending[1]!.resolve('ok');
    await flush();
  });

  it('records a readable error and keeps the queue moving', async () => {
    const store = useUploadTaskStore();
    const { pending, runner } = createControllableRunner();
    const id = store.add({ file: makeFile('a.png'), upload: runner });

    pending[0]!.reject({
      response: { data: { code: 500, msg: '上传的不是图片' } },
    });
    await flush();

    expect(store.getTask(id)?.status).toBe('error');
    expect(store.getTask(id)?.error).toBe('上传的不是图片');
    expect(store.summary.failed).toBe(1);
  });

  it('clears finished tasks but keeps active ones', async () => {
    const store = useUploadTaskStore();
    const { pending, runner } = createControllableRunner();
    const done = store.add({ file: makeFile('a.png'), upload: runner });
    const active = store.add({ file: makeFile('b.png'), upload: runner });
    pending[0]!.resolve('ok');
    await flush();

    store.clearFinished();

    expect(store.getTask(done)).toBeUndefined();
    expect(store.getTask(active)?.status).toBe('uploading');
  });
});

describe('resolveUploadErrorMessage', () => {
  it('reads business errors rejected as the response body', () => {
    expect(
      resolveUploadErrorMessage({
        code: 1_002_001,
        data: null,
        msg: '上传的不是图片',
      }),
    ).toBe('上传的不是图片');
  });

  it('maps network and timeout errors', () => {
    expect(resolveUploadErrorMessage(new Error('Network Error'))).toContain(
      '网络异常',
    );
    expect(
      resolveUploadErrorMessage(new Error('timeout of 1800000ms exceeded')),
    ).toContain('超时');
    expect(resolveUploadErrorMessage({ response: { status: 413 } })).toContain(
      '大小',
    );
  });

  it('does not display proxy HTML even when it arrives as a string or message', () => {
    expect(resolveUploadErrorMessage('<html>504 Gateway Time-out</html>')).toBe(
      '上传失败',
    );
    expect(
      resolveUploadErrorMessage({ msg: '<script>alert(1)</script>' }),
    ).toBe('上传失败');
    expect(
      resolveUploadErrorMessage(new Error('<html>502 Bad Gateway</html>')),
    ).toBe('上传失败');
  });

  it('reads plain string failures and preserves structured business messages', () => {
    expect(resolveUploadErrorMessage('  上传文件已失效  ')).toBe(
      '上传文件已失效',
    );
    expect(
      resolveUploadErrorMessage({
        cause: { response: { data: { msg: '文件已损坏' }, status: 400 } },
        httpStatus: 400,
        name: 'UploadRequestError',
      }),
    ).toBe('文件已损坏');
  });

  it('keeps a recovery error message when its cause is a transport error', () => {
    const message = '暂未确认服务器上传结果，请重试先查询';
    const error = new Error(message, {
      cause: {
        cause: { response: { status: 504 } },
        httpStatus: 504,
        name: 'UploadRequestError',
      },
    });
    expect(resolveUploadErrorMessage(error)).toBe(message);
  });
});
