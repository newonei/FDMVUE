import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createUploadDesignImageTask } from './upload-design-image';

const api = vi.hoisted(() => ({ result: vi.fn(), upload: vi.fn() }));
vi.mock('#/api/fdmdata/pattern/design-item', () => ({
  getFdmdataPatternDesignImageUploadResult: api.result,
  uploadFdmdataPatternDesignItemDesignImage: api.upload,
}));

const uploaded = {
  designImageUrl: 'https://example.com/original.jpg',
  previewImageUrl: 'https://example.com/preview.jpg',
};
const gatewayError = { httpStatus: 504, message: 'Gateway Timeout' };

function context(controller = new AbortController()) {
  return {
    onProcessing: vi.fn(),
    onProgress: vi.fn(),
    signal: controller.signal,
  };
}

function file() {
  return new File(['image'], '设计图.jpg', { type: 'image/jpeg' });
}

describe('客服上传结果恢复', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    api.upload.mockReset();
    api.result.mockReset().mockResolvedValue(null);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('正常上传带独立UUID并直接返回，不额外查询', async () => {
    api.upload.mockResolvedValue(uploaded);
    const ctx = context();
    const source = file();
    await expect(createUploadDesignImageTask()(source, ctx)).resolves.toEqual(uploaded);
    const [actualFile, progress, options] = api.upload.mock.calls[0]!;
    expect(actualFile).toBe(source);
    expect(options).toMatchObject({
      signal: ctx.signal,
      silent: true,
      uploadId: expect.stringMatching(/^[\da-f]{8}(-[\da-f]{4}){3}-[\da-f]{12}$/),
    });
    progress({ loaded: 5, total: 10 });
    expect(ctx.onProgress).toHaveBeenCalledWith(5, 10);
    expect(api.result).not.toHaveBeenCalled();
  });

  it('504后处理中的原请求完成，找回URL且不重复POST', async () => {
    api.upload.mockRejectedValue(gatewayError);
    api.result
      .mockResolvedValueOnce({ status: 'PROCESSING' })
      .mockResolvedValueOnce({ result: uploaded, status: 'SUCCESS' });
    const ctx = context();
    const result = createUploadDesignImageTask()(file(), ctx);
    await vi.advanceTimersByTimeAsync(3000);
    await expect(result).resolves.toEqual(uploaded);
    expect(api.upload).toHaveBeenCalledTimes(1);
    expect(api.result).toHaveBeenCalledWith(api.upload.mock.calls[0]![2].uploadId, ctx.signal);
    expect(ctx.onProcessing).toHaveBeenCalledWith('正在确认服务器上传结果');
  });

  it('请求尚未进入控制器时继续等，不因null自动重传', async () => {
    api.upload.mockRejectedValue({ code: 'ERR_NETWORK' });
    api.result
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ result: uploaded, status: 'SUCCESS' });
    const result = createUploadDesignImageTask()(file(), context());
    await vi.advanceTimersByTimeAsync(3000);
    await expect(result).resolves.toEqual(uploaded);
    expect(api.upload).toHaveBeenCalledTimes(1);
  });

  it.each([{ httpStatus: 413 }, { code: 400, msg: '图片格式不正确' }])(
    '明确拒绝或业务失败不进入轮询：%j',
    async (error) => {
      api.upload.mockRejectedValue(error);
      await expect(createUploadDesignImageTask()(file(), context())).rejects.toBe(error);
      expect(api.result).not.toHaveBeenCalled();
    },
  );

  it('兼容未部署恢复接口的旧后端，保留实际HTTP错误', async () => {
    api.upload.mockRejectedValue(gatewayError);
    api.result.mockRejectedValue({ httpStatus: 404 });
    await expect(createUploadDesignImageTask()(file(), context())).rejects.toBe(gatewayError);
    expect(api.result).toHaveBeenCalledTimes(1);
  });

  it('服务端明确失败时停止等待，人工重试用新编号', async () => {
    api.upload.mockRejectedValueOnce(gatewayError).mockResolvedValueOnce(uploaded);
    api.result.mockResolvedValue({ message: '图片处理失败', status: 'FAILED' });
    const runner = createUploadDesignImageTask();
    const source = file();
    await expect(runner(source, context())).rejects.toThrow('图片处理失败');
    await expect(runner(source, context())).resolves.toEqual(uploaded);
    expect(api.upload.mock.calls[1]![2].uploadId).not.toBe(api.upload.mock.calls[0]![2].uploadId);
  });

  it('轮询有上限，之后人工重试先找回成功结果而不重发文件', async () => {
    api.upload.mockRejectedValue(gatewayError);
    api.result.mockResolvedValue({ status: 'PROCESSING' });
    const runner = createUploadDesignImageTask();
    const source = file();
    const result = runner(source, context());
    const rejection = expect(result).rejects.toThrow('暂未确认服务器上传结果（HTTP 504）');
    await vi.advanceTimersByTimeAsync(120_000);
    await rejection;
    api.result.mockResolvedValue({ result: uploaded, status: 'SUCCESS' });
    await expect(runner(source, context())).resolves.toEqual(uploaded);
    expect(api.upload).toHaveBeenCalledTimes(1);
  });

  it('取消停止轮询，重试保留编号找回已存储文件', async () => {
    api.upload.mockRejectedValue(gatewayError);
    api.result.mockResolvedValue({ status: 'PROCESSING' });
    const runner = createUploadDesignImageTask();
    const source = file();
    const controller = new AbortController();
    const result = runner(source, context(controller));
    const rejection = expect(result).rejects.toMatchObject({ name: 'AbortError' });
    await vi.advanceTimersByTimeAsync(0);
    controller.abort();
    await rejection;
    const queryCount = api.result.mock.calls.length;
    await vi.advanceTimersByTimeAsync(9000);
    expect(api.result).toHaveBeenCalledTimes(queryCount);
    api.result.mockResolvedValue({ result: uploaded, status: 'SUCCESS' });
    await expect(runner(source, context())).resolves.toEqual(uploaded);
    expect(api.upload).toHaveBeenCalledTimes(1);
  });

  it('替换文件创建独立任务，即使同名也不能认领旧结果', async () => {
    api.upload.mockResolvedValue(uploaded);
    await createUploadDesignImageTask()(file(), context());
    await createUploadDesignImageTask()(file(), context());
    expect(api.upload.mock.calls[1]![2].uploadId).not.toBe(api.upload.mock.calls[0]![2].uploadId);
    expect(api.result).not.toHaveBeenCalled();
  });
});
