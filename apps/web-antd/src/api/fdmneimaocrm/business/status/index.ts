import type { PageParam, PageResult } from '@vben/request';

import { requestClient } from '#/api/request';

export namespace FdmNeimaoCrmBusinessStatusApi {
  /** 商机状态组信息 */
  export interface BusinessStatus {
    id?: number;
    name: string;
    deptIds?: number[];
    deptNames?: string[];
    creator?: string;
    createTime?: Date;
    statuses: BusinessStatusType[];
  }

  /** 商机状态信息 */
  export interface BusinessStatusType {
    id?: number;
    name: string;
    percent?: number;
    endStatus?: number;
    key?: string;
  }
}

/** 默认商机状态 */
export const DEFAULT_STATUSES = [
  {
    endStatus: 1,
    key: '结束',
    name: '赢单',
    percent: 100,
  },
  {
    endStatus: 2,
    key: '结束',
    name: '输单',
    percent: 0,
  },
  {
    endStatus: 3,
    key: '结束',
    name: '无效',
    percent: 0,
  },
] satisfies FdmNeimaoCrmBusinessStatusApi.BusinessStatusType[];

/** 查询商机状态组列表 */
export function getBusinessStatusPage(params: PageParam) {
  return requestClient.get<
    PageResult<FdmNeimaoCrmBusinessStatusApi.BusinessStatus>
  >('/fdmneimaocrm/business-status/page', { params });
}

/** 新增商机状态组 */
export function createBusinessStatus(
  data: FdmNeimaoCrmBusinessStatusApi.BusinessStatus,
) {
  return requestClient.post('/fdmneimaocrm/business-status/create', data);
}

/** 修改商机状态组 */
export function updateBusinessStatus(
  data: FdmNeimaoCrmBusinessStatusApi.BusinessStatus,
) {
  return requestClient.put('/fdmneimaocrm/business-status/update', data);
}

/** 查询商机状态类型详情 */
export function getBusinessStatus(id: number) {
  return requestClient.get<FdmNeimaoCrmBusinessStatusApi.BusinessStatus>(
    `/fdmneimaocrm/business-status/get?id=${id}`,
  );
}

/** 删除商机状态 */
export function deleteBusinessStatus(id: number) {
  return requestClient.delete(`/fdmneimaocrm/business-status/delete?id=${id}`);
}

/** 获得商机状态组列表 */
export function getBusinessStatusTypeSimpleList() {
  return requestClient.get<FdmNeimaoCrmBusinessStatusApi.BusinessStatus[]>(
    '/fdmneimaocrm/business-status/type-simple-list',
  );
}

/** 获得商机阶段列表 */
export function getBusinessStatusSimpleList(typeId: number) {
  return requestClient.get<FdmNeimaoCrmBusinessStatusApi.BusinessStatusType[]>(
    '/fdmneimaocrm/business-status/status-simple-list',
    { params: { typeId } },
  );
}
