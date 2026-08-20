import type { PageParam, PageResult } from '@vben/request';

import type { FdmWaimaoCrmPermissionApi } from '#/api/fdmwaimaocrm/permission';

import { requestClient } from '#/api/request';

export namespace FdmWaimaoCrmContractApi {
  /** 合同信息 */
  export interface Contract {
    id: number;
    name: string;
    no: string;
    customerId: number;
    customerName?: string;
    businessId: number;
    businessName: string;
    contactLastTime: Date;
    ownerUserId: number;
    ownerUserName?: string;
    ownerUserDeptName?: string;
    processInstanceId: number;
    auditStatus: number;
    orderDate: Date;
    startTime: Date;
    endTime: Date;
    totalProductPrice: number;
    discountPercent: number;
    totalPrice: number;
    totalReceivablePrice: number;
    signContactId: number;
    signContactName?: string;
    signUserId: number;
    signUserName: string;
    remark: string;
    createTime?: Date;
    creator: string;
    creatorName: string;
    updateTime?: Date;
    products?: ContractProduct[];
    contactName?: string;
  }

  /** 合同产品信息 */
  export interface ContractProduct {
    id: number;
    productId: number;
    productName: string;
    productNo: string;
    productUnit: number;
    productPrice: number;
    contractPrice: number;
    count: number;
    totalPrice: number;
  }
}

/** 查询合同列表 */
export function getContractPage(params: PageParam) {
  return requestClient.get<PageResult<FdmWaimaoCrmContractApi.Contract>>(
    '/fdmwaimaocrm/contract/page',
    { params },
  );
}

/** 查询合同列表，基于指定客户 */
export function getContractPageByCustomer(params: PageParam) {
  return requestClient.get<PageResult<FdmWaimaoCrmContractApi.Contract>>(
    '/fdmwaimaocrm/contract/page-by-customer',
    { params },
  );
}

/** 查询合同列表，基于指定商机 */
export function getContractPageByBusiness(params: PageParam) {
  return requestClient.get<PageResult<FdmWaimaoCrmContractApi.Contract>>(
    '/fdmwaimaocrm/contract/page-by-business',
    { params },
  );
}

/** 查询合同详情 */
export function getContract(id: number) {
  return requestClient.get<FdmWaimaoCrmContractApi.Contract>(
    `/fdmwaimaocrm/contract/get?id=${id}`,
  );
}

/** 查询合同下拉列表 */
export function getContractSimpleList(customerId: number) {
  return requestClient.get<FdmWaimaoCrmContractApi.Contract[]>(
    `/fdmwaimaocrm/contract/simple-list?customerId=${customerId}`,
  );
}

/** 新增合同 */
export function createContract(data: FdmWaimaoCrmContractApi.Contract) {
  return requestClient.post('/fdmwaimaocrm/contract/create', data);
}

/** 修改合同 */
export function updateContract(data: FdmWaimaoCrmContractApi.Contract) {
  return requestClient.put('/fdmwaimaocrm/contract/update', data);
}

/** 删除合同 */
export function deleteContract(id: number) {
  return requestClient.delete(`/fdmwaimaocrm/contract/delete?id=${id}`);
}

/** 导出合同 */
export function exportContract(params: any) {
  return requestClient.download('/fdmwaimaocrm/contract/export-excel', {
    params,
  });
}

/** 提交审核 */
export function submitContract(id: number) {
  return requestClient.put(`/fdmwaimaocrm/contract/submit?id=${id}`);
}

/** 合同转移 */
export function transferContract(
  data: FdmWaimaoCrmPermissionApi.BusinessTransferReqVO,
) {
  return requestClient.put('/fdmwaimaocrm/contract/transfer', data);
}

/** 获得待审核合同数量 */
export function getAuditContractCount() {
  return requestClient.get<number>('/fdmwaimaocrm/contract/audit-count');
}

/** 获得即将到期（提醒）的合同数量 */
export function getRemindContractCount() {
  return requestClient.get<number>('/fdmwaimaocrm/contract/remind-count');
}
