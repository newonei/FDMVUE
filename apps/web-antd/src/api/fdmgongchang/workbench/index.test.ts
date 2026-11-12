import type { FdmgongchangStageStockApi } from '#/api/fdmgongchang/stage-stock';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { claimWorkbenchTask, getWorkbench, getWorkbenchStock } from './index';

const requestMocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('#/api/request', () => ({ requestClient: requestMocks }));
vi.mock('#/api/fdmgongchang/factory', () => ({
  factoryHeaders: () => ({ 'factory-id': '1' }),
}));

const stocks = (
  start: number,
  count: number,
): FdmgongchangStageStockApi.Stock[] =>
  Array.from({ length: count }, (_, index) => ({
    batchNo: `BOARD-${start + index}`,
    id: start + index,
    itemCode: `BC-${start + index}`,
    itemId: start + index,
    location: '板材区',
    quantity: 10,
    stage: 'BOARD',
  }));

describe('workshop API contract', () => {
  beforeEach(() => vi.clearAllMocks());

  it('passes a fixed process and keeps the selected factory header', async () => {
    await getWorkbench('SLICE');
    expect(requestMocks.get).toHaveBeenCalledWith(
      '/fdmgongchang/workbench/my',
      {
        headers: { 'factory-id': '1' },
        params: { process: 'SLICE' },
      },
    );
  });

  it('keeps the personal workbench request unfiltered', async () => {
    await getWorkbench();
    expect(requestMocks.get).toHaveBeenCalledWith(
      '/fdmgongchang/workbench/my',
      {
        headers: { 'factory-id': '1' },
      },
    );
  });

  it('claims a task through the existing authenticated workbench endpoint', async () => {
    await claimWorkbenchTask(32);
    expect(requestMocks.post).toHaveBeenCalledWith(
      '/fdmgongchang/workbench/task/claim',
      undefined,
      {
        headers: { 'factory-id': '1' },
        params: { id: 32 },
      },
    );
  });
});

describe('workbench actual stock pagination', () => {
  beforeEach(() => requestMocks.get.mockReset());

  it('loads every page for independent picking, including batches beyond the first hundred', async () => {
    const all = stocks(1, 205);
    requestMocks.get
      .mockResolvedValueOnce({ list: all.slice(0, 100), total: 205 })
      .mockResolvedValueOnce({ list: all.slice(100, 200), total: 205 })
      .mockResolvedValueOnce({ list: all.slice(200), total: 205 });

    const result = await getWorkbenchStock('BOARD');

    expect(result.list).toEqual(all);
    expect(result.total).toBe(205);
    expect(requestMocks.get).toHaveBeenCalledTimes(3);
    for (let pageNo = 1; pageNo <= 3; pageNo++) {
      expect(requestMocks.get).toHaveBeenNthCalledWith(
        pageNo,
        '/fdmgongchang/workbench/stock',
        {
          headers: { 'factory-id': '1' },
          params: { pageNo, stage: 'BOARD', taskId: undefined },
        },
      );
    }
  });

  it('keeps task-filtered picking as a single request', async () => {
    const page = { list: stocks(1, 100), total: 205 };
    requestMocks.get.mockResolvedValue(page);

    expect(await getWorkbenchStock('BOARD', 31)).toEqual(page);
    expect(requestMocks.get).toHaveBeenCalledTimes(1);
    expect(requestMocks.get).toHaveBeenCalledWith(
      '/fdmgongchang/workbench/stock',
      {
        headers: { 'factory-id': '1' },
        params: { pageNo: 1, stage: 'BOARD', taskId: 31 },
      },
    );
  });

  it('stops on an empty later page when stock changes during loading', async () => {
    const first = stocks(1, 100);
    requestMocks.get
      .mockResolvedValueOnce({ list: first, total: 350 })
      .mockResolvedValueOnce({ list: [], total: 100 });

    const page = await getWorkbenchStock('BOARD');
    expect(page.list).toEqual(first);
    expect(requestMocks.get).toHaveBeenCalledTimes(2);
  });

  it('propagates a later page failure so the picker can offer a retry instead of incomplete stock', async () => {
    requestMocks.get
      .mockResolvedValueOnce({ list: stocks(1, 100), total: 150 })
      .mockRejectedValueOnce(new Error('stock unavailable'));

    await expect(getWorkbenchStock('BOARD')).rejects.toThrow(
      'stock unavailable',
    );
    expect(requestMocks.get).toHaveBeenCalledTimes(2);
  });
});
