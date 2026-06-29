import type { PageParam, PageResult } from '@vben/request';

import type { AxiosProgressEvent } from '#/api/infra/file';

import { requestClient } from '#/api/request';

const DESIGN_IMAGE_UPLOAD_TIMEOUT = 30 * 60 * 1000;

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
    orderDate?: number | string;
    importSequence?: number;
    followUser?: string;
    productionSent?: number;
    recognitionStatus?: number;
    downloaded?: number;
    status?: number;
    remark?: string;
    orderItemCount?: number;
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
    orderDate?: number | string;
    importSequence?: number;
    followUser?: string;
    productionSent?: number;
    recognitionStatus?: number;
    downloaded?: number;
    status?: number;
    remark?: string;
    items: BatchCreateItem[];
  }

  export interface ShopNameOptionsParams {
    keyword?: string;
    limit?: number;
  }

  export interface UploadResp {
    designImageUrl: string;
    previewImageUrl: string;
  }
}

function toOrderDateTimestamp(value: number | string | undefined) {
  if (value === undefined || value === '') return undefined;
  if (typeof value === 'number') return value;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (/^\d+$/.test(trimmed)) return Number(trimmed);
  const matched = trimmed.match(
    /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/,
  );
  if (!matched) return undefined;
  const [, year, month, day, hour = '0', minute = '0', second = '0'] = matched;
  return new Date(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second),
  ).getTime();
}

function normalizeOrderDate<T extends { orderDate?: number | string }>(
  data: T,
) {
  return {
    ...data,
    orderDate: toOrderDateTimestamp(data.orderDate),
  };
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

export function uploadFdmdataPatternDesignItemDesignImage(
  file: File,
  onUploadProgress?: AxiosProgressEvent,
) {
  return requestClient.upload<FdmdataPatternDesignItemApi.UploadResp>(
    '/fdmdata/pattern/design-item/upload-design-image',
    { file },
    {
      onUploadProgress,
      timeout: DESIGN_IMAGE_UPLOAD_TIMEOUT,
    },
  );
}

export function createFdmdataPatternDesignItem(
  data: FdmdataPatternDesignItemApi.PatternDesignItem,
) {
  return requestClient.post<number>(
    '/fdmdata/pattern/design-item/create',
    normalizeOrderDate(data),
  );
}

export function createFdmdataPatternDesignItemBatch(
  data: FdmdataPatternDesignItemApi.BatchCreateReq,
) {
  return requestClient.post<number[]>(
    '/fdmdata/pattern/design-item/create-batch',
    normalizeOrderDate(data),
  );
}

export function updateFdmdataPatternDesignItem(
  data: FdmdataPatternDesignItemApi.PatternDesignItem,
) {
  return requestClient.put<boolean>(
    '/fdmdata/pattern/design-item/update',
    normalizeOrderDate(data),
  );
}

export function markFdmdataPatternDesignItemDownloaded(ids: number[]) {
  return requestClient.put<boolean>(
    '/fdmdata/pattern/design-item/mark-downloaded',
    { ids },
  );
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
