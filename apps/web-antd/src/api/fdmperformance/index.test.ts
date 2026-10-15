import { beforeEach, describe, expect, it, vi } from 'vitest';

import { skipTask } from './index';

const post = vi.hoisted(() => vi.fn());
vi.mock('#/api/request', () => ({ requestClient: { post } }));
vi.mock('#/api/fdmstorage/object', () => ({
  FDM_OBJECT_UPLOAD_TIMEOUT: 60_000,
}));

beforeEach(() => post.mockReset().mockResolvedValue(true));

describe('绩效跳过节点 API', () => {
  it('向专用接口传递当前实例和任务，可不填原因', async () => {
    await expect(skipTask({ instanceId: 7, taskId: 'task-7' })).resolves.toBe(
      true,
    );
    expect(post).toHaveBeenCalledExactlyOnceWith(
      '/fdmperformance/assessment/task/skip',
      { instanceId: 7, taskId: 'task-7' },
    );
  });
});
