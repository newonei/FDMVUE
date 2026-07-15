import type { PageParam, PageResult } from '@vben/request';

import { requestClient } from '#/api/request';

export namespace FdmdataDataCompanyApi {
  export interface DataCompany {
    id?: number;
    companyCode?: string;
    companyName?: string;
    companyShortName?: string;
    taxNo?: string;
    taxpayerType?: string;
    defaultTaxRate?: number;
    invoiceAddress?: string;
    invoicePhone?: string;
    bankName?: string;
    bankAccount?: string;
    enabled?: number;
    remark?: string;
    createTime?: string;
    updateTime?: string;
  }
}

export function getDataCompanyPage(params: PageParam) {
  return requestClient.get<PageResult<FdmdataDataCompanyApi.DataCompany>>(
    '/fdmdata/data-company/page',
    { params },
  );
}

export function getDataCompany(id: number) {
  return requestClient.get<FdmdataDataCompanyApi.DataCompany>(
    `/fdmdata/data-company/get?id=${id}`,
  );
}

export function getDataCompanySimpleList() {
  return requestClient.get<FdmdataDataCompanyApi.DataCompany[]>(
    '/fdmdata/data-company/simple-list',
  );
}

export function createDataCompany(
  data: FdmdataDataCompanyApi.DataCompany,
) {
  return requestClient.post<number>('/fdmdata/data-company/create', data);
}

export function updateDataCompany(
  data: FdmdataDataCompanyApi.DataCompany,
) {
  return requestClient.put<boolean>('/fdmdata/data-company/update', data);
}

export function deleteDataCompany(id: number) {
  return requestClient.delete<boolean>(
    `/fdmdata/data-company/delete?id=${id}`,
  );
}
