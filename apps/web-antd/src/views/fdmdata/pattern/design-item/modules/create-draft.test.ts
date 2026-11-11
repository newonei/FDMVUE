import { effectScope, nextTick } from 'vue';

import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useUploadTaskStore } from '#/store/upload-task';

import { usePatternDesignItemCreateDraft } from './create-draft';

const mocks = vi.hoisted(() => ({
  thumbnail: vi.fn(),
  upload: vi.fn(),
}));

vi.mock('#/api/fdmdata/pattern/design-item', () => ({
  uploadFdmdataPatternDesignItemDesignImage: mocks.upload,
}));
vi.mock('#/components/upload-task', () => ({
  createLocalThumbnail: mocks.thumbnail,
}));

interface UploadResult {
  designImageUrl: string;
  previewImageUrl: string;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

interface PendingUpload extends ReturnType<typeof deferred<UploadResult>> {
  file: File;
  onProgress: (event: { loaded: number; total?: number }) => void;
  options: { signal: AbortSignal; silent: boolean };
}

function makeFile(name: string) {
  return new File([new Uint8Array(100)], name, { type: 'image/png' });
}

function uploaded(name: string): UploadResult {
  return {
    designImageUrl: `https://cdn.example/${name}.png`,
    previewImageUrl: `https://cdn.example/${name}-preview.jpg`,
  };
}

async function flush() {
  await Promise.resolve();
  await nextTick();
}

describe('客服设计图上传草稿', () => {
  let draft: ReturnType<typeof usePatternDesignItemCreateDraft>;
  let store: ReturnType<typeof useUploadTaskStore>;
  let pending: PendingUpload[];

  beforeEach(() => {
    setActivePinia(createPinia());
    store = useUploadTaskStore();
    draft = usePatternDesignItemCreateDraft();
    draft.clear();
    pending = [];
    mocks.upload
      .mockReset()
      .mockImplementation(
        (
          file: File,
          onProgress: PendingUpload['onProgress'],
          options: PendingUpload['options'],
        ) => {
          const request = {
            ...deferred<UploadResult>(),
            file,
            onProgress,
            options,
          };
          pending.push(request);
          return request.promise;
        },
      );
    mocks.thumbnail.mockReset().mockResolvedValue(undefined);
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  });

  afterEach(async () => {
    draft.clear();
    store.$reset();
    for (const request of pending) request.resolve(uploaded('cleanup'));
    await flush();
    store.$dispose();
    vi.restoreAllMocks();
  });

  it('报告传输和服务器处理状态，并回填原图、预览和本地缩略图', async () => {
    const file = makeFile('花型.png');
    const link = { path: '/kefu/pattern-design-item' };
    mocks.thumbnail.mockResolvedValueOnce('blob:local-preview');
    draft.addFiles([file], link);
    const row = draft.draft.rows[0]!;
    const request = pending[0]!;

    expect(request.file).toBe(file);
    expect(request.options).toEqual({
      signal: expect.any(AbortSignal),
      silent: true,
    });
    expect(draft.getRowTask(row)).toMatchObject({
      link,
      name: '花型.png',
      source: '客服设计图',
      status: 'uploading',
    });
    expect(draft.stats.value).toEqual({
      done: 0,
      failed: 0,
      total: 1,
      uploading: 1,
    });

    request.onProgress({ loaded: 25, total: 100 });
    expect(draft.getRowTask(row)?.progress).toBe(0.25);
    request.onProgress({ loaded: 100, total: 100 });
    expect(draft.getRowTask(row)?.status).toBe('processing');
    expect(draft.getRowState(row)).toBe('uploading');

    request.resolve(uploaded('花型'));
    await flush();
    expect(row).toMatchObject({
      ...uploaded('花型'),
      localThumbUrl: 'blob:local-preview',
    });
    expect(draft.getRowState(row)).toBe('done');
    expect(draft.stats.value).toEqual({
      done: 1,
      failed: 0,
      total: 1,
      uploading: 0,
    });
  });

  it('共享草稿在弹窗作用域销毁后继续完成，并可从上传面板请求恢复', async () => {
    const dialogScope = effectScope();
    const firstDialog = dialogScope.run(() =>
      usePatternDesignItemCreateDraft(),
    )!;
    firstDialog.draft.formValues = {
      orderNo: 'KF-20261111',
      shopName: '客服店铺',
    };
    firstDialog.addFiles([makeFile('后台上传.png')]);
    const row = firstDialog.draft.rows[0]!;
    row.productSpec = '183*61';
    dialogScope.stop();

    const nextDialog = usePatternDesignItemCreateDraft();
    expect(nextDialog.draft).toBe(firstDialog.draft);
    expect(pending[0]!.options.signal.aborted).toBe(false);
    pending[0]!.resolve(uploaded('后台上传'));
    await flush();

    expect(nextDialog.draft.rows[0]).toMatchObject({
      ...uploaded('后台上传'),
      productSpec: '183*61',
    });
    expect(nextDialog.draft.formValues?.orderNo).toBe('KF-20261111');
    store.getOpenHandler(row.taskId!)?.();
    expect(nextDialog.openRequested.value).toBe(true);
  });

  it('取消后可重试，旧请求晚到不会覆盖本次重试结果', async () => {
    draft.addFiles([makeFile('取消重试.png')]);
    const row = draft.draft.rows[0]!;
    const id = row.taskId!;
    const firstRequest = pending[0]!;
    store.cancel(id);
    expect(firstRequest.options.signal.aborted).toBe(true);
    expect(draft.getRowState(row)).toBe('failed');

    draft.retryRow(row);
    expect(row.taskId).toBe(id);
    expect(pending).toHaveLength(2);
    expect(pending[1]!.options.signal).not.toBe(firstRequest.options.signal);
    expect(draft.getRowState(row)).toBe('uploading');
    pending[1]!.resolve(uploaded('重试成功'));
    await flush();
    firstRequest.resolve(uploaded('已取消的旧请求'));
    await flush();
    expect(row).toMatchObject(uploaded('重试成功'));
    expect(draft.getRowTask(row)?.status).toBe('success');
  });

  it('失败原因保留在任务中，移除失败任务后仍能用原文件重试', async () => {
    const file = makeFile('失败重试.png');
    draft.addFiles([file]);
    const row = draft.draft.rows[0]!;
    pending[0]!.reject({ response: { data: { msg: '存储服务暂时不可用' } } });
    await flush();
    expect(draft.getRowTask(row)).toMatchObject({
      error: '存储服务暂时不可用',
      status: 'error',
    });
    expect(draft.stats.value.failed).toBe(1);

    draft.retryRow(row);
    expect(pending).toHaveLength(2);
    pending[1]!.reject(new Error('Network Error'));
    await flush();
    const removedId = row.taskId!;
    store.remove(removedId);
    draft.retryRow(row);
    expect(row.taskId).not.toBe(removedId);
    expect(pending[2]!.file).toBe(file);
    pending[2]!.resolve(uploaded('恢复成功'));
    await flush();
    expect(draft.getRowState(row)).toBe('done');
  });

  it('替换文件会取消旧任务，晚到的旧图片及缩略图不会回填', async () => {
    const firstThumbnail = deferred<string | undefined>();
    mocks.thumbnail
      .mockReturnValueOnce(firstThumbnail.promise)
      .mockResolvedValueOnce('blob:new-preview');
    draft.addFiles([makeFile('旧文件.png')]);
    const row = draft.draft.rows[0]!;
    const oldId = row.taskId!;
    const replacement = makeFile('新文件.png');
    draft.replaceFile(row, replacement);

    expect(pending[0]!.options.signal.aborted).toBe(true);
    expect(store.getTask(oldId)).toBeUndefined();
    pending[1]!.resolve(uploaded('新文件'));
    await flush();
    pending[0]!.resolve(uploaded('旧文件'));
    firstThumbnail.resolve('blob:old-preview');
    await flush();

    expect(row).toMatchObject({
      ...uploaded('新文件'),
      file: replacement,
      localThumbUrl: 'blob:new-preview',
    });
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:old-preview');
    expect(URL.revokeObjectURL).not.toHaveBeenCalledWith('blob:new-preview');
  });

  it('重新选择同一个 File 时也会丢弃旧任务的缩略图', async () => {
    const firstThumbnail = deferred<string | undefined>();
    mocks.thumbnail
      .mockReturnValueOnce(firstThumbnail.promise)
      .mockResolvedValueOnce('blob:current-preview');
    const file = makeFile('再次选择.png');
    draft.addFiles([file]);
    const row = draft.draft.rows[0]!;
    draft.replaceFile(row, file);
    await flush();
    firstThumbnail.resolve('blob:stale-preview');
    await flush();
    expect(row.localThumbUrl).toBe('blob:current-preview');
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:stale-preview');
  });

  it('删除行后释放晚到的缩略图，并阻止旧上传结果回填', async () => {
    const thumbnail = deferred<string | undefined>();
    mocks.thumbnail.mockReturnValueOnce(thumbnail.promise);
    draft.addFiles([makeFile('删除.png')]);
    const row = draft.draft.rows[0]!;
    draft.removeRow(row);
    expect(pending[0]!.options.signal.aborted).toBe(true);
    pending[0]!.resolve(uploaded('删除后晚到'));
    thumbnail.resolve('blob:removed-preview');
    await flush();

    expect(draft.draft.rows).toHaveLength(0);
    expect(store.tasks).toHaveLength(0);
    expect(row.designImageUrl).toBe('');
    expect(row.localThumbUrl).toBeUndefined();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:removed-preview');
  });

  it('清空草稿释放已有和晚到的缩略图，取消所有任务并重置恢复标记', async () => {
    const lateThumbnail = deferred<string | undefined>();
    mocks.thumbnail
      .mockResolvedValueOnce('blob:ready-preview')
      .mockReturnValueOnce(lateThumbnail.promise);
    draft.addFiles([makeFile('已有预览.png'), makeFile('待生成预览.png')]);
    const removedRows = [...draft.draft.rows];
    draft.draft.formValues = { orderNo: '待清空' };
    draft.openRequested.value = true;
    await flush();
    draft.clear();
    lateThumbnail.resolve('blob:cleared-preview');
    for (const request of pending) request.resolve(uploaded('清空后晚到'));
    await flush();

    expect(pending.every((request) => request.options.signal.aborted)).toBe(
      true,
    );
    expect(store.tasks).toHaveLength(0);
    expect(draft.draft.rows).toHaveLength(0);
    expect(draft.draft.formValues).toBeUndefined();
    expect(draft.openRequested.value).toBe(false);
    expect(draft.hasContent.value).toBe(false);
    expect(
      removedRows.every((row) => !row.designImageUrl && !row.localThumbUrl),
    ).toBe(true);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:ready-preview');
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:cleared-preview');
  });

  it('原图成功但服务端没有预览图时仍可完成，手动 URL 行不创建上传任务', async () => {
    draft.addUrlRow();
    const manualRow = draft.draft.rows[0]!;
    expect(draft.hasContent.value).toBe(true);
    expect(draft.getRowState(manualRow)).toBe('empty');
    manualRow.designImageUrl = 'https://cdn.example/manual.png';
    expect(draft.getRowState(manualRow)).toBe('done');
    expect(mocks.upload).not.toHaveBeenCalled();

    draft.addFiles([makeFile('无预览.png')]);
    pending[0]!.resolve({
      designImageUrl: 'https://cdn.example/original.png',
      previewImageUrl: '',
    });
    await flush();
    expect(draft.getRowState(draft.draft.rows[1]!)).toBe('done');
    expect(draft.stats.value).toEqual({
      done: 2,
      failed: 0,
      total: 2,
      uploading: 0,
    });
  });
});
