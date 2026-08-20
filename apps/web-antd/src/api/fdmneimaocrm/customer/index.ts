import type { PageParam, PageResult } from '@vben/request';

import type { FdmNeimaoCrmPermissionApi } from '#/api/fdmneimaocrm/permission';

import { requestClient } from '#/api/request';

export namespace FdmNeimaoCrmCustomerApi {
  /** 客户信息 */
  export interface Customer {
    id: number; // 编号
    name: string; // 客户名称
    followUpStatus: boolean; // 跟进状态
    contactLastTime: Date; // 最后跟进时间
    contactLastContent: string; // 最后跟进内容
    contactNextTime: Date; // 下次联系时间
    ownerUserId: number; // 负责人的用户编号
    ownerUserName?: string; // 负责人的用户名称
    ownerUserDept?: string; // 负责人的部门名称
    ownerUserDeptName?: string; // 负责人的部门名称
    lockStatus?: boolean;
    dealStatus?: boolean;
    mobile: string; // 手机号
    telephone: string; // 电话
    qq: string; // QQ
    wechat: string; // wechat
    email: string; // email
    areaId: number; // 所在地
    areaName?: string; // 所在地名称
    detailAddress: string; // 详细地址
    industryId: number; // 所属行业
    level: number; // 客户等级
    source: number; // 客户来源
    remark: string; // 备注
    creator: string; // 创建人
    creatorName?: string; // 创建人名称
    createTime: Date; // 创建时间
    updateTime: Date; // 更新时间
    poolDay?: number; // 距离进入公海天数
  }

  /** 客户导入请求 */
  export interface CustomerImportReqVO {
    ownerUserId: number;
    file: File;
    updateSupport: boolean;
  }
}

/** 查询客户列表 */
export function getCustomerPage(params: PageParam) {
  return requestClient.get<PageResult<FdmNeimaoCrmCustomerApi.Customer>>(
    '/fdmneimaocrm/customer/page',
    { params },
  );
}

/** 查询客户详情 */
export function getCustomer(id: number) {
  return requestClient.get<FdmNeimaoCrmCustomerApi.Customer>(
    `/fdmneimaocrm/customer/get?id=${id}`,
  );
}

/** 新增客户 */
export function createCustomer(data: FdmNeimaoCrmCustomerApi.Customer) {
  return requestClient.post('/fdmneimaocrm/customer/create', data);
}

/** 修改客户 */
export function updateCustomer(data: FdmNeimaoCrmCustomerApi.Customer) {
  return requestClient.put('/fdmneimaocrm/customer/update', data);
}

/** 删除客户 */
export function deleteCustomer(id: number) {
  return requestClient.delete(`/fdmneimaocrm/customer/delete?id=${id}`);
}

/** 导出客户 */
export function exportCustomer(params: any) {
  return requestClient.download('/fdmneimaocrm/customer/export-excel', {
    params,
  });
}

/** 下载客户导入模板 */
export function importCustomerTemplate() {
  return requestClient.download('/fdmneimaocrm/customer/get-import-template');
}

/** 导入客户 */
export function importCustomer(
  data: FdmNeimaoCrmCustomerApi.CustomerImportReqVO,
) {
  return requestClient.upload('/fdmneimaocrm/customer/import', data);
}

/** 获取客户精简信息列表 */
export function getCustomerSimpleList() {
  return requestClient.get<FdmNeimaoCrmCustomerApi.Customer[]>(
    '/fdmneimaocrm/customer/simple-list',
  );
}

/** 客户转移 */
export function transferCustomer(
  data: FdmNeimaoCrmPermissionApi.BusinessTransferReqVO,
) {
  return requestClient.put('/fdmneimaocrm/customer/transfer', data);
}

/** 锁定/解锁客户 */
export function lockCustomer(id: number, lockStatus: boolean) {
  return requestClient.put('/fdmneimaocrm/customer/lock', { id, lockStatus });
}

/** 领取公海客户 */
export function receiveCustomer(ids: number[]) {
  return requestClient.put('/fdmneimaocrm/customer/receive', {
    ids: ids.join(','),
  });
}

/** 分配公海给对应负责人 */
export function distributeCustomer(ids: number[], ownerUserId: number) {
  return requestClient.put('/fdmneimaocrm/customer/distribute', {
    ids,
    ownerUserId,
  });
}

/** 客户放入公海 */
export function putCustomerPool(id: number) {
  return requestClient.put(`/fdmneimaocrm/customer/put-pool?id=${id}`);
}

/** 更新客户的成交状态 */
export function updateCustomerDealStatus(id: number, dealStatus: boolean) {
  return requestClient.put(
    `/fdmneimaocrm/customer/update-deal-status?id=${id}&dealStatus=${dealStatus}`,
  );
}

/** 进入公海客户提醒的客户列表 */
export function getPutPoolRemindCustomerPage(params: PageParam) {
  return requestClient.get<PageResult<FdmNeimaoCrmCustomerApi.Customer>>(
    '/fdmneimaocrm/customer/put-pool-remind-page',
    { params },
  );
}

/** 获得待进入公海客户数量 */
export function getPutPoolRemindCustomerCount() {
  return requestClient.get<number>(
    '/fdmneimaocrm/customer/put-pool-remind-count',
  );
}

/** 获得今日需联系客户数量 */
export function getTodayContactCustomerCount() {
  return requestClient.get<number>(
    '/fdmneimaocrm/customer/today-contact-count',
  );
}

/** 获得分配给我、待跟进的线索数量的客户数量 */
export function getFollowCustomerCount() {
  return requestClient.get<number>('/fdmneimaocrm/customer/follow-count');
}
