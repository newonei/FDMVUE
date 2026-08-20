import type { PageParam, PageResult } from '@vben/request';

import type { FdmNeimaoCrmPermissionApi } from '#/api/fdmneimaocrm/permission';

import { requestClient } from '#/api/request';

export namespace FdmNeimaoCrmBusinessApi {
  /** 商机信息 */
  export interface Business {
    id: number;
    name: string;
    customerId: number;
    customerName?: string;
    followUpStatus: boolean;
    contactLastTime: Date;
    contactNextTime: Date;
    ownerUserId: number;
    ownerUserName?: string; // 负责人的用户名称
    ownerUserDept?: string; // 负责人的部门名称
    statusTypeId: number;
    statusTypeName?: string;
    statusId: number;
    statusName?: string;
    endStatus: number;
    endRemark: string;
    dealTime: Date;
    totalProductPrice: number;
    totalPrice: number;
    discountPercent: number;
    status?: number;
    remark: string;
    creator: string; // 创建人
    creatorName?: string; // 创建人名称
    createTime: Date; // 创建时间
    updateTime: Date; // 更新时间
    products?: BusinessProduct[];
  }

  /** 商机产品信息 */
  export interface BusinessProduct {
    id: number;
    productId: number;
    productName: string;
    productNo: string;
    productUnit: number;
    productPrice: number;
    businessPrice: number;
    count: number;
    totalPrice: number;
  }

  /** 商机更新状态请求 */
  export interface BusinessUpdateStatusReqVO {
    id: number;
    statusId: number | undefined;
    endStatus: number | undefined;
  }
}

/** 查询商机列表 */
export function getBusinessPage(params: PageParam) {
  return requestClient.get<PageResult<FdmNeimaoCrmBusinessApi.Business>>(
    '/fdmneimaocrm/business/page',
    { params },
  );
}

/** 查询商机列表，基于指定客户 */
export function getBusinessPageByCustomer(params: PageParam) {
  return requestClient.get<PageResult<FdmNeimaoCrmBusinessApi.Business>>(
    '/fdmneimaocrm/business/page-by-customer',
    { params },
  );
}

/** 查询商机详情 */
export function getBusiness(id: number) {
  return requestClient.get<FdmNeimaoCrmBusinessApi.Business>(
    `/fdmneimaocrm/business/get?id=${id}`,
  );
}

/** 获得商机列表（精简） */
export function getSimpleBusinessList() {
  return requestClient.get<FdmNeimaoCrmBusinessApi.Business[]>(
    '/fdmneimaocrm/business/simple-all-list',
  );
}

/** 新增商机 */
export function createBusiness(data: FdmNeimaoCrmBusinessApi.Business) {
  return requestClient.post('/fdmneimaocrm/business/create', data);
}

/** 修改商机 */
export function updateBusiness(data: FdmNeimaoCrmBusinessApi.Business) {
  return requestClient.put('/fdmneimaocrm/business/update', data);
}

/** 修改商机状态 */
export function updateBusinessStatus(
  data: FdmNeimaoCrmBusinessApi.BusinessUpdateStatusReqVO,
) {
  return requestClient.put('/fdmneimaocrm/business/update-status', data);
}

/** 删除商机 */
export function deleteBusiness(id: number) {
  return requestClient.delete(`/fdmneimaocrm/business/delete?id=${id}`);
}

/** 导出商机 */
export function exportBusiness(params: any) {
  return requestClient.download('/fdmneimaocrm/business/export-excel', {
    params,
  });
}

/** 联系人关联商机列表 */
export function getBusinessPageByContact(params: PageParam) {
  return requestClient.get<PageResult<FdmNeimaoCrmBusinessApi.Business>>(
    '/fdmneimaocrm/business/page-by-contact',
    { params },
  );
}

/** 商机转移 */
export function transferBusiness(
  data: FdmNeimaoCrmPermissionApi.BusinessTransferReqVO,
) {
  return requestClient.put('/fdmneimaocrm/business/transfer', data);
}
