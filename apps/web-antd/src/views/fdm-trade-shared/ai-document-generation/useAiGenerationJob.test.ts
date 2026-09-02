import { describe, expect, it, vi } from 'vitest';

import { aiPollRetryDelay, useAiGenerationJob } from './useAiGenerationJob';

describe('aI generation polling and retry', () => {
  it('uses bounded exponential poll backoff', () => {
    expect(
      [1, 2, 3, 4, 5].map((count) => aiPollRetryDelay(100, count)),
    ).toEqual([100, 200, 400, 800, 800]);
  });

  it('continues polling after a transient read error', async () => {
    vi.useFakeTimers();
    const getJob = vi
      .fn()
      .mockRejectedValueOnce(new Error('temporary'))
      .mockResolvedValueOnce({
        id: '1',
        modelId: '2',
        sourceVersion: 3,
        status: 'READY',
        version: 2,
      });
    const state = useAiGenerationJob({
      dataSource: { getJob, start: vi.fn() },
      pollIntervalMs: 100,
    });
    await state.resume('1');
    expect(state.loading.value).toBe(true);
    await vi.advanceTimersByTimeAsync(100);
    expect(getJob).toHaveBeenCalledTimes(2);
    expect(state.job.value?.status).toBe('READY');
    expect(state.loading.value).toBe(false);
    state.stop();
    vi.useRealTimers();
  });

  it('allows a manual poll retry when the initial resume could not load a job', async () => {
    const getJob = vi
      .fn()
      .mockRejectedValueOnce(new Error('network unavailable'))
      .mockResolvedValueOnce({
        id: '1',
        modelId: '2',
        sourceVersion: 3,
        status: 'READY',
        version: 2,
      });
    const state = useAiGenerationJob({
      dataSource: { getJob, start: vi.fn() },
      maxConsecutivePollErrors: 0,
    });

    await state.resume('1');
    expect(state.job.value).toBeUndefined();
    expect(state.loading.value).toBe(false);
    await state.retry();
    expect(getJob).toHaveBeenCalledTimes(2);
    expect(state.job.value?.status).toBe('READY');
    state.stop();
  });

  it('uses the retry transition for FAILED jobs', async () => {
    const retry = vi.fn().mockResolvedValue({
      id: '1',
      modelId: '2',
      sourceVersion: 3,
      status: 'QUEUED',
      version: 5,
    });
    const state = useAiGenerationJob({
      dataSource: {
        getJob: vi.fn(),
        retry,
        start: vi.fn().mockResolvedValue({
          id: '1',
          modelId: '2',
          sourceVersion: 3,
          status: 'FAILED',
          version: 4,
        }),
      },
      pollIntervalMs: 10_000,
    });
    await state.start({});
    await state.retry();
    expect(retry).toHaveBeenCalledWith('1', 4);
    state.stop();
  });

  it('keeps polling when cancellation is only accepted asynchronously', async () => {
    vi.useFakeTimers();
    const getJob = vi.fn().mockResolvedValue({
      id: '1',
      modelId: '2',
      sourceVersion: 3,
      status: 'CANCELLED',
      version: 7,
    });
    const state = useAiGenerationJob({
      dataSource: {
        cancel: vi.fn().mockResolvedValue({
          id: '1',
          modelId: '2',
          sourceVersion: 3,
          status: 'GENERATING',
          version: 6,
        }),
        getJob,
        start: vi.fn().mockResolvedValue({
          id: '1',
          modelId: '2',
          sourceVersion: 3,
          status: 'GENERATING',
          version: 5,
        }),
      },
      pollIntervalMs: 100,
    });
    await state.start({});
    await state.cancel();
    expect(state.cancelling.value).toBe(true);
    expect(state.loading.value).toBe(true);
    await vi.advanceTimersByTimeAsync(100);
    expect(getJob).toHaveBeenCalledTimes(1);
    expect(state.job.value?.status).toBe('CANCELLED');
    expect(state.cancelling.value).toBe(false);
    expect(state.loading.value).toBe(false);
    state.stop();
    vi.useRealTimers();
  });
});
