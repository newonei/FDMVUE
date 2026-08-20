import type { PageParam, PageResult } from '@vben/request';

import type { FdmWaimaoCrmPermissionApi } from '#/api/fdmwaimaocrm/permission';

import { requestClient } from '#/api/request';

export namespace FdmWaimaoCrmBusinessApi {
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
  return requestClient.get<PageResult<FdmWaimaoCrmBusinessApi.Business>>(
    '/fdmwaimaocrm/business/page',
    { params },
  );
}

/** 查询商机列表，基于指定客户 */
export function getBusinessPageByCustomer(params: PageParam) {
  return requestClient.get<PageResult<FdmWaimaoCrmBusinessApi.Business>>(
    '/fdmwaimaocrm/business/page-by-customer',
    { params },
  );
}

/** 查询商机详情 */
export function getBusiness(id: number) {
  return requestClient.get<FdmWaimaoCrmBusinessApi.Business>(
    `/fdmwaimaocrm/business/get?id=${id}`,
  );
}

/** 获得商机列表（精简） */
export function getSimpleBusinessList() {
  return requestClient.get<FdmWaimaoCrmBusinessApi.Business[]>(
    '/fdmwaimaocrm/business/simple-all-list',
  );
}

/** 新增商机 */
export function createBusiness(data: FdmWaimaoCrmBusinessApi.Business) {
  return requestClient.post('/fdmwaimaocrm/business/create', data);
}

/** 修改商机 */
export function updateBusiness(data: FdmWaimaoCrmBusinessApi.Business) {
  return requestClient.put('/fdmwaimaocrm/business/update', data);
}

/** 修改商机状态 */
export function updateBusinessStatus(
  data: FdmWaimaoCrmBusinessApi.BusinessUpdateStatusReqVO,
) {
  return requestClient.put('/fdmwaimaocrm/business/update-status', data);
}

/** 删除商机 */
export function deleteBusiness(id: number) {
  return requestClient.delete(`/fdmwaimaocrm/business/delete?id=${id}`);
}

/** 导出商机 */
export function exportBusiness(params: any) {
  return requestClient.download('/fdmwaimaocrm/business/export-excel', {
    params,
  });
}

/** 联系人关联商机列表 */
export function getBusinessPageByContact(params: PageParam) {
  return requestClient.get<PageResult<FdmWaimaoCrmBusinessApi.Business>>(
    '/fdmwaimaocrm/business/page-by-contact',
    { params },
  );
}

/** 商机转移 */
export function transferBusiness(
  data: FdmWaimaoCrmPermissionApi.BusinessTransferReqVO,
) {
  return requestClient.put('/fdmwaimaocrm/business/transfer', data);
}
