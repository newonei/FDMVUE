import type { PageParam, PageResult } from '@vben/request';

import { requestClient } from '#/api/request';

export namespace FdmdataExpressReconBatchApi {
  export interface ExpressReconBatch {
    id?: number;
    periodId?: number;
    batchNo?: string;
    batchName?: string;
    carrierCode?: string;
    carrierName?: string;
    templateId?: number;
    billMonth?: string;
    orderFileName?: string;
    billFileName?: string;
    status?: string;
    totalWaybillCount?: number;
    matchedCount?: number;
    onlyOrderCount?: number;
    onlyBillCount?: number;
    provinceMismatchCount?: number;
    ruleMissingCount?: number;
    diffCount?: number;
    estimatedAmount?: number;
    actualAmount?: number;
    diffAmount?: number;
    remark?: string;
    createTime?: string;
  }

  export interface ImportResult {
    batchId: number;
    batchNo: string;
    status?: string;
    orderRows: number;
    billRows: number;
    totalWaybillCount: number;
    matchedCount: number;
    diffCount: number;
    diffAmount: number;
  }

  export interface ReconcileParams {
    periodId: number;
    billFile: File;
    templateId?: number;
    batchName?: string;
  }
}

export function getExpressReconBatchPage(params: PageParam) {
  return requestClient.get<
    PageResult<FdmdataExpressReconBatchApi.ExpressReconBatch>
  >('/fdmdata/express-recon-batch/page', { params });
}

export function getExpressReconBatch(id: number) {
  return requestClient.get<FdmdataExpressReconBatchApi.ExpressReconBatch>(
    `/fdmdata/express-recon-batch/get?id=${id}`,
  );
}

export function deleteExpressReconBatch(id: number) {
  return requestClient.delete<boolean>(
    `/fdmdata/express-recon-batch/delete?id=${id}`,
  );
}

export function reconcileCarrierExpress(
  params: FdmdataExpressReconBatchApi.ReconcileParams,
) {
  const formData = new FormData();
  formData.append('periodId', String(params.periodId));
  formData.append('billFile', params.billFile);
  if (params.templateId !== undefined)
    formData.append('templateId', String(params.templateId));
  if (params.batchName) formData.append('batchName', params.batchName);
  return requestClient.post<FdmdataExpressReconBatchApi.ImportResult>(
    '/fdmdata/express-recon-batch/reconcile',
    formData,
    { headers: { 'Content-Type': 'multipart/form-data' } },
  );
}

export function recalculateExpressReconBatch(batchId: number, templateId?: number) {
  const formData = new FormData();
  formData.append('batchId', String(batchId));
  if (templateId !== undefined) formData.append('templateId', String(templateId));
  return requestClient.post<FdmdataExpressReconBatchApi.ImportResult>(
    '/fdmdata/express-recon-batch/recalculate',
    formData,
    { headers: { 'Content-Type': 'multipart/form-data' } },
  );
}

export function exportExpressReconBatchExcel(params: Record<string, unknown>) {
  return requestClient.download('/fdmdata/express-recon-batch/export-excel', {
    params,
  });
}

export function downloadExpressBillTemplate() {
  return requestClient.download('/fdmdata/express-recon-batch/bill-template');
}
