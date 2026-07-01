import type { PageParam, PageResult } from '@vben/request';

import { requestClient } from '#/api/request';

export namespace FdmPerformanceIndicatorApi {
  export interface Indicator {
    id?: number;
    name?: string;
    standard?: string;
    sourceType?: number;
    status?: number;
    remark?: string;
    tagIds?: number[];
    createTime?: string;
    updateTime?: string;
  }

  export type IndicatorPageParams = PageParam & {
    createTime?: string[];
    name?: string;
    status?: number;
    tagId?: number;
  };

  export interface IndicatorSaveReq {
    id?: number;
    name: string;
    remark?: string;
    sourceType?: number;
    standard?: string;
    status?: number;
    tagIds?: number[];
  }

  export interface IndicatorTag {
    id?: number;
    name?: string;
    tagType?: number;
    bindRefId?: number;
    status?: number;
    sort?: number;
    remark?: string;
    createTime?: string;
    updateTime?: string;
  }

  export interface IndicatorTagListParams {
    bindRefId?: number;
    name?: string;
    status?: number;
    tagType?: number;
  }

  export interface IndicatorTagSaveReq {
    bindRefId?: number;
    id?: number;
    name: string;
    remark?: string;
    sort?: number;
    status?: number;
    tagType?: number;
  }
}

export function getFdmPerformanceIndicatorPage(
  params: FdmPerformanceIndicatorApi.IndicatorPageParams,
) {
  return requestClient.get<PageResult<FdmPerformanceIndicatorApi.Indicator>>(
    '/fdmperformance/indicator/page',
    { params },
  );
}

export function getFdmPerformanceIndicator(id: number) {
  return requestClient.get<FdmPerformanceIndicatorApi.Indicator>(
    `/fdmperformance/indicator/get?id=${id}`,
  );
}

export function createFdmPerformanceIndicator(
  data: FdmPerformanceIndicatorApi.IndicatorSaveReq,
) {
  return requestClient.post<number>('/fdmperformance/indicator/create', data);
}

export function updateFdmPerformanceIndicator(
  data: FdmPerformanceIndicatorApi.IndicatorSaveReq,
) {
  return requestClient.put<boolean>('/fdmperformance/indicator/update', data);
}

export function deleteFdmPerformanceIndicator(id: number) {
  return requestClient.delete<boolean>(`/fdmperformance/indicator/delete?id=${id}`);
}

export function getFdmPerformanceIndicatorTagList(
  params?: FdmPerformanceIndicatorApi.IndicatorTagListParams,
) {
  return requestClient.get<FdmPerformanceIndicatorApi.IndicatorTag[]>(
    '/fdmperformance/indicator-tag/list',
    { params },
  );
}

export function getFdmPerformanceIndicatorTag(id: number) {
  return requestClient.get<FdmPerformanceIndicatorApi.IndicatorTag>(
    `/fdmperformance/indicator-tag/get?id=${id}`,
  );
}

export function createFdmPerformanceIndicatorTag(
  data: FdmPerformanceIndicatorApi.IndicatorTagSaveReq,
) {
  return requestClient.post<number>('/fdmperformance/indicator-tag/create', data);
}

export function updateFdmPerformanceIndicatorTag(
  data: FdmPerformanceIndicatorApi.IndicatorTagSaveReq,
) {
  return requestClient.put<boolean>('/fdmperformance/indicator-tag/update', data);
}

export function deleteFdmPerformanceIndicatorTag(id: number) {
  return requestClient.delete<boolean>(
    `/fdmperformance/indicator-tag/delete?id=${id}`,
  );
}
