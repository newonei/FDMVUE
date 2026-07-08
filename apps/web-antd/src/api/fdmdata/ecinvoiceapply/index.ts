import type { PageParam, PageResult } from '@vben/request';

import { requestClient } from '#/api/request';

export namespace FdmdataEcInvoiceApplyApi {
  export interface EcInvoiceApply {
    id?: number;
    tid?: string;
    platformCode?: string;
    platformName?: string;
    shopName?: string;
    shopCompanyName?: string;
    tradeLink?: string;
    invoiceCode?: string;
    invoiceNo?: string;
    invoiceId?: string;
    invoiceKind?: number;
    invoiceType?: string;
    title?: string;
    amount?: number;
    serialNo?: string;
    applySource?: string;
    startTime?: string;
    applyGmtCreate?: string;
    orderFinishTime?: string;
    invoiceDueTime?: string;
    invoiceDate?: string;
    payerName?: string;
    payerRegisterNo?: string;
    payerPhone?: string;
    payerAddress?: string;
    payerBankAccount?: string;
    payerBank?: string;
    payerEmail?: string;
    orderPayStatus?: number;
    status?: number;
    applyStatus?: number;
    invoiceStatus?: number;
    platformStatusText?: string;
    countdownText?: string;
    failDataStatus?: number;
    delayApplyFlag?: number;
    punishFlag?: number;
    refundFlag?: number;
    rightsFlag?: number;
    printInvoiceFlag?: boolean;
    invalidInvoiceFlag?: boolean;
    xmlFileUpload?: boolean;
    xmlFileSendMessage?: boolean;
    rightsDueDate?: string;
    rightsProcessType?: number;
    businessType?: number;
    agentId?: number;
    buyerId?: string;
    buyerNick?: string;
    sellerRemark?: string;
    invoiceAmountRemark?: string;
    failedReason?: string;
    bizErrorDesc?: string;
    message?: string;
    rawJson?: string;
    createTime?: string;
    updateTime?: string;
  }
}

export function getEcInvoiceApplyPage(params: PageParam) {
  return requestClient.get<PageResult<FdmdataEcInvoiceApplyApi.EcInvoiceApply>>(
    '/fdmdata/ecinvoiceapply/page',
    { params },
  );
}

export function getEcInvoiceApply(id: number) {
  return requestClient.get<FdmdataEcInvoiceApplyApi.EcInvoiceApply>(
    `/fdmdata/ecinvoiceapply/get?id=${id}`,
  );
}

export function createEcInvoiceApply(
  data: FdmdataEcInvoiceApplyApi.EcInvoiceApply,
) {
  return requestClient.post<number>('/fdmdata/ecinvoiceapply/create', data);
}

export function createEcInvoiceApplyBatch(
  data: FdmdataEcInvoiceApplyApi.EcInvoiceApply[],
) {
  return requestClient.post<number[]>(
    '/fdmdata/ecinvoiceapply/create-batch',
    data,
  );
}

export function updateEcInvoiceApply(
  data: FdmdataEcInvoiceApplyApi.EcInvoiceApply,
) {
  return requestClient.put<boolean>('/fdmdata/ecinvoiceapply/update', data);
}

export function deleteEcInvoiceApply(id: number) {
  return requestClient.delete<boolean>(
    `/fdmdata/ecinvoiceapply/delete?id=${id}`,
  );
}

export function exportEcInvoiceApplyExcel(params: Record<string, unknown>) {
  return requestClient.download('/fdmdata/ecinvoiceapply/export-excel', {
    params,
  });
}
