import type { PageParam, PageResult } from '@vben/request';

import { requestClient } from '#/api/request';

export namespace FdmdataExpressReconPeriodApi {
  export interface ExpressReconPeriod {
    id?: number;
    periodNo?: string;
    periodName?: string;
    billMonth?: string;
    orderMonth?: string;
    orderFileName?: string;
    status?: string;
    orderCount?: number;
    carrierCount?: number;
    reconciledWaybillCount?: number;
    unreconciledWaybillCount?: number;
    remark?: string;
    createTime?: string;
  }

  export interface ImportOrdersResult {
    periodId: number;
    periodNo: string;
    orderMonth?: string;
    status?: string;
  }

  export interface ImportOrdersParams {
    orderFile: File;
    periodName?: string;
    orderMonth?: string;
  }

  export interface UnreconciledWaybill {
    waybillNo?: string;
    shopName?: string;
    provinceName?: string;
    expressCompany?: string;
    internalOrderNo?: string;
    onlineOrderNo?: string;
    orderLineCount?: number;
    estimatedWeight?: number;
  }
}

export function getExpressReconPeriodPage(params: PageParam) {
  return requestClient.get<
    PageResult<FdmdataExpressReconPeriodApi.ExpressReconPeriod>
  >('/fdmdata/express-recon-period/page', { params });
}

export function getExpressReconPeriod(id: number) {
  return requestClient.get<FdmdataExpressReconPeriodApi.ExpressReconPeriod>(
    `/fdmdata/express-recon-period/get?id=${id}`,
  );
}

export function deleteExpressReconPeriod(id: number) {
  return requestClient.delete<boolean>(
    `/fdmdata/express-recon-period/delete?id=${id}`,
  );
}

export function importExpressReconOrders(
  params: FdmdataExpressReconPeriodApi.ImportOrdersParams,
) {
  const formData = new FormData();
  formData.append('orderFile', params.orderFile);
  if (params.periodName) formData.append('periodName', params.periodName);
  if (params.orderMonth) formData.append('orderMonth', params.orderMonth);
  return requestClient.post<FdmdataExpressReconPeriodApi.ImportOrdersResult>(
    '/fdmdata/express-recon-period/import-orders',
    formData,
    { headers: { 'Content-Type': 'multipart/form-data' } },
  );
}

export function getUnreconciledWaybills(periodId: number) {
  return requestClient.get<FdmdataExpressReconPeriodApi.UnreconciledWaybill[]>(
    '/fdmdata/express-recon-period/unreconciled-waybills',
    { params: { periodId } },
  );
}

export function exportUnreconciledWaybillsExcel(periodId: number) {
  return requestClient.download(
    '/fdmdata/express-recon-period/export-unreconciled-excel',
    { params: { periodId } },
  );
}
