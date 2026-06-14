import type { PageParam, PageResult } from '@vben/request';

import { requestClient } from '#/api/request';

export namespace FdmdataExpressReconDetailApi {
  export interface ExpressReconDetail {
    id?: number;
    batchId?: number;
    templateId?: number;
    feeRuleId?: number;
    waybillNo?: string;
    shopName?: string;
    orderProvince?: string;
    billProvince?: string;
    provinceNorm?: string;
    provinceMatched?: number;
    expressCompany?: string;
    estimatedWeight?: number;
    billWeight?: number;
    estimatedAmount?: number;
    actualAmount?: number;
    diffAmount?: number;
    status?: string;
    statusMessage?: string;
    internalOrderNos?: string;
    onlineOrderNos?: string;
    orderLineCount?: number;
    billLineCount?: number;
    createTime?: string;
  }
}

export function getExpressReconDetailPage(params: PageParam) {
  return requestClient.get<
    PageResult<FdmdataExpressReconDetailApi.ExpressReconDetail>
  >('/fdmdata/express-recon-detail/page', { params });
}

export function exportExpressReconDetailExcel(params: Record<string, unknown>) {
  return requestClient.download('/fdmdata/express-recon-detail/export-excel', {
    params,
  });
}
