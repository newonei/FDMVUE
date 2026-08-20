import type { PageParam, PageResult } from '@vben/request';

import { requestClient } from '#/api/request';

export namespace FdmNeimaoCrmReceivablePlanApi {
  /** 回款计划信息 */
  export interface Plan {
    id: number;
    period: number;
    receivableId: number;
    price: number;
    returnTime: Date;
    remindDays: number;
    returnType: number;
    remindTime: Date;
    customerId: number;
    customerName?: string;
    contractId?: number;
    contractNo?: string;
    ownerUserId: number;
    ownerUserName?: string;
    remark: string;
    creator: string;
    creatorName?: string;
    createTime: Date;
    updateTime: Date;
    receivable?: {
      price: number;
      returnTime: Date;
    };
  }
  export interface PlanPageParam extends PageParam {
    customerId?: number;
    contractId?: number;
  }
}

/** 查询回款计划列表 */
export function getReceivablePlanPage(params: PageParam) {
  return requestClient.get<PageResult<FdmNeimaoCrmReceivablePlanApi.Plan>>(
    '/fdmneimaocrm/receivable-plan/page',
    { params },
  );
}

/** 查询回款计划列表(按客户) */
export function getReceivablePlanPageByCustomer(params: PageParam) {
  return requestClient.get<PageResult<FdmNeimaoCrmReceivablePlanApi.Plan>>(
    '/fdmneimaocrm/receivable-plan/page-by-customer',
    { params },
  );
}

/** 查询回款计划详情 */
export function getReceivablePlan(id: number) {
  return requestClient.get<FdmNeimaoCrmReceivablePlanApi.Plan>(
    '/fdmneimaocrm/receivable-plan/get',
    { params: { id } },
  );
}

/** 查询回款计划下拉数据 */
export function getReceivablePlanSimpleList(
  customerId: number,
  contractId: number,
) {
  return requestClient.get<FdmNeimaoCrmReceivablePlanApi.Plan[]>(
    '/fdmneimaocrm/receivable-plan/simple-list',
    {
      params: { customerId, contractId },
    },
  );
}

/** 新增回款计划 */
export function createReceivablePlan(data: FdmNeimaoCrmReceivablePlanApi.Plan) {
  return requestClient.post('/fdmneimaocrm/receivable-plan/create', data);
}

/** 修改回款计划 */
export function updateReceivablePlan(data: FdmNeimaoCrmReceivablePlanApi.Plan) {
  return requestClient.put('/fdmneimaocrm/receivable-plan/update', data);
}

/** 删除回款计划 */
export function deleteReceivablePlan(id: number) {
  return requestClient.delete('/fdmneimaocrm/receivable-plan/delete', {
    params: { id },
  });
}

/** 导出回款计划 Excel */
export function exportReceivablePlan(params: any) {
  return requestClient.download('/fdmneimaocrm/receivable-plan/export-excel', {
    params,
  });
}

/** 获得待回款提醒数量 */
export function getReceivablePlanRemindCount() {
  return requestClient.get<number>(
    '/fdmneimaocrm/receivable-plan/remind-count',
  );
}
