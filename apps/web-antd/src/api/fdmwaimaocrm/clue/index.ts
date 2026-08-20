import type { PageParam, PageResult } from '@vben/request';

import type { FdmWaimaoCrmPermissionApi } from '#/api/fdmwaimaocrm/permission';

import { requestClient } from '#/api/request';

export namespace FdmWaimaoCrmClueApi {
  /** 线索信息 */
  export interface Clue {
    id: number; // 编号
    name: string; // 线索名称
    followUpStatus: boolean; // 跟进状态
    contactLastTime: Date; // 最后跟进时间
    contactLastContent: string; // 最后跟进内容
    contactNextTime: Date; // 下次联系时间
    ownerUserId: number; // 负责人的用户编号
    ownerUserName?: string; // 负责人的用户名称
    ownerUserDept?: string; // 负责人的部门名称
    transformStatus: boolean; // 转化状态
    customerId: number; // 客户编号
    customerName?: string; // 客户名称
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
  }
}

/** 查询线索列表 */
export function getCluePage(params: PageParam) {
  return requestClient.get<PageResult<FdmWaimaoCrmClueApi.Clue>>(
    '/fdmwaimaocrm/clue/page',
    {
      params,
    },
  );
}

/** 查询线索详情 */
export function getClue(id: number) {
  return requestClient.get<FdmWaimaoCrmClueApi.Clue>(
    `/fdmwaimaocrm/clue/get?id=${id}`,
  );
}

/** 新增线索 */
export function createClue(data: FdmWaimaoCrmClueApi.Clue) {
  return requestClient.post('/fdmwaimaocrm/clue/create', data);
}

/** 修改线索 */
export function updateClue(data: FdmWaimaoCrmClueApi.Clue) {
  return requestClient.put('/fdmwaimaocrm/clue/update', data);
}

/** 删除线索 */
export function deleteClue(id: number) {
  return requestClient.delete(`/fdmwaimaocrm/clue/delete?id=${id}`);
}

/** 导出线索 */
export function exportClue(params: any) {
  return requestClient.download('/fdmwaimaocrm/clue/export-excel', { params });
}

/** 线索转移 */
export function transferClue(
  data: FdmWaimaoCrmPermissionApi.BusinessTransferReqVO,
) {
  return requestClient.put('/fdmwaimaocrm/clue/transfer', data);
}

/** 线索转化为客户 */
export function transformClue(id: number) {
  return requestClient.put(`/fdmwaimaocrm/clue/transform?id=${id}`);
}

/** 获得分配给我的、待跟进的线索数量 */
export function getFollowClueCount() {
  return requestClient.get<number>('/fdmwaimaocrm/clue/follow-count');
}
