import type { PageParam, PageResult } from '@vben/request';

import { requestClient } from '#/api/request';

export namespace FdmdataPatternDesignItemApi {
  export interface PatternDesignItem {
    id?: number;
    orderNo?: string;
    shopName?: string;
    itemNo?: string;
    designImageUrl?: string;
    previewImageUrl?: string;
    productSpec?: string;
    quantity?: number;
    orderDate?: string;
    importSequence?: number;
    followUser?: string;
    productionSent?: number;
    status?: number;
    remark?: string;
    createTime?: string;
    updateTime?: string;
  }

  export interface BatchCreateItem {
    designImageUrl: string;
    previewImageUrl?: string;
    productSpec?: string;
    quantity: number;
    remark?: string;
  }

  export interface BatchCreateReq {
    orderNo: string;
    shopName?: string;
    orderDate?: string;
    importSequence?: number;
    followUser?: string;
    productionSent?: number;
    status?: number;
    remark?: string;
    items: BatchCreateItem[];
  }

  export interface ShopNameOptionsParams {
    keyword?: string;
    limit?: number;
  }
}

export function getFdmdataPatternDesignItemPage(params: PageParam) {
  return requestClient.get<
    PageResult<FdmdataPatternDesignItemApi.PatternDesignItem>
  >('/fdmdata/pattern/design-item/page', { params });
}

export function getFdmdataPatternDesignItem(id: number) {
  return requestClient.get<FdmdataPatternDesignItemApi.PatternDesignItem>(
    `/fdmdata/pattern/design-item/get?id=${id}`,
  );
}

export function createFdmdataPatternDesignItem(
  data: FdmdataPatternDesignItemApi.PatternDesignItem,
) {
  return requestClient.post<number>('/fdmdata/pattern/design-item/create', data);
}

export function createFdmdataPatternDesignItemBatch(
  data: FdmdataPatternDesignItemApi.BatchCreateReq,
) {
  return requestClient.post<number[]>(
    '/fdmdata/pattern/design-item/create-batch',
    data,
  );
}

export function updateFdmdataPatternDesignItem(
  data: FdmdataPatternDesignItemApi.PatternDesignItem,
) {
  return requestClient.put<boolean>('/fdmdata/pattern/design-item/update', data);
}

export function deleteFdmdataPatternDesignItem(id: number) {
  return requestClient.delete<boolean>(
    `/fdmdata/pattern/design-item/delete?id=${id}`,
  );
}

export function exportFdmdataPatternDesignItemExcel(
  params: Record<string, unknown>,
) {
  return requestClient.download('/fdmdata/pattern/design-item/export-excel', {
    params,
  });
}

export function getFdmdataPatternDesignItemShopNameOptions(
  params: FdmdataPatternDesignItemApi.ShopNameOptionsParams = {},
) {
  return requestClient.get<string[]>(
    '/fdmdata/pattern/design-item/shop-name-options',
    { params },
  );
}
