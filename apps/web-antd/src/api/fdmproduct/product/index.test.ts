import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  deleteFdmProductCategory,
  getFdmProduct,
  getFdmProductCategoryList,
  getFdmProductFormOptions,
  getFdmProductPage,
  getFdmProductSelection,
  getFdmProductSelectionPage,
  updateFdmProductStatus,
  validateFdmProductSelection,
} from './index';

const requestMocks = vi.hoisted(() => ({
  delete: vi.fn(),
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
}));
vi.mock('#/api/request', () => ({ requestClient: requestMocks }));

describe('fdmproduct API contract', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requestMocks.get.mockResolvedValue([]);
    requestMocks.post.mockResolvedValue({});
    requestMocks.put.mockResolvedValue(true);
    requestMocks.delete.mockResolvedValue(true);
  });

  it('passes companyId through form options, product, category and status calls', async () => {
    await getFdmProductFormOptions();
    await getFdmProductPage({
      companyId: '9007199254740001',
      pageNo: 1,
      pageSize: 20,
      status: 0,
    });
    await getFdmProduct('9007199254740002', '9007199254740001');
    await getFdmProductCategoryList({ companyId: '9007199254740001' });
    await updateFdmProductStatus({
      companyId: '9007199254740001',
      expectedVersion: 3,
      id: '9007199254740002',
      status: 1,
    });
    await deleteFdmProductCategory({
      companyId: '9007199254740001',
      expectedVersion: 2,
      id: '9007199254740003',
    });
    expect(requestMocks.get).toHaveBeenNthCalledWith(
      1,
      '/fdmproduct/product/form-options',
    );
    expect(requestMocks.get).toHaveBeenNthCalledWith(
      2,
      '/fdmproduct/product/page',
      {
        params: {
          companyId: '9007199254740001',
          pageNo: 1,
          pageSize: 20,
          status: 0,
        },
      },
    );
    expect(requestMocks.get).toHaveBeenNthCalledWith(
      3,
      '/fdmproduct/product/get',
      { params: { companyId: '9007199254740001', id: '9007199254740002' } },
    );
    expect(requestMocks.get).toHaveBeenNthCalledWith(
      4,
      '/fdmproduct/category/list',
      { params: { companyId: '9007199254740001' } },
    );
    expect(requestMocks.put).toHaveBeenCalledWith(
      '/fdmproduct/product/update-status',
      {
        companyId: '9007199254740001',
        expectedVersion: 3,
        id: '9007199254740002',
        status: 1,
      },
    );
    expect(requestMocks.delete).toHaveBeenCalledWith(
      '/fdmproduct/category/delete',
      {
        params: {
          companyId: '9007199254740001',
          expectedVersion: 2,
          id: '9007199254740003',
        },
      },
    );
  });

  it('uses companyId+skuId get and returns validate detail directly', async () => {
    await getFdmProductSelectionPage({
      companyId: '9007199254740001',
      pageNo: 2,
      pageSize: 20,
    });
    await getFdmProductSelection({
      companyId: '9007199254740001',
      skuId: '9007199254740002',
    });
    await validateFdmProductSelection({
      companyId: '9007199254740001',
      skuId: '9007199254740002',
      versionToken: 'PC1.1.2.3.4',
    });
    expect(requestMocks.get).toHaveBeenNthCalledWith(
      1,
      '/fdmproduct/selection/page',
      { params: { companyId: '9007199254740001', pageNo: 2, pageSize: 20 } },
    );
    expect(requestMocks.get).toHaveBeenNthCalledWith(
      2,
      '/fdmproduct/selection/get',
      { params: { companyId: '9007199254740001', skuId: '9007199254740002' } },
    );
    expect(requestMocks.post).toHaveBeenCalledWith(
      '/fdmproduct/selection/validate',
      {
        companyId: '9007199254740001',
        skuId: '9007199254740002',
        versionToken: 'PC1.1.2.3.4',
      },
    );
  });
});
