import type { PageParam, PageResult } from '@vben/request';

import type { AxiosProgressEvent } from '#/api/infra/file';

import { requestClient } from '#/api/request';

export namespace FdmdataEcInvoiceApplyApi {
  export type DateTimeValue = number | string;

  export interface EcInvoiceApply {
    id?: number;
    tid?: string;
    platformCode?: string;
    platformName?: string;
    shopName?: string;
    companyId?: number;
    shopCompanyName?: string;
    tradeLink?: string;
    invoiceCode?: string;
    invoiceNo?: string;
    invoiceId?: string;
    invoiceKind?: number;
    invoiceType?: string;
    title?: string;
    amount?: number;
    quantity?: number;
    unitPrice?: number;
    serialNo?: string;
    applySource?: string;
    startTime?: string;
    applyGmtCreate?: DateTimeValue | null;
    orderFinishTime?: DateTimeValue | null;
    invoiceDueTime?: DateTimeValue | null;
    invoiceDate?: DateTimeValue | null;
    invoiceFileUrl?: string;
    invoiceFileName?: string;
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
    rightsDueDate?: DateTimeValue | null;
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
    createTime?: DateTimeValue;
    updateTime?: DateTimeValue;
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

export function uploadEcInvoiceApplyPdf(
  id: number,
  file: File,
  onUploadProgress?: AxiosProgressEvent,
) {
  return requestClient.upload<boolean>(
    '/fdmdata/ecinvoiceapply/upload-invoice-pdf',
    { file, id },
    { onUploadProgress, timeout: 5 * 60 * 1000 },
  );
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

export function exportEcInvoiceApplyEtaxExcel(ids: number[]) {
  return requestClient.download('/fdmdata/ecinvoiceapply/export-etax-excel', {
    data: { ids },
    method: 'POST',
  });
}

export function downloadEcInvoiceApplyPdfZip(ids: number[]) {
  return requestClient.download(
    '/fdmdata/ecinvoiceapply/download-invoice-pdfs',
    {
      data: { ids },
      method: 'POST',
      timeout: 5 * 60 * 1000,
    },
  );
}
